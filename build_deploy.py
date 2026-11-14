"""Build the cPanel deployment bundle: python build_deploy.py

1. Stamps a content-based ?v= cache-busting version onto the project's own CSS/JS links in the HTML pages.
2. Writes dist/rangechem-code.zip (small; upload and extract in the application root) and
   dist/rangechem-product-images.zip (large; only needed on first deploy or when photos change).

Never included: git history, tests, local-only tooling, databases, .env files, assets/uploads (live
admin uploads) and the unused design alternates listed in UNUSED below.
"""
import hashlib
import os
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
SKIP_DIRS = {'.git', '.local', '.claude', '__pycache__', 'tests', 'dist', 'uploads', '.venv', 'venv'}
SKIP_FILES = {'compose.yaml', 'start_local.py', 'import_products.py', 'build_deploy.py', '.gitignore', 'AGENTS.md', 'CLAUDE.md', '.env', '.env.example'}
SKIP_SUFFIXES = ('.pyc', '.db', '.db-journal', '.zip')
# Design alternates that nothing references. Remove a path from here if a page starts using it.
UNUSED = ('assets/HomeBanner_Option', 'assets/containers-', 'assets/icons/container-duo.svg', 'assets/products/')
VERSIONED = ('css/polish.css', 'js/ui.js', 'js/store.js', 'js/admin.js')


def stamp_versions():
    changed = []
    for asset in VERSIONED:
        version = hashlib.sha1((ROOT / asset).read_bytes()).hexdigest()[:8]
        pattern = re.compile(re.escape(asset) + r'(\?v=[0-9a-z]+)?"')
        for page in ROOT.glob('*.html'):
            text = page.read_text(encoding='utf-8')
            new = pattern.sub('%s?v=%s"' % (asset, version), text)
            if new != text:
                page.write_text(new, encoding='utf-8'); changed.append(page.name)
    return sorted(set(changed))


def build():
    DIST.mkdir(exist_ok=True)
    code = zipfile.ZipFile(DIST / 'rangechem-code.zip', 'w', zipfile.ZIP_DEFLATED)
    images = zipfile.ZipFile(DIST / 'rangechem-product-images.zip', 'w', zipfile.ZIP_DEFLATED)
    counts = {'code': 0, 'images': 0}
    for folder, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            path = Path(folder) / name
            rel = path.relative_to(ROOT).as_posix()
            if name in SKIP_FILES or name.endswith(SKIP_SUFFIXES) or rel.startswith(UNUSED):
                continue
            target, key = (images, 'images') if rel.startswith('assets/product_images/') else (code, 'code')
            target.write(path, rel); counts[key] += 1
    code.close(); images.close()
    return counts


if __name__ == '__main__':
    stamped = stamp_versions()
    counts = build()
    print('Cache versions updated in: ' + (', '.join(stamped) or 'nothing (already current)'))
    for name, key in (('rangechem-code.zip', 'code'), ('rangechem-product-images.zip', 'images')):
        print('dist/%s: %d files, %.1f MB' % (name, counts[key], (DIST / name).stat().st_size / 1e6))
