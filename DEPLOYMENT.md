# Production deployment

The application now serves through Flask and Waitress. The homepage content is unchanged; its utility CSS is precompiled and Lucide is served locally. Google Fonts and the existing remote homepage photograph remain external dependencies.

## Install and run

Use Python 3.12 or newer, create a virtual environment, and run `pip install -r requirements.txt`. Existing Windows installations can also install into `.local/python` using `python -m pip install --target .local/python -r requirements.txt`.

Set these environment variables using your hosting provider's secret manager:

- `APP_ENV=production`
- `PUBLIC_ORIGIN=https://your-actual-domain` (no trailing slash)
- `ADMIN_PASSWORD`: a unique random password of at least 16 characters; username is `admin`.
- `HOST=127.0.0.1`, `PORT=8000` behind a reverse proxy on the same host.
- `DB_ENGINE=mysql`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` for MariaDB. SQLite remains available for local testing; `SQLITE_PATH` can select an isolated test database.

Run `python server.py` under a service manager that restarts it after failure and reboot. It checks the production settings, initializes the database without overwriting existing products, and runs Waitress. `python start_local.py` retains the existing local MariaDB workflow.

Put Caddy, IIS or nginx in front of port 8000 and configure HTTPS and HTTP-to-HTTPS redirects. For example, replace the domain in this Caddy configuration:

```caddyfile
shop.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

The reverse proxy must preserve the public Host header. Do not expose port 8000 publicly. Authentication uses HTTP Basic and therefore requires HTTPS. Restrict `/admin.html` and administrative `/api/*` routes to trusted staff through your proxy or identity provider if individual accounts, MFA or audit trails are needed. The app does not trust forwarded client-IP headers: its built-in throttles may share a single bucket behind a proxy. Configure per-client request and login limits at the proxy; app throttling is a secondary safeguard. Run a single application process unless you add shared rate-limit storage.

## cPanel (Setup Python App / Passenger)

1. **Database:** cPanel > MySQL Databases. Create a database and a user, then add the user to the database with ALL PRIVILEGES. cPanel prefixes both names with your account name (for example `acct_rangechem`).
2. **Upload:** run `python build_deploy.py` on your computer (see *Deployment bundle* below). In File Manager create a folder outside `public_html` (for example `/home/ACCOUNT/rangechem`), upload `dist/rangechem-code.zip` and Extract it there so `passenger_wsgi.py` sits directly in that folder. Then upload and extract `dist/rangechem-product-images.zip` the same way (first deploy, or when product photos change).
3. **Create the app:** cPanel > Setup Python App > Create Application.
   - Python version: **3.12.14** (or 3.13.15). Do not use 3.7 to 3.8.
   - Application root: `rangechem`
   - Application URL: a domain or subdomain root (the site uses absolute `/api/...` paths, so do not use a sub-folder URL).
   - Application startup file: `passenger_wsgi.py`
   - Application Entry point: `application`
4. **Environment variables** (add each in the same page, then Save):

   | Name | Value |
   |---|---|
   | `APP_ENV` | `production` |
   | `PUBLIC_ORIGIN` | `https://your-domain.co.za` (no trailing slash) |
   | `ADMIN_PASSWORD` | random, at least 16 characters |
   | `DB_ENGINE` | `mysql` |
   | `DB_HOST` | `127.0.0.1` |
   | `DB_PORT` | `3306` |
   | `DB_NAME` | the full prefixed database name |
   | `DB_USER` | the full prefixed database user |
   | `DB_PASSWORD` | the database user's password |
| `MAIL_FROM` | the Rangechem sender address, e.g. `quotes@your-domain.co.za` (also used as Reply-To) |
| `MAIL_NOTIFY` | optional: address(es) that receive a copy of every quote, comma separated (defaults to `MAIL_FROM`) |
| `SMTP_HOST` | your mail server, e.g. `mail.your-domain.co.za` |
| `SMTP_PORT` | `465` (default) |
| `SMTP_SECURITY` | `ssl` (default), `starttls` (port 587) or `none` |
| `SMTP_USER` | the mailbox login, normally the full `MAIL_FROM` address |
| `SMTP_PASSWORD` | the mailbox password |

   `HOST` and `PORT` are not needed under Passenger.
5. **Dependencies:** on the same page, type `requirements.txt` under Configuration files, click Add, then Run Pip Install.
6. **Start:** click Restart. The tables are created and `data/products.json` is imported automatically on the first start. Open the site, then `/admin.html` (username `admin`).
7. **HTTPS:** enable AutoSSL for the domain and turn on Force HTTPS Redirect (Domains). Admin sign-in uses HTTP Basic and must only be used over HTTPS.
8. **After any change:** click Restart on the Python App page. Errors are written to `stderr.log` in the application root.

Keep Passenger to a single process on first start so the product import cannot run twice.

## Deployment bundle

`python build_deploy.py` stamps fresh cache-busting `?v=` versions into the HTML pages and writes two zips to `dist/` (git-ignored):

- `rangechem-code.zip` (about 6 MB): the site, `passenger_wsgi.py`, `mailer.py`, `requirements.txt` and the seed `data/products.json`.
- `rangechem-product-images.zip` (about 270 MB): the product photos for `assets/product_images/`.

Neither zip contains tests, local-only tools, databases, `.env` files or `assets/uploads/`, so extracting the code zip over a live site never overwrites uploaded images or data. **To update a live site:** build, upload `rangechem-code.zip`, Extract (overwrite when asked), then **Restart** the Python App. If `requirements.txt` changed, also run Pip Install first. Re-upload the images zip only when product photos change.

## Quote emails

When `SMTP_HOST` and `MAIL_FROM` are set, every quote submitted on the site sends:

1. a confirmation to the customer with their quote attached as a PDF (`Rangechem-Quote-RC-00012.pdf`), and
2. a copy to `MAIL_NOTIFY` (or `MAIL_FROM` if unset), with Reply-To set to the customer.

Create the mailbox first in cPanel > Email Accounts (for example `quotes@your-domain.co.za`), then use its details: host `mail.your-domain.co.za`, port `465`, `SMTP_SECURITY=ssl`, user the full address. Quotes are always saved first; an email failure never loses a quote. Failures are written to `stderr.log`. If `SMTP_HOST` or `MAIL_FROM` is missing nothing is sent and the site works as before. If `reportlab` is not installed the quote is attached as an HTML file instead of a PDF. Check SPF/DKIM for your domain in cPanel > Email Deliverability so confirmations are not marked as spam. To test, submit a quote with your own email address.

## Category images

In the admin, open Products > By category and use the picture icon on a category (or "Change category image" inside a category). Upload a PNG, JPEG, WebP, GIF or SVG, or paste an `assets/` path or HTTPS URL; "Use default illustration" restores the built-in artwork. SVGs are checked on upload: scripts, event handlers, external links and DOCTYPE/entities are rejected, and uploaded files are served with a sandboxing Content-Security-Policy.

## Before going live

- Set the real domain, TLS, persistent MariaDB storage and the administrator secret. These are hosting settings, not values to commit to Git.
- Back up the database, `assets/uploads/` and `assets/product_images/`; test restoring them. Uploaded images and local credentials are excluded from Git.
- Assign a staff member to monitor quote requests in the admin panel and the quotes mailbox. Requests are always stored in the database; email confirmations are sent only when the `SMTP_*` and `MAIL_FROM` variables are set. Test one with a real address on the live domain.
- Supply approved Privacy Policy, Terms of Use and POPIA Notice text and destinations. The homepage's existing placeholder links were preserved to respect the request not to change its content. Define quote-data retention and deletion procedures before collecting live customer data.
- Test a real quote, administrative editing and image upload on the final HTTPS domain. Monitor errors, storage and backups.

## Checks

`python -m unittest discover -s tests -v` verifies authentication, same-origin checks, input validation, quote persistence, product create/update/delete, throttling and private-file protection using a temporary SQLite database. It does not modify the live database. MariaDB should also be verified in the deployment environment.

## Frontend maintenance

The shared navigation is in [navigation.js](js/navigation.js). Category illustrations are small hand-authored SVGs in [assets/categories](assets/categories/); new categories fall back to a generic chemistry illustration. Names and links in the Products menu come from the catalog automatically.

[home-utilities.css](css/home-utilities.css) contains the existing homepage's Tailwind 3.4.17 output, captured after its runtime compiler processed the page. The browser no longer runs Tailwind. If homepage utility classes change, regenerate this stylesheet with Tailwind 3.4.17, scanning `index.html`, using `Montserrat, system-ui, sans-serif` as `fontFamily.sans` and the existing `rc-primary`, `rc-red`, `rc-red-dark` colors. The catalog uses standalone CSS and does not require Tailwind. Lucide 0.468.0 and its license are vendored under [js/vendor](js/vendor/).
