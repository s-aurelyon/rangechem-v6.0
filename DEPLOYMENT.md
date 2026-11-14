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

## Before going live

- Set the real domain, TLS, persistent MariaDB storage and the administrator secret. These are hosting settings, not values to commit to Git.
- Back up the database, `assets/uploads/` and `assets/product_images/`; test restoring them. Uploaded images and local credentials are excluded from Git.
- Assign a staff member to monitor quote requests in the admin panel. Requests are stored in the database; email delivery is **not configured**. Add and test an email integration if email notification is required.
- Supply approved Privacy Policy, Terms of Use and POPIA Notice text and destinations. The homepage's existing placeholder links were preserved to respect the request not to change its content. Define quote-data retention and deletion procedures before collecting live customer data.
- Test a real quote, administrative editing and image upload on the final HTTPS domain. Monitor errors, storage and backups.

## Checks

`python -m unittest discover -s tests -v` verifies authentication, same-origin checks, input validation, quote persistence, product create/update/delete, throttling and private-file protection using a temporary SQLite database. It does not modify the live database. MariaDB should also be verified in the deployment environment.

## Frontend maintenance

The shared navigation is in [navigation.js](js/navigation.js). Category illustrations are small hand-authored SVGs in [assets/categories](assets/categories/); new categories fall back to a generic chemistry illustration. Names and links in the Products menu come from the catalog automatically.

[home-utilities.css](css/home-utilities.css) contains the existing homepage's Tailwind 3.4.17 output, captured after its runtime compiler processed the page. The browser no longer runs Tailwind. If homepage utility classes change, regenerate this stylesheet with Tailwind 3.4.17, scanning `index.html`, using `Montserrat, system-ui, sans-serif` as `fontFamily.sans` and the existing `rc-primary`, `rc-red`, `rc-red-dark` colors. The catalog uses standalone CSS and does not require Tailwind. Lucide 0.468.0 and its license are vendored under [js/vendor](js/vendor/).
