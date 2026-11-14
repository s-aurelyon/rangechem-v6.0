# HostAfrica deployment notes

These notes record the HostAfrica setup and troubleshooting path for this Flask application. HostAfrica's panel is DirectAdmin with CloudLinux Python Selector; it is not cPanel.

## Application setup

- Keep the application in `/home/ACCOUNT/rangechem`, outside the domain's `public_html`. The app serves the site at the domain root, so configure its URL as `/`.
- In DirectAdmin's Python Selector, choose Python 3.11.18, set Application root to `rangechem`, startup file to `passenger_wsgi.py`, and entry point to `application`.
- Upload and extract the deployment code into the application root so `passenger_wsgi.py`, `server.py`, `mailer.py`, `requirements.txt`, and `data/` are directly inside it. Extract the product-images archive into the same application root.
- Add `requirements.txt` in the selector's Configuration files and run Pip Install.
- Create the MariaDB database and user in DirectAdmin's MySQL Management. Use the exact full prefixed names in `DB_NAME` and `DB_USER`, and assign the user to the database with the privileges required by the app.
- Configure the environment variables in Python Selector. Keep credentials private; do not paste them into support requests or screenshots.

The project's [`passenger_wsgi.py`](passenger_wsgi.py) is already the correct WSGI entry point. The remote file must match it; do not use a generated wrapper that imports `passenger_wsgi.py` into itself.

## Startup troubleshooting

The Python Selector's **Execute Python Script** field can run the startup file directly:

```text
/home/ACCOUNT/rangechem/passenger_wsgi.py
```

Use **Run Script** and inspect its stderr output. This runs the normal startup initialization (`server.init()`), which can create database tables and seed an empty product catalogue; it is not a read-only check.

Interpret common failures:

- A traceback repeating `imp.load_source('wsgi', 'passenger_wsgi.py')` and ending in `RecursionError` means the remote startup file is recursively loading itself. Replace it with the project's `passenger_wsgi.py` from the deployment bundle.
- `pymysql.err.OperationalError: (1045, "Access denied ...")` means MariaDB rejected the configured login or access. Verify `DB_NAME` and `DB_USER` against DirectAdmin's exact names, ensure the user is assigned to that database, and update `DB_PASSWORD` in Python Selector if the database user's password changes.
- If category SVGs load but product-image URLs return 404, compare a direct Flask test-client request with the public URL. Product filenames contain URL-escaped spaces and brackets; the static route must unquote a missing encoded path before resolving it. Rebuild and upload the current code bundle, then restart the app.
- A missing or empty `PassengerAppLogFile` does not identify the startup cause. If running the startup file produces no useful error and the configured log remains empty, ask HostAfrica support to check the server-level Passenger/Apache log for the current Passenger error ID.

After correcting the startup file or database settings, save the changes, restart/reset the Python application, and load the site again. Do not change frameworks or Python versions to address these specific WSGI or database errors.

## Credential exposure

Python Selector displays environment-variable values in the panel. If a password is included in a screenshot, pasted output, or support conversation, treat it as exposed and rotate it. When rotating the database password, update both the MariaDB user and the `DB_PASSWORD` environment variable, then restart the app.
