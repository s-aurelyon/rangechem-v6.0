# AGENTS.md

Guidance for AI coding agents (and humans) working on the Rangechem website.

## Always do this after changing the project

**Run `python build_deploy.py` after every change to the code, pages, styles, scripts or assets.** It refreshes the `?v=` cache versions on the HTML pages and rebuilds `dist/rangechem-code.zip` (and `dist/rangechem-product-images.zip`) for upload to cPanel. If the change affects how the site is deployed or configured (environment variables, dependencies, setup steps), update `DEPLOYMENT.md` in the same change. Then run the tests.

```bash
python -m unittest discover -s tests
python build_deploy.py
```

## What this is

A catalogue and quote-request website for a Cape Town cleaning-chemical manufacturer. Flask app (`server.py`) serving static pages plus a JSON API. SQLite locally, MariaDB/MySQL in production. Deployed to cPanel "Setup Python App" (Passenger) through `passenger_wsgi.py`.

| Path | Purpose |
|---|---|
| `server.py` | Flask app: API, auth, throttling, static file serving, image matching, uploads |
| `mailer.py` | Quote confirmation emails (SMTP, PDF attachment); all config from env vars |
| `passenger_wsgi.py` | cPanel entry point (`application`); runs `init()` and production checks |
| `index.html` | Homepage. **Leave it alone** unless explicitly asked; it uses `css/style.css`, `css/home-utilities.css`, `js/quote.js` |
| `categories.html`, `products.html`, `quote-request.html` | Shell pages rendered by `js/store.js` |
| `admin.html` + `js/admin.js` | Staff management panel (HTTP Basic, user `admin`) |
| `js/ui.js`, `css/polish.css` | Shared polish (skeletons, fly-to-quote, back-to-top, toasts). Not loaded on the homepage |
| `js/navigation.js` | Shared nav; also used on the homepage |
| `data/products.json` | Seed catalogue, imported only when the products table is empty |
| `build_deploy.py` | Builds the deployment zips |
| `tests/` | `unittest` suite using a temporary SQLite database |

## Conventions

- **Python 3.9-compatible syntax** in server code (no `match`, no `X | Y` type unions); target runtime is 3.12+ on the host.
- Frontend is plain HTML/CSS/JS with no build step and no framework. Keep files small and readable; the older files were minified, new code is not.
- Colours: brand red `#d63121`, ink `#141414`. Font Montserrat.
- Escape every dynamic value with `esc()` before inserting into HTML. Never put user text in `innerHTML` unescaped.
- All POST endpoints except `/api/quote` require admin auth (enforced in `protect_requests`). New POST routes inherit this; keep it that way.
- Uploads go to `assets/uploads/` with random names; SVGs pass `safe_svg()` and are served with a sandboxing CSP. Don't weaken either.
- Respect `prefers-reduced-motion` for any new animation.
- Database access goes through `query()` using `?` placeholders (translated for MySQL). Never build SQL with string formatting of user input.
- Static JS/CSS is cached for an hour; `build_deploy.py` stamps `?v=` versions so changes reach visitors.

## Configuration (environment variables)

See `.env.example` for the full list and `DEPLOYMENT.md` for what each means on cPanel. Never commit real values.

## Housekeeping notes

- `assets/product_images/` is git-ignored (large). It ships in `dist/rangechem-product-images.zip`.
- `assets/uploads/` holds live admin uploads; never overwrite or bundle it.
- Unused design alternates (`assets/HomeBanner_Option*`, `assets/containers-*`, `assets/icons/container-duo.svg`, `assets/products/`) are kept in Git but excluded from the deployment zips. Check `build_deploy.py` (`UNUSED`) before referencing one.
- `start_local.py`, `compose.yaml` and `import_products.py` are local/dev tooling and are not deployed.
