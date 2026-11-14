import base64, hmac, json, mimetypes, os, re, secrets, sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
MYSQL = os.getenv('DB_ENGINE', 'sqlite') == 'mysql'
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', '')

def connect():
    if MYSQL:
        import pymysql
        return pymysql.connect(host=os.getenv('DB_HOST', '127.0.0.1'), port=int(os.getenv('DB_PORT', '3306')), user=os.getenv('DB_USER', 'rangechem'), password=os.environ['DB_PASSWORD'], database=os.getenv('DB_NAME', 'rangechem'), charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor, autocommit=False)
    db = sqlite3.connect(ROOT / 'data' / 'rangechem.db', timeout=30)
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

def image_for(product, files):
    if product.get('image'): return product['image']
    code = product.get('stock_code', '').strip().lower()
    if not code: return ''
    # A bracketed code or a whole code in a filename avoids partial-code matches.
    pattern = re.compile(r'(?<![a-z0-9])' + re.escape(code) + r'(?![a-z0-9])', re.I)
    matches = [p for p in files if pattern.search(p.stem)]
    return matches[0].relative_to(ROOT).as_posix() if matches else ''

class Handler(BaseHTTPRequestHandler):
    def send(self, status, payload, kind='application/json; charset=utf-8'):
        body = json.dumps(payload, ensure_ascii=False).encode() if kind.startswith('application/json') else payload
        self.send_response(status); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(body))); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(body)
    def authorized(self):
        try:
            scheme, token = self.headers.get('Authorization','').split(' ',1)
            user, password = base64.b64decode(token).decode().split(':',1)
            return bool(ADMIN_PASSWORD) and scheme == 'Basic' and hmac.compare_digest(user,'admin') and hmac.compare_digest(password,ADMIN_PASSWORD)
        except Exception: return False
    def admin(self):
        if self.authorized(): return True
        self.send_response(401); self.send_header('WWW-Authenticate','Basic realm="Rangechem management"'); self.end_headers(); return False
    def body(self):
        length = int(self.headers.get('Content-Length','0'))
        if length > 8_000_000: raise ValueError('Request too large')
        return json.loads(self.rfile.read(length))
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path.startswith('/api/'):
            db=connect()
            try:
                if path == '/api/products':
                    products=[dict(r) for r in query(db,'SELECT * FROM products ORDER BY name, size').fetchall()]
                    folder=ROOT/'assets'/'product_images'
                    files=sorted((p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.gif')),key=lambda p:p.name.lower()) if folder.exists() else []
                    for p in products: p['display_image']=image_for(p, files)
                    self.send(200,products)
                elif path == '/api/settings': self.send(200,{r['name']:r['value'] for r in query(db,'SELECT * FROM settings').fetchall()})
                elif path == '/api/quotes' and self.admin(): self.send(200,[dict(r) for r in query(db,'SELECT * FROM quotes ORDER BY id DESC').fetchall()])
                elif path == '/api/admin' and self.admin(): self.send(200,{'ok':True})
                elif path not in ('/api/quotes','/api/admin'): self.send(404,{'error':'Not found'})
            finally: db.close()
            return
        if path == '/': path='/index.html'
        target=(ROOT / path.lstrip('/')).resolve()
        allowed = target.parent == ROOT and target.suffix == '.html' or any(parent in target.parents for parent in (ROOT/'css',ROOT/'js',ROOT/'assets'))
        if not allowed or not target.is_file(): self.send(404,b'Not found','text/plain'); return
        self.send(200,target.read_bytes(),mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
    def do_POST(self):
        path=urlsplit(self.path).path
        if path != '/api/quote' and not self.admin(): return
        origin=self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'): self.send(403,{'error':'Invalid origin'}); return
        try:
            data=self.body(); db=connect()
            try:
                if path == '/api/quote':
                    from datetime import datetime, timezone
                    customer=data.get('customer',{}); items=data.get('items',[])
                    if not all(str(customer.get(k,'')).strip() for k in ('name','email')) or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',str(customer.get('email',''))) or not isinstance(items,list) or not 1 <= len(items) <= 100: raise ValueError('Enter your name, a valid email and at least one item.')
                    clean=[]
                    for item in items:
                        p=query(db,'SELECT id,name,stock_code,size FROM products WHERE id=?',(int(item['id']),)).fetchone(); qty=int(item['quantity'])
                        if not p or not 1 <= qty <= 10000: raise ValueError('Invalid product or quantity.')
                        clean.append({**dict(p),'quantity':qty})
                    query(db,'INSERT INTO quotes (created,customer,items) VALUES (?,?,?)',(datetime.now(timezone.utc).isoformat(),json.dumps(customer),json.dumps(clean)))
                elif path == '/api/product':
                    fields=('category','name','description','image','stock_code','size','tags')
                    values=[str(data.get(k,'')).strip() for k in fields]
                    if not values[0] or not values[1]: raise ValueError('Name and category are required.')
                    if any(len(v)>10000 for v in values): raise ValueError('Field is too long.')
                    if data.get('id'): query(db,'UPDATE products SET category=?,name=?,description=?,image=?,stock_code=?,size=?,tags=? WHERE id=?',(*values,int(data['id'])))
                    else: query(db,'INSERT INTO products (category,name,description,image,stock_code,size,tags) VALUES (?,?,?,?,?,?,?)',values)
                elif path == '/api/delete-product': query(db,'DELETE FROM products WHERE id=?',(int(data['id']),))
                elif path == '/api/settings':
                    for key in ('hero_image','hero_title','hero_text'):
                        if key in data:
                            query(db,'DELETE FROM settings WHERE name=?',(key,)); query(db,'INSERT INTO settings (name,value) VALUES (?,?)',(key,str(data[key])[:2000]))
                elif path == '/api/upload':
                    ext=Path(data.get('name','')).suffix.lower()
                    if ext not in ('.png','.jpg','.jpeg','.webp','.gif'): raise ValueError('Choose a PNG, JPEG, GIF or WebP image.')
                    raw=base64.b64decode(data['content'],validate=True)
                    signatures={'.png':b'\x89PNG\r\n\x1a\n','.jpg':b'\xff\xd8\xff','.jpeg':b'\xff\xd8\xff','.gif':b'GIF8','.webp':b'RIFF'}
                    if not raw.startswith(signatures[ext]) or (ext=='.webp' and raw[8:12]!=b'WEBP'): raise ValueError('Invalid image file.')
                    dest=ROOT/'assets'/'uploads'; dest.mkdir(exist_ok=True); filename=secrets.token_hex(16)+ext; (dest/filename).write_bytes(raw)
                    self.send(200,{'path':'assets/uploads/'+filename}); return
                else: self.send(404,{'error':'Not found'}); return
                db.commit(); self.send(200,{'ok':True})
            finally: db.close()
        except (ValueError,KeyError,TypeError,json.JSONDecodeError) as exc: self.send(400,{'error':str(exc)})

if __name__ == '__main__':
    init()
    print('Rangechem running at http://127.0.0.1:8000; management ' + ('enabled' if ADMIN_PASSWORD else 'disabled (set ADMIN_PASSWORD)'))
    ThreadingHTTPServer(('127.0.0.1',8000),Handler).serve_forever()
