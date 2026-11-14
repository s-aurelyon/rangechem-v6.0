# Rangechem Website – Documentation & Customisation Guide

Catalogue and quote-request website for Rangechem. Flask app (`server.py`) serving static pages and a JSON API, with SQLite locally and MariaDB/MySQL in production. For AI agents and contributors see [AGENTS.md](AGENTS.md); for hosting see [DEPLOYMENT.md](DEPLOYMENT.md).

## Quick start (local)

```powershell
$env:ADMIN_PASSWORD = 'choose-a-password'
python server.py
```

Open `http://127.0.0.1:8000`; the management panel is at `/admin.html` (username `admin`). The local SQLite database is created on first launch from `data/products.json`. Opening the HTML files directly will not run the catalogue. Run the tests with `python -m unittest discover -s tests`.

## What the site does

- **Catalogue:** categories and products with search, size filter, category-aware tag filter, and an "add to quote" cart.
- **Quotes:** requests are stored in the database (reference `RC-00001` style) and shown in the admin. When email is configured, the customer receives a confirmation with their quote attached as a PDF and Rangechem receives a copy. See *Quote emails* in [DEPLOYMENT.md](DEPLOYMENT.md).
- **Admin:** edit products (name, category, size, tags, description, image), change category images (PNG, JPEG, WebP, GIF or SVG), edit the homepage hero and read quote requests.
- **Product images:** the matcher checks filenames in `assets/product_images` for the complete stock code, ignoring case; the alphabetically first match wins. An image path or upload saved on the product overrides matching; clear it to restore matching. Products without an image show a placeholder.
- **Shared polish:** `css/polish.css` and `js/ui.js` (skeleton loaders, fly-to-quote, back-to-top, toasts) are used on the catalogue, quote and admin pages, not the homepage. `build_deploy.py` stamps `?v=` cache versions on the asset links.

## Building the deployment bundle

```powershell
python build_deploy.py
```

Creates `dist/rangechem-code.zip` and `dist/rangechem-product-images.zip` for cPanel (see [DEPLOYMENT.md](DEPLOYMENT.md)). Run it after every change.

### MariaDB local setup

On this Windows computer, a project-local MariaDB 11.4 instance is installed in `.local` and listens only on `127.0.0.1:3307`. Start the database and site with `python start_local.py`, enter an administrator password for the session when prompted, and open `http://127.0.0.1:8000`. The management username is `admin`. The database continues running when the website is stopped. Its data and locally generated credentials are stored in the ignored `.local` folder; back up that folder if you need to preserve the local database. The following Docker instructions are an alternative setup for other machines.

Install Docker Desktop and Python, then install the driver with `pip install -r requirements.txt`. In PowerShell, set strong local credentials and start the database:

```powershell
$env:DB_PASSWORD = 'choose-a-database-password'
$env:DB_ROOT_PASSWORD = 'choose-a-different-root-password'
docker compose up -d
$env:DB_ENGINE = 'mysql'
$env:ADMIN_PASSWORD = 'choose-an-admin-password'
python server.py
```

The application initialises the tables and imports `data/products.json` only when the products table is empty. Docker's `rangechem_db` volume persists data across restarts. Do not delete the volume if you need its edits or quote requests. SQLite and MariaDB are separate databases; edits do not automatically migrate between them. To rebuild the import JSON from the supplied workbook, run `python import_products.py "full-path-to-workbook.xlsx"` before initialising an empty database. This does not overwrite an existing database.

---

## 📁 Project Structure

```text
rangechem-v6.0/
├── index.html                  # Homepage (leave alone unless asked)
├── categories.html, products.html, quote-request.html   # Shell pages rendered by js/store.js
├── admin.html                  # Management panel (js/admin.js)
├── server.py                   # Flask app: API, auth, uploads, static files
├── mailer.py                   # Quote confirmation emails (SMTP + PDF)
├── passenger_wsgi.py           # cPanel Python App entry point
├── build_deploy.py             # Builds the deployment zips
├── requirements.txt, .env.example
├── AGENTS.md, CLAUDE.md        # Agent guidance (CLAUDE.md points to AGENTS.md)
├── data/products.json          # Seed catalogue
├── tests/                      # unittest suite
├── css/
│   ├── style.css, home-utilities.css   # Homepage
│   ├── catalogue.css, navigation.css   # Catalogue pages and shared nav
│   └── polish.css                      # Animations and admin styling
├── js/
│   ├── store.js, admin.js, ui.js, navigation.js, quote.js
│   └── vendor/                         # Lucide icons (homepage)
└── assets/
    ├── RC_Logo*.png, HomeBanner*.jpg   # Branding and hero images
    ├── categories/                     # Default category illustrations (SVG)
    ├── icons/                          # Homepage feature icons
    ├── product_images/                 # Product photos matched by stock code (git-ignored)
    └── uploads/                        # Admin uploads (created at runtime, git-ignored)
```

---


## 🎨 Typography & Fonts

- **Font Family**: [Montserrat](https://fonts.google.com/specimen/Montserrat) (weights: `400`, `500`, `600`, `700`, `800`, `900`)
- **Fallback Fonts**: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **How it is loaded**:
  - In `index.html` (lines 18–19):
    ```html
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    ```
  - In `css/style.css` (line 7):
    ```css
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
    ```

---

## 🎯 Brand Color Palette

Defined in `css/style.css` (lines 10–27) as CSS custom properties and in Tailwind configuration in `index.html`:

| Name | Hex Code | Usage |
| :--- | :--- | :--- |
| `--rc-primary` | `#141414` | Dark navbar, footer, stat strip, CTA section |
| `--rc-red` | `#d63121` | Brand red accent, primary buttons, red headings |
| `--rc-red-dark` | `#b02519` | Button hover state, interactive hover highlights |
| `--rc-bg` | `#ffffff` | Page background |
| `--rc-gray-50` | `#f9fafb` | Light background for cards / sections |
| `--rc-gray-200`| `#e5e7eb` | Subtle borders and dividers |
| `--rc-gray-500`| `#6b7280` | Muted body text and captions |

---

## 🖼️ Image & Asset Inventory (Local vs. Fetched)

### 1. Local Assets (Stored inside `assets/`)
These files are stored on your local disk and load instantly without requiring an external internet connection:

- **Logos**:
  - `assets/RC_Logo.png` — Standard logo badge with dark outline.
  - `assets/RC_Logo Inverted.png` — White disc emblem with red text.
  - `assets/RC_Logo Inverted_NoTxt.png` — White disc emblem with red flask (no text).
- **Hero Banners**:
  - `assets/HomeBanner2.png` — Current active hero banner (clean small-scale packaging line, 5L & 25L containers, no people, no forklifts).
  - `assets/HomeBanner_SmallScale1.jpg` — Alternative close-up workshop filling image.
  - `assets/HomeBanner_SmallScale2.jpg` — Alternative wide workshop filling image.
- **Icons**:
  - `assets/icons/13.1.svg` — Laboratory beaker icon (Chemical Manufacturers).
  - `assets/icons/13.2.svg` — Factory & house icon (Industrial & Domestic Products).
  - `assets/icons/13.3.svg` — Quality seal check icon (Quality Solutions).
  - `assets/icons/13.4.svg` — Handshake icon (Dedicated Service).
- **Product Media**:
  - `assets/02_Product Media/*.png` — 36 authentic product photos with Rangechem label formatting (e.g. `Dish O Max.png`, `Degrakleen.png`, `AUTO WASH.png`, `BLEACH.png`, etc.).

### 2. Remote / Fetched Resources (Loaded via CDN/URL)
These external resources require an internet connection:

- **Cape Town Image (About Section)**:
  `https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800&q=80` (Located in `index.html` line 205).
- **Hero Image Fallback**:
  `https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1920&q=80` (Located in `css/style.css` line 190).
- **Lucide Icons Library**:
  `js/vendor/lucide.min.js` (pinned Lucide 0.468.0) (Used for UI icons such as phone, mail, map-pin, menu, chevron, etc.).
- **Tailwind CSS CDN**:
  Precompiled locally in `css/home-utilities.css`; no runtime CDN script.

---

## 🛠️ How to Make Common Changes

### 1. How to Change the Hero Banner Image
1. Place your new image inside the `assets/` folder (e.g., `assets/MyNewBanner.jpg`).
2. Open `css/style.css` and find line 190 (`.hero-bg`):
   ```css
   .hero-bg {
       position: absolute;
       inset: 0;
       background-image: url('../assets/HomeBanner2.png'), url('https://images.unsplash.com/...');
       ...
   }
   ```
3. Replace `../assets/HomeBanner2.png` with your new image path, for example:
   ```css
   background-image: url('../assets/HomeBanner_SmallScale2.jpg');
   ```

---

### 2. How to Change or Resize the Logo
- **Switch the Logo Image**:
  In `index.html` (around line 41), locate:
  ```html
  <a href="index.html" class="nav-logo" aria-label="Rangechem home">
      <img src="assets/RC_Logo.png" alt="Rangechem Logo" class="h-12 sm:h-14 md:h-16 w-auto inline-block mr-3">RANGE<span>CHEM</span>
  </a>
  ```
  Change `src="assets/RC_Logo.png"` to `src="assets/RC_Logo Inverted_NoTxt.png"` or any logo file in `assets/`.
- **Change Logo Size in HTML**:
  Modify the Tailwind height classes on the `<img>` tag:
  - Smaller: `class="h-10 sm:h-12 w-auto ..."`
  - Larger: `class="h-14 sm:h-16 md:h-20 w-auto ..."`
- **Change Logo Text Size in CSS**:
  In `css/style.css` (lines 64–72), adjust:
  ```css
  .nav-logo {
      font-size: clamp(1.6rem, 2.2vw, 2rem);
      ...
  }
  ```

---

### 3. How to Update Statistics
In `index.html` (lines 173–195), locate the **STATS STRIP**:
```html
<div class="stat-number">30+</div>
<div class="text-white/50 text-sm font-600 mt-1 uppercase tracking-wider">Years in Industry</div>

<div class="stat-number">150+</div>
<div class="text-white/50 text-sm font-600 mt-1 uppercase tracking-wider">Products Available</div>

<div class="stat-number">200+</div>
<div class="text-white/50 text-sm font-600 mt-1 uppercase tracking-wider">Provincial Clients</div>

<div class="stat-number">100+</div>
<div class="text-white/50 text-sm font-600 mt-1 uppercase tracking-wider">Deliveries Monthly</div>
```
Simply edit the numbers or the text labels directly.

---

### 4. How to Update Contact Details & Addresses
In `index.html` (lines 355–385), locate the **Contact Us** section in the footer:

- **Email**:
  ```html
  <a href="mailto:info@rangechem.co.za" class="footer-link mb-0">info@rangechem.co.za</a>
  ```
- **Phone**:
  ```html
  <a href="tel:0219813320" class="footer-link mb-0">021 981 3320</a>
  ```
- **WhatsApp**:
  ```html
  <a href="https://wa.me/27813204172" target="_blank" rel="noopener noreferrer" class="footer-link mb-0">+27 81 320 4172</a>
  ```
- **Physical Address**:
  ```html
  <span class="text-sm text-white/60 leading-relaxed">
      7 Professional House, Old Paarl Rd &amp; Lood St,<br>Brackenfell, Cape Town, 7560
  </span>
  ```
- **Google Maps Link**:
  ```html
  <a href="https://www.google.com/maps/search/?api=1&query=7+Professional+House,+Old+Paarl+Rd+%26+Lood+St,+Brackenfell,+Cape+Town,+7560" target="_blank" rel="noopener noreferrer">
      View on Google Maps
  </a>
  ```

---

### 5. How to Use Real Product Media Photos
You have 36 transparent PNG product renders in `assets/02_Product Media/`. To use them in a product card or gallery:
```html
<div class="product-card">
    <div class="product-card-img-wrap">
        <img src="assets/02_Product Media/Dish O Max.png" alt="Dish O Max Dishwashing Liquid">
    </div>
    <div class="product-card-body">
        <h3 class="product-card-title">Dish "O" Max</h3>
        <p class="product-card-desc">Dishwashing liquid & general-purpose cleaner.</p>
    </div>
</div>
```

---

## 🚀 Running & Viewing the Website
Because this project is built with clean HTML5, Vanilla CSS, and modern JavaScript:
- Double-click `index.html` to open it in any modern browser (Chrome, Edge, Safari, Firefox).
- Or run a local live-reload server (such as VS Code Live Server or `npx serve .`) from this folder.
