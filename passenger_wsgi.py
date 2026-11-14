"""cPanel "Setup Python App" (Passenger) entry point.

Set Application startup file to passenger_wsgi.py and Application Entry point to
application. Passenger imports this module instead of running server.py, so the
database set-up and the production safety check that run() normally performs
happen here.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import server

if server.PRODUCTION and (len(server.ADMIN_PASSWORD) < 16 or not server.PUBLIC_ORIGIN.startswith('https://')):
    raise RuntimeError('Production requires ADMIN_PASSWORD with at least 16 characters and an HTTPS PUBLIC_ORIGIN.')

server.init()  # creates tables and imports data/products.json only when the products table is empty
application = server.app
