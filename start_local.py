"""Start the project-local MariaDB instance and website on Windows."""
import getpass
import json
import os
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parent
local = root / '.local'
credentials_file = local / 'credentials.json'
if not credentials_file.exists():
    raise SystemExit('Local MariaDB credentials not found. See README.md for setup.')
credentials = json.loads(credentials_file.read_text(encoding='utf-8'))
sys.path.insert(0, str(local / 'python'))
try:
    import pymysql
except ImportError:
    raise SystemExit('MariaDB Python driver missing from .local/python. See README.md.')

def connect():
    return pymysql.connect(host='127.0.0.1', port=3307, user='rangechem',
                           password=credentials['app_password'], database='rangechem', connect_timeout=2)

try:
    db = connect()
except pymysql.MySQLError:
    binary = local / 'mariadb-11.4.10-winx64' / 'bin' / 'mariadbd.exe'
    config = local / 'mariadb-data' / 'my.ini'
    if not binary.exists() or not config.exists():
        raise SystemExit('Local MariaDB installation is missing. See README.md.')
    subprocess.Popen([str(binary), '--defaults-file=' + str(config)], cwd=str(root),
                     creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    for attempt in range(20):
        time.sleep(0.5)
        try:
            db = connect()
            break
        except pymysql.MySQLError:
            continue
    else:
        raise SystemExit('Could not connect to the project database on port 3307. Check whether that port is in use and inspect the MariaDB log in .local/mariadb-data.')
db.close()

if not os.environ.get('ADMIN_PASSWORD'):
    os.environ['ADMIN_PASSWORD'] = getpass.getpass('Choose an admin password for this session: ')
if not os.environ['ADMIN_PASSWORD']:
    raise SystemExit('An admin password is required.')
os.environ.update(DB_ENGINE='mysql', DB_HOST='127.0.0.1', DB_PORT='3307',
                  DB_NAME='rangechem', DB_USER='rangechem', DB_PASSWORD=credentials['app_password'])
print('Starting Rangechem with local MariaDB. Admin username: admin.', flush=True)
os.chdir(root)
import server
server.init()
print('Open http://127.0.0.1:8000 (Ctrl+C stops the website).', flush=True)
try:
    server.ThreadingHTTPServer(('127.0.0.1', 8000), server.Handler).serve_forever()
except KeyboardInterrupt:
    print('\nWebsite stopped. MariaDB remains running for local use.')
