import base64, hmac, json, os, re, secrets, sqlite3, sys, time
from collections import defaultdict, deque
from threading import Lock, Thread
from contextlib import closing
import xml.etree.ElementTree as ElementTree
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
# Support the existing project-local Windows installation.
sys.path.insert(0, str(ROOT / '.local' / 'python'))
from flask import Flask, request, jsonify, send_file, abort
from werkzeug.exceptions import HTTPException
import mailer

os.chdir(ROOT)
MAIL_SYNC = False  # tests set this so emails are sent before the response returns
MYSQL = os.getenv('DB_ENGINE', 'sqlite') == 'mysql'
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', '')

def connect():
    if MYSQL:
        import pymysql
        return pymysql.connect(host=os.getenv('DB_HOST', '127.0.0.1'), port=int(os.getenv('DB_PORT', '3306')), user=os.getenv('DB_USER', 'rangechem'), password=os.environ['DB_PASSWORD'], database=os.getenv('DB_NAME', 'rangechem'), charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor, autocommit=False)
    db = sqlite3.connect(os.getenv('SQLITE_PATH', str(ROOT / 'data' / 'rangechem.db')), timeout=30)
    db.row_factory = sqlite3.Row
    return db

def query(db, sql, params=()):
    cursor = db.cursor()
    cursor.execute(sql.replace('?', '%s') if MYSQL else sql, params)
    return cursor

def init():
    (ROOT / 'data').mkdir(exist_ok=True)
    db = connect()
    ident = 'INTEGER PRIMARY KEY AUTO_INCREMENT' if MYSQL else 'INTEGER PRIMARY KEY AUTOINCREMENT'
    query(db, f'CREATE TABLE IF NOT EXISTS products (id {ident}, category VARCHAR(255), name VARCHAR(500), description TEXT, image TEXT, stock_code VARCHAR(255), size VARCHAR(255), tags TEXT)')
    query(db, f'CREATE TABLE IF NOT EXISTS quotes (id {ident}, created VARCHAR(40), customer TEXT, items TEXT)')
    query(db, 'CREATE TABLE IF NOT EXISTS settings (name VARCHAR(100) PRIMARY KEY, value TEXT)')
    if query(db, 'SELECT COUNT(*) AS n FROM products').fetchone()['n'] == 0:
        products = json.loads((ROOT / 'data/products.json').read_text(encoding='utf-8'))
        for p in products:
            # Workbook image paths are retained as explicit overrides when supplied.
            query(db, 'INSERT INTO products (category,name,description,image,stock_code,size,tags) VALUES (?,?,?,?,?,?,?)', tuple(p.get(k, '') for k in ('category','name','description','image','stock_code','size','tags')))
    db.commit(); db.close()

def image_for(product, files, stems=None):
    if product.get('image'): return product['image']
    code = product.get('stock_code', '').strip().lower()
    if not code: return ''
    # A bracketed code or a whole code in a filename avoids partial-code matches.
    pattern = re.compile(r'(?<![a-z0-9])' + re.escape(code) + r'(?![a-z0-9])', re.I)
    stems = stems if stems is not None else [p.stem.lower() for p in files]
    for path, stem in zip(files, stems):
        # The cheap substring test skips the regex for almost every file.
        if code in stem and pattern.search(path.stem):
            return path.relative_to(ROOT).as_posix()
    return ''


_image_cache = {'signature': None, 'files': [], 'stems': [], 'matches': {}}
_image_cache_lock = Lock()


def product_images():
    """Return the sorted image files, reusing the previous scan until the folder changes."""
    folder = ROOT / 'assets' / 'product_images'
    with _image_cache_lock:
        try:
            signature = folder.stat().st_mtime_ns if folder.exists() else None
        except OSError:
            signature = None
        if signature != _image_cache['signature'] or _image_cache['signature'] is None:
            files = sorted((p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.gif')), key=lambda p:p.name.lower()) if folder.exists() else []
            _image_cache.update(signature=signature, files=files, stems=[p.stem.lower() for p in files], matches={})
        return _image_cache['files'], _image_cache['stems'], _image_cache['matches']

app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 8_000_000
PRODUCTION = os.getenv('APP_ENV') == 'production'
PUBLIC_ORIGIN = os.getenv('PUBLIC_ORIGIN', '').rstrip('/')
limits = defaultdict(deque)
limits_lock = Lock()


def throttle(bucket, maximum, seconds):
    now = time.monotonic()
    key = (bucket, request.remote_addr)
    with limits_lock:
        # Bound memory even when requests arrive from many addresses.
        for old_key in list(limits):
            if not limits[old_key] or now - limits[old_key][-1] > 3600:
                del limits[old_key]
        if key not in limits and len(limits) >= 10000:
            abort(429, description='Please try again later.')
        queue = limits[key]
        while queue and now - queue[0] >= seconds:
            queue.popleft()
        if len(queue) >= maximum:
            abort(429, description='Too many requests. Please try again later.')
        queue.append(now)


def authorized():
    auth = request.authorization
    return bool(ADMIN_PASSWORD) and auth and auth.type == 'basic' and hmac.compare_digest(auth.username or '', 'admin') and hmac.compare_digest((auth.password or '').encode(), ADMIN_PASSWORD.encode())


@app.before_request
def protect_requests():
    if request.path in ('/api/admin', '/api/quotes', '/admin.html') or (request.method == 'POST' and request.path != '/api/quote'):
        if not authorized():
            throttle('login', 20, 300)
            return jsonify(error='Administrator sign-in required.'), 401, {'WWW-Authenticate':'Basic realm="Rangechem management", charset="UTF-8"'}
    if request.method == 'POST':
        if not request.is_json:
            abort(415, description='Send a JSON request.')
        origin = request.headers.get('Origin')
        expected = PUBLIC_ORIGIN or request.host_url.rstrip('/')
        if (origin and origin != expected) or request.headers.get('Sec-Fetch-Site') == 'cross-site':
            abort(403, description='Invalid request origin.')
    if request.path == '/api/quote' and request.method == 'POST':
        throttle('quote', 10, 600)


@app.after_request
def response_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    response.headers['Content-Security-Policy'] = "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
    if request.path.startswith('/assets/uploads/'):
        # Uploaded SVGs must never run script, even if opened directly.
        response.headers['Content-Security-Policy'] = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"
    if request.path.startswith('/api/') or request.path == '/admin.html':
        response.headers['Cache-Control'] = 'no-store'
    if PRODUCTION:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000'
    return response


@app.errorhandler(Exception)
def handle_error(error):
    if isinstance(error, HTTPException):
        return jsonify(error=error.description), error.code
    if isinstance(error, (ValueError, KeyError, TypeError)):
        return jsonify(error='Invalid request. Check the supplied fields and try again.'), 400
    app.logger.exception('Request failed')
    return jsonify(error='The request could not be completed. Please try again.'), 500


def payload():
    data = request.get_json()
    if not isinstance(data, dict):
        abort(400, description='Expected a JSON object.')
    return data


def text_field(data, key, length, required=False):
    value = data.get(key, '')
    if not isinstance(value, str) or len(value) > length or (required and not value.strip()):
        abort(400, description=f'Enter a valid {key.replace("_", " ")} (maximum {length} characters).')
    return value.strip()


def image_path(value):
    if value and not (value.startswith('assets/') and '..' not in value and '\\' not in value) and not (urlsplit(value).scheme == 'https' and urlsplit(value).netloc):
        abort(400, description='Use an assets/ image path or an HTTPS image URL.')
    return value


@app.get('/api/products')
def products():
    with closing(connect()) as db:
        result = [dict(r) for r in query(db, 'SELECT * FROM products ORDER BY name, size').fetchall()]
    files, stems, matches = product_images()
    for product in result:
        code = (product.get('stock_code') or '').strip().lower()
        if product.get('image') or not code:
            product['display_image'] = product.get('image') or ''
        else:
            if code not in matches:
                matches[code] = image_for(product, files, stems)
            product['display_image'] = matches[code]
    return jsonify(result)


@app.get('/api/settings')
def settings():
    with closing(connect()) as db:
        return jsonify({r['name']:r['value'] for r in query(db, 'SELECT * FROM settings').fetchall()})


@app.get('/api/admin')
def admin():
    return jsonify(ok=True)


@app.get('/api/quotes')
def quotes():
    with closing(connect()) as db:
        return jsonify([dict(r) for r in query(db, 'SELECT * FROM quotes ORDER BY id DESC').fetchall()])


@app.post('/api/quote')
def submit_quote():
    from datetime import datetime, timezone
    data = payload()
    customer, items = data.get('customer'), data.get('items')
    if not isinstance(customer, dict) or not isinstance(items, list) or not 1 <= len(items) <= 100:
        abort(400, description='Enter your details and between 1 and 100 quote items.')
    customer = {key:text_field(customer, key, limit, key in ('name','email')) for key, limit in [('name',200),('email',254),('phone',80),('company',200),('message',4000)]}
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', customer['email']):
        abort(400, description='Enter a valid email address.')
    clean, seen = [], set()
    with closing(connect()) as db:
        for item in items:
            if not isinstance(item, dict) or type(item.get('id')) is not int or type(item.get('quantity')) is not int or not 1 <= item['quantity'] <= 10000 or item['id'] in seen:
                abort(400, description='Invalid product or quantity.')
            product = query(db, 'SELECT id,name,stock_code,size FROM products WHERE id=?', (item['id'],)).fetchone()
            if not product:
                abort(400, description='A selected product is no longer available. Remove it and try again.')
            clean.append({**dict(product),'quantity':item['quantity']})
            seen.add(item['id'])
        created = datetime.now(timezone.utc)
        quote_id = query(db, 'INSERT INTO quotes (created,customer,items) VALUES (?,?,?)', (created.isoformat(),json.dumps(customer),json.dumps(clean))).lastrowid
        db.commit()
    # The quote is already saved; email problems never fail the request.
    emailing = mailer.config() is not None
    if emailing:
        args = (quote_id, customer, clean, created.strftime('%d %b %Y, %H:%M UTC'))
        if MAIL_SYNC: mailer.send_quote_emails(*args)
        else: Thread(target=mailer.send_quote_emails, args=args, daemon=True).start()
    return jsonify(ok=True, reference=mailer.reference(quote_id), emailed=emailing)


@app.post('/api/product')
def save_product():
    data = payload()
    fields = {'category':255,'name':500,'description':10000,'image':2000,'stock_code':255,'size':255,'tags':10000}
    values = [text_field(data, key, limit, key in ('name','category')) for key, limit in fields.items()]
    values[3] = image_path(values[3])
    with closing(connect()) as db:
        if data.get('id'):
            ident = int(data['id'])
            if not query(db, 'SELECT id FROM products WHERE id=?', (ident,)).fetchone():
                abort(404, description='Product not found.')
            query(db, 'UPDATE products SET category=?,name=?,description=?,image=?,stock_code=?,size=?,tags=? WHERE id=?', (*values,ident))
        else:
            ident = query(db, 'INSERT INTO products (category,name,description,image,stock_code,size,tags) VALUES (?,?,?,?,?,?,?)', values).lastrowid
        db.commit()
    return jsonify(ok=True, id=ident)


@app.post('/api/delete-product')
def delete_product():
    data = payload()
    with closing(connect()) as db:
        query(db, 'DELETE FROM products WHERE id=?', (int(data['id']),))
        db.commit()
    return jsonify(ok=True)


@app.post('/api/settings')
def save_settings():
    data = payload()
    with closing(connect()) as db:
        for key in ('hero_image','hero_title','hero_text'):
            if key in data:
                value = text_field(data, key, 2000)
                if key == 'hero_image': value = image_path(value)
                query(db, 'DELETE FROM settings WHERE name=?', (key,))
                query(db, 'INSERT INTO settings (name,value) VALUES (?,?)', (key,value))
        db.commit()
    return jsonify(ok=True)


@app.post('/api/category-image')
def save_category_image():
    data = payload()
    category = text_field(data, 'category', 255, True)
    image = image_path(text_field(data, 'image', 2000))
    with closing(connect()) as db:
        if not query(db, 'SELECT id FROM products WHERE category=?', (category,)).fetchone():
            abort(404, description='Category not found.')
        row = query(db, 'SELECT value FROM settings WHERE name=?', ('category_images',)).fetchone()
        try: mapping = json.loads(row['value']) if row else {}
        except ValueError: mapping = {}
        if image: mapping[category] = image
        else: mapping.pop(category, None)
        query(db, 'DELETE FROM settings WHERE name=?', ('category_images',))
        query(db, 'INSERT INTO settings (name,value) VALUES (?,?)', ('category_images', json.dumps(mapping)))
        db.commit()
    return jsonify(ok=True, category_images=mapping)


def safe_svg(raw):
    """Accept only plain, script-free SVG graphics."""
    try:
        text = raw.decode('utf-8-sig')
        low = text.lower()
        root = ElementTree.fromstring(text)  # rejects malformed XML; DOCTYPE/ENTITY are refused below
    except (UnicodeDecodeError, ElementTree.ParseError):
        return False
    banned = ('<!doctype', '<!entity', '<script', '<foreignobject', '<iframe', '<object', '<embed', '<animate', '<set ', 'javascript:', 'data:text', '@import', 'expression(')
    return (root.tag.rsplit('}', 1)[-1] == 'svg' and not any(b in low for b in banned)
            and not re.search(r'\son[a-z]+\s*=', low)
            and not re.search(r'href\s*=\s*["\'](?!#)', low)
            and not re.search(r'url\(\s*["\']?(?!#|data:image/)', low))


@app.post('/api/upload')
def upload():
    data = payload()
    ext = Path(text_field(data,'name',255,True)).suffix.lower()
    signatures = {'.png':b'\x89PNG\r\n\x1a\n','.jpg':b'\xff\xd8\xff','.jpeg':b'\xff\xd8\xff','.gif':b'GIF8','.webp':b'RIFF','.svg':None}
    if ext not in signatures:
        abort(400, description='Choose a PNG, JPEG, GIF, WebP or SVG image.')
    raw = base64.b64decode(data['content'], validate=True)
    if ext == '.svg':
        if len(raw) > 1_000_000 or not safe_svg(raw):
            abort(400, description='Choose a plain SVG under 1 MB without scripts or external links.')
    elif len(raw) > 5_000_000 or not raw.startswith(signatures[ext]) or (ext == '.webp' and raw[8:12] != b'WEBP'):
        abort(400, description='Choose a valid image smaller than 5 MB.')
    dest = ROOT / 'assets' / 'uploads'
    dest.mkdir(exist_ok=True)
    filename = secrets.token_hex(16) + ext
    (dest / filename).write_bytes(raw)
    return jsonify(path='assets/uploads/' + filename)


@app.get('/')
@app.get('/<path:path>')
def static_file(path='index.html'):
    target = (ROOT / path).resolve()
    public_pages = {'index.html','products.html','categories.html','category.html','quote-request.html','admin.html'}
    allowed = target.parent == ROOT and target.name in public_pages or any(parent in target.parents for parent in (ROOT/'css',ROOT/'js',ROOT/'assets'))
    if not allowed or not target.is_file(): abort(404)
    return send_file(target, max_age=3600 if target.suffix != '.html' else 0)


def run():
    from waitress import serve
    if PRODUCTION and (len(ADMIN_PASSWORD) < 16 or not PUBLIC_ORIGIN.startswith('https://')):
        raise SystemExit('Production requires ADMIN_PASSWORD with at least 16 characters and an HTTPS PUBLIC_ORIGIN.')
    init()
    host, port = os.getenv('HOST','127.0.0.1'), int(os.getenv('PORT','8000'))
    print(f'Rangechem running at http://{host}:{port}; management ' + ('enabled' if ADMIN_PASSWORD else 'disabled'), flush=True)
    serve(app, host=host, port=port, threads=8, max_request_body_size=8_000_000, channel_timeout=30)


if __name__ == '__main__':
    run()
