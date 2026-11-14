"""Run with python -m unittest discover -s tests -v. Uses a temporary database."""
import base64
import json
import os
from pathlib import Path
import tempfile
import unittest
import server
import mailer


class SiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_path = os.environ.get('SQLITE_PATH')
        os.environ['SQLITE_PATH'] = str(Path(self.temp.name) / 'test.db')
        self.old_mysql, self.old_password = server.MYSQL, server.ADMIN_PASSWORD
        server.MYSQL = False
        server.ADMIN_PASSWORD = 'test-only-long-password'
        server.limits.clear()
        server.init()
        self.client = server.app.test_client()
        self.auth = {'Authorization':'Basic ' + base64.b64encode(b'admin:test-only-long-password').decode()}
        self.product = self.client.get('/api/products').json[0]

    def tearDown(self):
        server.MYSQL, server.ADMIN_PASSWORD = self.old_mysql, self.old_password
        if self.old_path is None: os.environ.pop('SQLITE_PATH', None)
        else: os.environ['SQLITE_PATH'] = self.old_path
        self.temp.cleanup()

    def quote(self, quantity=2):
        return {'customer':{'name':'Test Customer','email':'test@example.com'},'items':[{'id':self.product['id'],'quantity':quantity}]}

    def test_quote_uses_database_product_details(self):
        data = self.quote()
        data['items'][0]['name'] = 'Tampered name'
        self.assertEqual(self.client.post('/api/quote', json=data).status_code, 200)
        quotes = self.client.get('/api/quotes', headers=self.auth).json
        self.assertEqual(json.loads(quotes[0]['items'])[0]['name'], self.product['name'])
        self.assertEqual(json.loads(quotes[0]['customer'])['email'], 'test@example.com')

    def test_invalid_quote_never_saved(self):
        for quantity in [0,10001,True,1.5,'2']:
            self.assertEqual(self.client.post('/api/quote', json=self.quote(quantity)).status_code, 400)
        data = self.quote(); data['items'] *= 2
        self.assertEqual(self.client.post('/api/quote', json=data).status_code, 400)
        self.assertEqual(self.client.get('/api/quotes', headers=self.auth).json, [])

    def test_admin_auth_and_csrf(self):
        for path in ['/admin.html','/api/quotes','/api/admin']:
            self.assertEqual(self.client.get(path).status_code, 401)
            with self.client.get(path, headers=self.auth) as response:
                self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.post('/api/product', json={}).status_code, 401)
        self.assertEqual(self.client.post('/api/product', json={}, headers={**self.auth,'Origin':'https://other.example'}).status_code, 403)
        self.assertEqual(self.client.post('/api/quote', data='{}', content_type='text/plain').status_code, 415)

    def test_product_create_update_delete(self):
        data = {'name':'Test product','category':'Test category'}
        response = self.client.post('/api/product', json=data, headers=self.auth)
        self.assertEqual(response.status_code, 200)
        ident = response.json['id']
        data.update(id=ident, name='Updated product')
        self.assertEqual(self.client.post('/api/product', json=data, headers=self.auth).json['id'], ident)
        self.assertEqual(len([p for p in self.client.get('/api/products').json if p['id'] == ident]), 1)
        self.assertEqual(self.client.post('/api/delete-product', json={'id':ident}, headers=self.auth).status_code, 200)
        self.assertFalse(any(p['id'] == ident for p in self.client.get('/api/products').json))

    def test_private_files_blocked_and_security_headers(self):
        for path in ['/data/products.json','/data/rangechem.db','/.local/credentials.json','/server.py','/assets/../server.py']:
            self.assertEqual(self.client.get(path).status_code, 404)
        response = self.client.get('/categories.html')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
        response.close()
        self.assertEqual(self.client.get('/api/products').headers['Cache-Control'], 'no-store')

    def test_upload_and_image_url_validation(self):
        self.assertEqual(self.client.post('/api/upload', json={'name':'bad.png','content':base64.b64encode(b'not an image').decode()}, headers=self.auth).status_code, 400)
        self.assertEqual(self.client.post('/api/product', json={'name':'Test','category':'Test','image':'javascript:alert(1)'}, headers=self.auth).status_code, 400)
        self.assertEqual(self.client.post('/api/settings', json={'hero_image':'assets/../../secret'}, headers=self.auth).status_code, 400)

    def test_quote_rate_limit(self):
        for _ in range(10):
            self.assertEqual(self.client.post('/api/quote', json={}).status_code, 400)
        self.assertEqual(self.client.post('/api/quote', json={}).status_code, 429)

    def test_bad_payload_and_missing_products(self):
        self.assertEqual(self.client.post('/api/quote', json=[]).status_code, 400)
        data = self.quote(); data['items'][0]['id'] = 9999999
        self.assertEqual(self.client.post('/api/quote', json=data).status_code, 400)
        self.assertEqual(self.client.post('/api/product', json={'id':9999999,'name':'Test','category':'Test'}, headers=self.auth).status_code, 404)

    def test_image_matching_whole_code_only_and_cache_parity(self):
        folder = server.ROOT / 'assets' / 'product_images'
        files = sorted([folder / '[ABC-10] Big Bottle.jpg', folder / '[ABC-1] Small Bottle.jpg', folder / 'other.png'], key=lambda p: p.name.lower())
        stems = [p.stem.lower() for p in files]
        for code, expected in [('ABC-1', 'assets/product_images/[ABC-1] Small Bottle.jpg'), ('abc-10', 'assets/product_images/[ABC-10] Big Bottle.jpg'), ('ABC-100', ''), ('', '')]:
            product = {'stock_code': code, 'image': ''}
            self.assertEqual(server.image_for(product, files), expected)
            self.assertEqual(server.image_for(product, files, stems), expected)
        self.assertEqual(server.image_for({'stock_code': 'ABC-1', 'image': 'assets/custom.png'}, files), 'assets/custom.png')

    def test_products_api_images_stable_between_requests(self):
        first = self.client.get('/api/products').json
        second = self.client.get('/api/products').json
        self.assertEqual([p['display_image'] for p in first], [p['display_image'] for p in second])

    def test_category_image_requires_auth_and_validates(self):
        category = self.product['category']
        self.assertEqual(self.client.post('/api/category-image', json={'category':category,'image':'assets/x.svg'}).status_code, 401)
        self.assertEqual(self.client.post('/api/category-image', json={'category':'Nope','image':''}, headers=self.auth).status_code, 404)
        self.assertEqual(self.client.post('/api/category-image', json={'category':category,'image':'javascript:alert(1)'}, headers=self.auth).status_code, 400)
        saved = self.client.post('/api/category-image', json={'category':category,'image':'assets/uploads/a.svg'}, headers=self.auth)
        self.assertEqual(saved.json['category_images'], {category:'assets/uploads/a.svg'})
        self.assertEqual(json.loads(self.client.get('/api/settings').json['category_images']), {category:'assets/uploads/a.svg'})
        cleared = self.client.post('/api/category-image', json={'category':category,'image':''}, headers=self.auth)
        self.assertEqual(cleared.json['category_images'], {})

    def test_svg_upload_accepts_plain_and_rejects_scripts(self):
        def up(svg): return self.client.post('/api/upload', json={'name':'icon.svg','content':base64.b64encode(svg.encode()).decode()}, headers=self.auth)
        ok = up('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#d63121"/></svg>')
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(ok.json['path'].endswith('.svg'))
        served = self.client.get('/' + ok.json['path'])
        self.assertIn('sandbox', served.headers['Content-Security-Policy'])
        served.close()
        (server.ROOT / ok.json['path']).unlink()
        for bad in ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
                    '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://evil.example"><rect/></a></svg>',
                    '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
                    '<html><body>not svg</body></html>', 'not xml at all']:
            self.assertEqual(up(bad).status_code, 400, bad)

    def test_quote_sends_confirmation_with_pdf_and_staff_copy(self):
        sent = []
        class FakeSMTP:
            def __init__(self, *a, **k): pass
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def login(self, *a): pass
            def send_message(self, message): sent.append(message)
        env = {'SMTP_HOST':'mail.test','MAIL_FROM':'quotes@rangechem.test','MAIL_NOTIFY':'sales@rangechem.test','SMTP_USER':'u','SMTP_PASSWORD':'p'}
        old_env = {k: os.environ.get(k) for k in env}
        old_smtp, server.MAIL_SYNC = mailer.smtplib.SMTP_SSL, True
        os.environ.update(env); mailer.smtplib.SMTP_SSL = FakeSMTP
        try:
            data = self.quote(3); data['customer']['name'] = 'Test\r\nBcc: evil@example.com'
            response = self.client.post('/api/quote', json=data)
        finally:
            mailer.smtplib.SMTP_SSL, server.MAIL_SYNC = old_smtp, False
            for k, v in old_env.items():
                if v is None: os.environ.pop(k, None)
                else: os.environ[k] = v
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['emailed']); self.assertRegex(response.json['reference'], r'^RC-\d{5}$')
        self.assertEqual(len(sent), 2)
        client, staff = sent
        self.assertEqual(client['To'], 'test@example.com'); self.assertEqual(staff['To'], 'sales@rangechem.test')
        self.assertIn('quotes@rangechem.test', client['From']); self.assertIsNone(client['Bcc']); self.assertIsNone(staff['Bcc']); self.assertNotIn('\n', str(staff['Subject']))
        attachments = list(client.iter_attachments())
        self.assertEqual(attachments[0].get_content_type(), 'application/pdf')
        self.assertTrue(attachments[0].get_content().startswith(b'%PDF'))
        self.assertIn(self.product['name'], client.get_body(('plain',)).get_content())

    def test_quote_without_mail_settings_still_succeeds(self):
        for key in ('SMTP_HOST', 'MAIL_FROM'): os.environ.pop(key, None)
        response = self.client.post('/api/quote', json=self.quote())
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json['emailed'])

    def test_html_attachment_fallback_without_reportlab(self):
        original = mailer.quote_pdf
        mailer.quote_pdf = lambda *a, **k: None
        try:
            client, _ = mailer.build_messages({'sender':'q@r.test','notify':['s@r.test']}, 'RC-00001', {'name':'A <b>','email':'a@b.co'}, [{'name':'X','size':'1L','stock_code':'Z','quantity':2}], 'now')
        finally:
            mailer.quote_pdf = original
        attachment = next(client.iter_attachments())
        self.assertEqual(attachment.get_content_type(), 'text/html')
        body = attachment.get_content()
        self.assertIn('A &lt;b&gt;', body)  # customer text is HTML-escaped
        self.assertNotIn('A <b>', body)


if __name__ == '__main__': unittest.main()
