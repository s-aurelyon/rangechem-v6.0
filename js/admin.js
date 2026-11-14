const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, data) {
  const r = await fetch(url, data ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)} : {});
  if (!r.ok) { let e; try { e = (await r.json()).error; } catch {} throw Error(e || 'Access denied or request failed'); }
  return r.json();
}
const PAGE = 48;
const pencil = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const imageIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.8"/><path d="m21 15-5-5L5 21"/></svg>';
const state = {view:'categories', category:null, q:'', list:[], shown:0};
let products = [], quotes = [];
const dialog = $('#product-dialog'), form = $('#product-form');
const stagger = i => `style="--i:${Math.min(i, 12)}"`;

/* ---------------------------------------------------------------- stats */
function countUp(el, to) {
  if (RC.reduceMotion() || to < 2) { el.textContent = to.toLocaleString(); return; }
  const start = performance.now();
  const tick = now => { const t = Math.min(1, (now - start) / 700); el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))).toLocaleString(); if (t < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
function renderStats(animate) {
  const missing = products.filter(p => !p.display_image).length;
  const cats = new Set(products.map(p => p.category)).size;
  const tiles = [['Products', products.length], ['Categories', cats], ['Missing images', missing, missing ? 'warn' : ''], ['Quote requests', quotes.length]];
  $('#stats').innerHTML = tiles.map(([label, n, cls]) => `<div class="stat ${cls || ''}"><b data-n="${n}">${animate ? 0 : n.toLocaleString()}</b><span>${label}</span></div>`).join('');
  if (animate) $('#stats').querySelectorAll('b').forEach(b => countUp(b, Number(b.dataset.n)));
  const badge = $('#quote-badge-count');
  badge.hidden = !quotes.length; badge.textContent = quotes.length;
}

/* ---------------------------------------------------------------- product browsing */
function productCard(p, i) {
  return `<article class="card product-card admin-card reveal" ${stagger(i)} data-id="${p.id}"><button type="button" class="icon-btn edit-btn" data-edit="${p.id}" aria-label="Edit ${esc(p.name)}" title="Edit">${pencil}</button>${p.display_image ? '' : '<span class="pill">No image</span>'}<div class="product-media${p.display_image ? ' is-loading' : ''}">${p.display_image ? `<img class="fade" src="${esc(p.display_image)}" alt="" loading="lazy" width="200" height="150">` : RC.noImage}</div><div class="card-body"><small class="product-category">${esc(p.category)}</small><h3>${esc(p.name)}</h3><small class="product-meta">${esc([p.size, p.stock_code].filter(Boolean).join(' / ')) || '&nbsp;'}</small></div></article>`;
}
function renderTiles() {
  const byCat = new Map();
  for (const p of products) { const c = byCat.get(p.category) || {n:0, missing:0}; c.n++; if (!p.display_image) c.missing++; byCat.set(p.category, c); }
  const cats = [...byCat.keys()].sort();
  $('#browse').innerHTML = `<div class="grid admin-grid">${cats.map((c, i) => `<div class="cat-wrap reveal" ${stagger(i)}><button type="button" class="cat-tile" data-cat="${esc(c)}"><div class="category-media"><img src="${esc(RC.categoryImage(c))}" alt="" width="256" height="240"></div><div class="tile-body"><h3>${esc(c)}</h3><small>${byCat.get(c).n} products${byCat.get(c).missing ? ` · <span class="warn">${byCat.get(c).missing} without image</span>` : ''}</small></div></button><button type="button" class="icon-btn edit-btn" data-cat-edit="${esc(c)}" aria-label="Change image for ${esc(c)}" title="Change category image">${imageIcon}</button></div>`).join('')}</div>`;
  $('#more').hidden = true;
}
function renderGrid() {
  $('#browse').innerHTML = state.list.length ? '<div class="grid admin-grid" id="admin-grid"></div>' : '<div class="panel empty-state"><h2>No products found</h2><p>Try a different search or category.</p></div>';
  state.shown = 0;
  if (state.list.length) appendPage();
  else $('#more').hidden = true;
}
function appendPage() {
  const grid = $('#admin-grid'); if (!grid) return;
  const batch = state.list.slice(state.shown, state.shown + PAGE);
  grid.insertAdjacentHTML('beforeend', batch.map((p, i) => productCard(p, i)).join(''));
  state.shown += batch.length;
  RC.watchImages(grid);
  $('#more').hidden = state.shown >= state.list.length;
  observer.unobserve($('#sentinel')); observer.observe($('#sentinel'));
}
const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting) && state.shown < state.list.length) appendPage(); }, {rootMargin:'500px 0px'});

function renderCrumbs(html) { const el = $('#crumbs'); el.hidden = !html; el.innerHTML = html || ''; }
function renderProducts() {
  const q = state.q.trim().toLowerCase();
  $('[data-view][aria-pressed]').parentElement.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  if (q) {
    state.list = products.filter(p => [p.name, p.stock_code, p.category, p.tags, p.size].some(v => String(v || '').toLowerCase().includes(q)));
    renderCrumbs(`<span class="here">Search results</span><span class="count">${state.list.length.toLocaleString()} match${state.list.length === 1 ? '' : 'es'}</span>`);
    return renderGrid();
  }
  if (state.view === 'categories' && !state.category) { renderCrumbs(''); return renderTiles(); }
  state.list = state.category ? products.filter(p => p.category === state.category) : products;
  renderCrumbs(state.category
    ? `<button type="button" data-cat="">All categories</button><span class="sep">&rsaquo;</span><span class="here">${esc(state.category)}</span><span class="count">${state.list.length.toLocaleString()} products</span><button type="button" data-cat-edit="${esc(state.category)}">Change category image</button>`
    : `<span class="here">All products</span><span class="count">${state.list.length.toLocaleString()} products</span>`);
  renderGrid();
}

$('#find').addEventListener('input', (() => { let t; return e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; renderProducts(); }, 160); }; })());
$('#find').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim().toLowerCase(); if (!q) return;
  const hit = products.find(p => (p.stock_code || '').toLowerCase() === q) || (state.list.length === 1 ? state.list[0] : null);
  if (hit) { e.preventDefault(); openEdit(hit); }
});
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
  state.view = b.dataset.view; state.category = null; state.q = ''; $('#find').value = ''; renderProducts();
}));
$('#more').onclick = appendPage;
$('#crumbs').onclick = e => {
  const edit = e.target.closest('[data-cat-edit]'); if (edit) return openCategoryImage(edit.dataset.catEdit);
  const b = e.target.closest('[data-cat]'); if (b) { state.category = b.dataset.cat || null; renderProducts(); }
};
$('#browse').onclick = e => {
  const edit = e.target.closest('[data-cat-edit]'); if (edit) return openCategoryImage(edit.dataset.catEdit);
  const tile = e.target.closest('.cat-tile');
  if (tile) { state.category = tile.dataset.cat; renderProducts(); window.scrollTo({top: $('.tabs').offsetTop - 120, behavior: RC.reduceMotion() ? 'auto' : 'smooth'}); return; }
  const card = e.target.closest('.admin-card');
  if (card) openEdit(products.find(p => p.id === Number(card.dataset.id)));
};

/* ---------------------------------------------------------------- tabs */
function selectTab(name, push) {
  if (!['products', 'homepage', 'quotes'].includes(name)) name = 'products';
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
  $('#new').hidden = name !== 'products';
  if (push) history.replaceState(null, '', name === 'products' ? location.pathname : '#' + name);
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab, true)));
document.querySelector('.tabs').addEventListener('keydown', e => {
  if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  const tabs = [...document.querySelectorAll('.tab')], i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  next.focus(); selectTab(next.dataset.tab, true);
});

/* ---------------------------------------------------------------- edit dialog */
let tags = [], snapshot = '', deleteArmed = null;
const fields = ['id', 'name', 'category', 'stock_code', 'size', 'description', 'image'];
const current = () => JSON.stringify([fields.map(k => form.elements[k].value), tags]);
const isDirty = () => dialog.open && current() !== snapshot;

function renderTagEditor() {
  const input = $('#tag-input');
  $('#tag-editor').querySelectorAll('.tag-pill').forEach(el => el.remove());
  input.before(...tags.map((t, i) => Object.assign(document.createElement('span'), {className:'tag-pill', innerHTML:`${esc(t)}<button type="button" data-remove-tag="${i}" aria-label="Remove tag ${esc(t)}">&times;</button>`})));
  form.elements.tags.value = tags.join(', ');
}
function addTags(text) {
  for (const t of String(text).split(',').map(x => x.trim()).filter(Boolean)) if (!tags.some(x => x.toLowerCase() === t.toLowerCase())) tags.push(t);
  renderTagEditor();
}
$('#tag-input').addEventListener('keydown', e => {
  const input = e.target;
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTags(input.value); input.value = ''; }
  else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); renderTagEditor(); }
});
$('#tag-input').addEventListener('blur', e => { if (e.target.value.trim()) { addTags(e.target.value); e.target.value = ''; } });
$('#tag-input').addEventListener('input', e => { if (e.target.value.includes(',')) { addTags(e.target.value); e.target.value = ''; } });
$('#tag-editor').addEventListener('click', e => {
  const b = e.target.closest('[data-remove-tag]');
  if (b) { tags.splice(Number(b.dataset.removeTag), 1); renderTagEditor(); }
  else $('#tag-input').focus();
});

function updateTagSuggestions() {
  const cat = form.elements.category.value.trim(), counts = new Map();
  for (const p of products) if (!cat || p.category === cat) for (const t of String(p.tags || '').split(',').map(x => x.trim()).filter(Boolean)) counts.set(t, (counts.get(t) || 0) + 1);
  $('#tag-list').innerHTML = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([t]) => `<option value="${esc(t)}">`).join('');
}
function updatePreview() {
  const id = form.elements.id.value, p = products.find(x => x.id === Number(id));
  const override = form.elements.image.value.trim();
  const src = override || (p && !p.image ? p.display_image : '');
  $('#preview').innerHTML = src ? `<img src="${esc(src)}" alt="Product preview">` : RC.noImage;
  $('#preview-note').textContent = override ? 'Custom image' : src ? 'Matched automatically from the stock code' : 'No image yet — upload one, or add a file named with the stock code';
  $('#reset-image').hidden = !override;
  const img = $('#preview img'); if (img) img.onerror = () => { $('#preview').innerHTML = RC.noImage; };
}

function openEdit(p) {
  form.reset();
  $('#product-status').textContent = '';
  for (const k of fields) form.elements[k].value = p ? (p[k] ?? '') : '';
  tags = []; addTags(p ? p.tags || '' : '');
  $('#dialog-title').textContent = p ? 'Edit product' : 'New product';
  $('#dialog-sub').textContent = p ? [p.stock_code, p.category].filter(Boolean).join(' · ') : 'Add a product to the range';
  $('#delete').hidden = !p; disarmDelete();
  $('details.advanced').open = !!(p && p.image);
  if (!p && state.category) form.elements.category.value = state.category;
  $('#category-list').innerHTML = [...new Set(products.map(x => x.category))].sort().map(c => `<option value="${esc(c)}">`).join('');
  updateTagSuggestions(); updatePreview();
  snapshot = current();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.modal-body').scrollTop = 0;
  form.elements.name.focus();
}
function tryClose() {
  if (isDirty() && !confirm('Discard your unsaved changes?')) return;
  dialog.close();
}
dialog.addEventListener('cancel', e => { if (isDirty() && !confirm('Discard your unsaved changes?')) e.preventDefault(); });
dialog.addEventListener('click', e => { if (e.target === dialog) tryClose(); });
$('#dialog-close').onclick = $('#cancel').onclick = tryClose;
$('#new').onclick = () => openEdit(null);
form.elements.category.addEventListener('change', updateTagSuggestions);
form.elements.image.addEventListener('input', updatePreview);
$('#reset-image').onclick = () => { form.elements.image.value = ''; updatePreview(); };

async function upload(input, target) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 5000000) throw Error('Choose an image smaller than 5 MB.');
  const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
  target.value = (await api('/api/upload', {name:file.name, content})).path;
  input.value = '';
}
$('#product-upload').onchange = async e => {
  $('#product-status').textContent = 'Uploading…';
  try { await upload(e.target, form.elements.image); form.elements.image.dispatchEvent(new Event('input')); $('details.advanced').open = true; $('#product-status').textContent = 'Image uploaded — save the product to apply it.'; }
  catch (err) { $('#product-status').textContent = err.message; }
};

form.onsubmit = async e => {
  e.preventDefault();
  if (document.activeElement === $('#tag-input') && $('#tag-input').value.trim()) { addTags($('#tag-input').value); $('#tag-input').value = ''; }
  const button = $('#save'); button.disabled = true; button.textContent = 'Saving…';
  try {
    const wasNew = !form.elements.id.value;
    const saved = await api('/api/product', Object.fromEntries(new FormData(form)));
    snapshot = current(); dialog.close();
    await refreshProducts();
    RC.toast(wasNew ? 'Product added' : 'Product saved');
    return saved;
  } catch (err) { $('#product-status').textContent = err.message; }
  finally { button.disabled = false; button.textContent = 'Save product'; }
};

function disarmDelete() { clearTimeout(deleteArmed); const b = $('#delete'); b.classList.remove('danger-solid'); b.textContent = 'Delete product'; }
$('#delete').onclick = async () => {
  const b = $('#delete');
  if (!b.classList.contains('danger-solid')) {
    b.classList.add('danger-solid'); b.textContent = 'Click again to confirm';
    deleteArmed = setTimeout(disarmDelete, 4000); return;
  }
  disarmDelete();
  try {
    await api('/api/delete-product', {id:form.elements.id.value});
    snapshot = current(); dialog.close();
    await refreshProducts();
    RC.toast('Product deleted');
  } catch (err) { $('#product-status').textContent = err.message; }
};

async function refreshProducts() {
  products = await api('/api/products');
  if (state.category && !products.some(p => p.category === state.category)) state.category = null;
  renderStats(false); renderProducts();
}

/* ---------------------------------------------------------------- category image */
const catDialog = $('#category-dialog'), catForm = $('#category-form');
function updateCategoryPreview() {
  const custom = catForm.elements.image.value.trim();
  $('#cat-preview').innerHTML = `<img src="${esc(custom || RC.defaultCategoryImage(catForm.elements.category.value))}" alt="Category image preview">`;
  $('#cat-reset').hidden = !custom;
  $('#cat-note').textContent = custom ? 'Custom image' : 'Default illustration';
}
function openCategoryImage(category) {
  catForm.reset();
  catForm.elements.category.value = category;
  catForm.elements.image.value = RC.categoryImage(category) === RC.defaultCategoryImage(category) ? '' : RC.categoryImage(category);
  $('#cat-title').textContent = category;
  $('#cat-status').textContent = '';
  updateCategoryPreview();
  catDialog.showModal();
}
catForm.elements.image.addEventListener('input', updateCategoryPreview);
$('#cat-reset').onclick = () => { catForm.elements.image.value = ''; updateCategoryPreview(); };
$('#cat-cancel').onclick = $('#cat-close').onclick = () => catDialog.close();
catDialog.addEventListener('click', e => { if (e.target === catDialog) catDialog.close(); });
$('#cat-upload').onchange = async e => {
  $('#cat-status').textContent = 'Uploading…';
  try { await upload(e.target, catForm.elements.image); updateCategoryPreview(); $('#cat-status').textContent = 'Uploaded — save to apply it.'; }
  catch (err) { $('#cat-status').textContent = err.message; }
};
catForm.onsubmit = async e => {
  e.preventDefault();
  const button = $('#cat-save'); button.disabled = true;
  try {
    const result = await api('/api/category-image', {category:catForm.elements.category.value, image:catForm.elements.image.value.trim()});
    RC.setCategoryImages(result.category_images);
    catDialog.close(); renderProducts(); RC.toast('Category image saved');
  } catch (err) { $('#cat-status').textContent = err.message; }
  finally { button.disabled = false; }
};

/* ---------------------------------------------------------------- homepage settings */
const settingsForm = $('#settings-form');
function updateHeroPreview() {
  const img = settingsForm.elements.hero_image.value.trim(), box = $('#hero-preview');
  box.style.backgroundImage = img ? `url(${JSON.stringify(img)})` : '';
  $('#hero-preview-title').textContent = settingsForm.elements.hero_title.value || 'Default heading';
}
settingsForm.addEventListener('input', updateHeroPreview);
$('#hero-upload').onchange = async e => {
  try { await upload(e.target, settingsForm.elements.hero_image); updateHeroPreview(); $('#settings-status').textContent = 'Image uploaded; save homepage settings to apply it.'; }
  catch (err) { $('#settings-status').textContent = err.message; }
};
settingsForm.onsubmit = async e => {
  e.preventDefault();
  try { await api('/api/settings', Object.fromEntries(new FormData(e.target))); $('#settings-status').textContent = ''; RC.toast('Homepage settings saved'); }
  catch (err) { $('#settings-status').textContent = err.message; }
};

/* ---------------------------------------------------------------- quote requests */
function renderQuotes() {
  $('#quotes').innerHTML = quotes.map((q, i) => {
    let c = {}, items = [];
    try { c = JSON.parse(q.customer); items = JSON.parse(q.items); } catch {}
    const when = new Date(q.created), date = isNaN(when) ? q.created : when.toLocaleString([], {dateStyle:'medium', timeStyle:'short'});
    const total = items.reduce((n, x) => n + (Number(x.quantity) || 0), 0);
    const subject = encodeURIComponent('Your Rangechem quote request');
    return `<details class="quote-card reveal" ${stagger(i)}><summary><span class="quote-avatar" aria-hidden="true">${esc((c.name || '?').trim().charAt(0).toUpperCase())}</span><span class="quote-who"><strong>${esc(c.name)} <span class="quote-ref">RC-${String(q.id).padStart(5, '0')}</span></strong><small>${esc([c.company, c.email].filter(Boolean).join(' · '))}</small></span><span class="quote-meta">${items.length} product${items.length === 1 ? '' : 's'} · ${total} item${total === 1 ? '' : 's'}</span><span class="quote-meta">${esc(date)}</span></summary><div class="quote-body"><p class="muted">${esc([c.email, c.phone].filter(Boolean).join(' · '))}</p>${c.message ? `<p class="quote-message">${esc(c.message)}</p>` : ''}<table><thead><tr><th>Product</th><th>Size</th><th>Stock code</th><th class="num">Qty</th></tr></thead><tbody>${items.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.size)}</td><td>${esc(x.stock_code)}</td><td class="num">${esc(x.quantity)}</td></tr>`).join('')}</tbody></table>${c.email ? `<a class="button" href="mailto:${esc(c.email)}?subject=${subject}">Reply by email</a>` : ''}</div></details>`;
  }).join('') || '<div class="panel empty-state"><h2>No quote requests yet</h2><p>New requests from the website will appear here.</p></div>';
}

/* ---------------------------------------------------------------- start */
async function load() {
  $('#browse').innerHTML = `<div class="grid admin-grid">${Array.from({length:8}, () => '<div class="card skeleton-card"><div class="skeleton" style="height:120px;border-radius:0"></div><div class="card-body"><div class="skeleton sk-line sk-mid"></div><div class="skeleton sk-line sk-short"></div></div></div>').join('')}</div>`;
  await api('/api/admin');
  const [prods, settings, qs] = await Promise.all([api('/api/products'), api('/api/settings'), api('/api/quotes')]);
  products = prods; quotes = qs;
  for (const k of ['hero_title', 'hero_text', 'hero_image']) settingsForm.elements[k].value = settings[k] || '';
  RC.setCategoryImages(settings.category_images);
  updateHeroPreview(); renderQuotes(); renderStats(true); renderProducts();
  selectTab(location.hash.slice(1), false);
}
selectTab('products', false);
load().catch(e => { $('#browse').innerHTML = ''; $('#error').textContent = e.message + '. Set ADMIN_PASSWORD and sign in as admin.'; });
