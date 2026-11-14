"""Run with python -m unittest discover -s tests -v. Uses a temporary database."""
import base64
import json
import os
from pathlib import Path
import tempfile
import unittest
import server


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


if __name__ == '__main__': unittest.main()
