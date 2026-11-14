const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cart = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('rangechem_quote') || '[]');
    return Array.isArray(saved) ? saved.filter(x => Number.isInteger(x?.id) && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 10000) : [];
  } catch { return []; }
};
function saveCart(items) {
  try { localStorage.setItem('rangechem_quote', JSON.stringify(items)); }
  catch { throw Error('Your browser could not save the quote. Please enable site storage and try again.'); }
  count();
}
function count() { const el = $('#nav-quote-count'); if (el) el.textContent = cart().reduce((n, x) => n + x.quantity, 0); }
window.addEventListener('storage', count);
async function api(url, data) {
  const r = await fetch(url, data ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)} : {});
  if (!r.ok) { let error; try { error = (await r.json()).error; } catch {} throw Error(error || 'Request failed. Please try again.'); }
  return r.json();
}
const categoryCopy = {'Auto':'Care for vehicles, from the workshop to the finishing touch.','Bathroom':'Keep washrooms fresh, clean and ready for use.','Consumables':'Everyday essentials to keep your operation stocked.','Fabric Care':'Specialist care for textiles and upholstery.','Floorcare':'Cleaning and maintenance for hardworking floors.','General Cleaning':'Versatile solutions for everyday cleaning tasks.','Industrial Cleaning':'Cleaning solutions for demanding working environments.','Janitorial':'Tools and equipment for a thorough clean.','Kitchen':'Cleaning essentials for kitchens and food preparation areas.','Laundry':'Solutions for fresh, clean laundry.','PPE & Safety':'Protective equipment for the task at hand.'};
const categoryImage = name => window.RC ? RC.categoryImage(name) : 'assets/categories/category.svg';
const intro = (title, text) => `<section class="intro"><div class="intro-inner"><p class="eyebrow">RANGECHEM / CLEANING &amp; HYGIENE</p><h1>${esc(title)}</h1><p>${esc(text)}</p><div class="intro-rule"></div></div></section>`;
document.body.insertAdjacentHTML('beforeend', `<footer class="store-footer"><div><strong class="store-footer-brand"><img src="assets/RC_Logo.png" alt="" width="36" height="36">RANGE <span>CHEM</span></strong><p>Industrial cleaning solutions. Personal service.</p></div><div><a href="categories.html">Explore the range</a><a href="mailto:info@rangechem.co.za">info@rangechem.co.za</a><a href="tel:0219813320">021 981 3320</a></div></footer>`);
count();
const notify = (message, type) => window.RC ? RC.toast(message, type) : null;
const main = $('main');
const page = main.dataset.page;

/* ---------- small helpers ---------- */
const skeletonCard = () => `<div class="card skeleton-card" aria-hidden="true"><div class="skeleton sk-media"></div><div class="card-body"><div class="skeleton sk-line sk-short"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line sk-mid"></div><div class="skeleton sk-btn"></div></div></div>`;
const skeletons = n => Array.from({length:n}, skeletonCard).join('');
const stagger = i => `style="--i:${Math.min(i, 12)}"`;
const TAG_LABELS = {ppe:'PPE', pvc:'PVC', uv:'UV'};
const tagLabel = t => TAG_LABELS[t] || t.replace(/(^|[\s(\/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const noImage = '<span class="image-placeholder">Image coming soon</span>';
const watchImages = root => RC.watchImages(root);

async function start() {
  if (page === 'categories') {
    main.innerHTML = intro('Find your cleaning solution', 'Explore our cleaning and hygiene range, organised around the work you do.') + `<div class="wrap"><div class="section-heading"><div><p class="eyebrow">OUR RANGE</p><h2>All categories</h2></div><a class="text-link" href="products.html">View all products &rarr;</a></div><div class="grid category-grid" id="category-grid" aria-busy="true">${skeletons(6)}</div></div>`;
  } else if (page === 'catalogue') {
    const wanted = new URLSearchParams(location.search).get('category');
    main.innerHTML = intro(wanted || 'Our products', 'Find the right product and add it to your quote. Our team will help with the rest.') + `<div class="wrap"><a class="text-link" href="categories.html">&larr; All categories</a><div class="skeleton sk-filter" aria-hidden="true"></div><div id="products" class="grid" aria-busy="true">${skeletons(8)}</div></div>`;
  } else if (page === 'quote') {
    main.innerHTML = intro('Let\'s build your quote', 'Review your selection and send us your details. Our team will prepare your quote.') + `<div class="wrap quote-layout"><section class="panel"><p class="eyebrow">YOUR SELECTION</p><h2>Quote items</h2><div id="cart"><div class="skeleton sk-row"></div><div class="skeleton sk-row"></div></div></section><div class="panel"><div class="skeleton sk-line sk-short"></div><div class="skeleton sk-row"></div></div></div>`;
  }

  // navigation.js shares this request with the dropdown.
  const products = await (window.rangechemProducts || api('/api/products'));
  const cats = [...new Set(products.map(p => p.category))].sort();

  if (page === 'categories') {
    const grid = $('#category-grid');
    const counts = products.reduce((m, p) => m.set(p.category, (m.get(p.category) || 0) + 1), new Map());
    grid.innerHTML = cats.map((c, i) => `<a class="card category-card reveal" ${stagger(i)} href="products.html?category=${encodeURIComponent(c)}"><div class="category-media"><img src="${categoryImage(c)}" alt="" width="256" height="240" loading="lazy"></div><div class="card-body"><small>${counts.get(c)} PRODUCTS</small><h3>${esc(c)}</h3><p>${esc(categoryCopy[c] || 'Explore products in this category.')}</p><span class="accent">Explore category <span class="arrow">&rarr;</span></span></div></a>`).join('');
    grid.removeAttribute('aria-busy');
    return;
  }

  if (page === 'catalogue') return catalogue(products, cats);
  if (page === 'quote') return quotePage(products);
}

/* ------------------------------------------------------------------ catalogue */
function catalogue(products, cats) {
  const PAGE = 48;
  const params = new URLSearchParams(location.search);
  const initial = cats.includes(params.get('category')) ? params.get('category') : '';
  const sizes = [...new Set(products.map(p => p.size).filter(Boolean))].sort();
  const selTags = new Set(params.getAll('tag').map(t => t.trim().toLowerCase()).filter(Boolean));
  let tagsExpanded = false, shown = 0, filtered = [];

  // Pre-compute a lowercase search string and de-duplicated tag list for every product.
  const tagTotals = new Map();
  for (const p of products) {
    p._tags = [...new Set(String(p.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean))];
    p._hay = [p.name, p.description, p.stock_code, p.tags, p.category, p.size].map(v => String(v || '').toLowerCase()).join('\u0001');
    p._tags.forEach(t => tagTotals.set(t, (tagTotals.get(t) || 0) + 1));
  }
  const isGenericTag = t => t.length <= 28 && !t.includes(' - ');
  const cardTags = p => p._tags.filter(t => { const n = tagTotals.get(t); return isGenericTag(t) && n >= 3 && n <= products.length * .25 && t !== p.category.toLowerCase(); }).slice(0, 2);

  $('.intro h1').textContent = initial || 'Our products';
  const wrap = $('.wrap');
  wrap.querySelector('.sk-filter').outerHTML = `<div class="controls filter-panel"><label class="search-field">Search the range<input id="search" type="search" placeholder="Product, stock code or keyword" value="${esc(params.get('q') || '')}"></label><label>Category<select id="category"><option value="">All categories</option>${cats.map(c => `<option ${c === initial ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label><label>Pack size<select id="size"><option value="">All sizes</option>${sizes.map(s => `<option ${s === params.get('size') ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label><button id="clear" class="secondary">Reset filters</button></div><section class="tag-filter" id="tag-filter" aria-label="Filter by tag"><div class="tag-filter-head"><span>Filter by tag</span><button type="button" id="clear-tags" class="link-btn" hidden>Clear tags</button></div><div class="tag-chips" id="tag-chips"></div><button type="button" id="more-tags" class="link-btn" hidden></button></section><p id="result-count" class="muted" role="status"></p>`;
  $('#products').insertAdjacentHTML('afterend', '<div class="load-more"><button id="more" class="secondary">Show more products</button><div id="sentinel" aria-hidden="true"></div></div>');
  const grid = $('#products');

  const state = () => ({q: $('#search').value.trim().toLowerCase(), c: $('#category').value, s: $('#size').value});
  const matches = (p, f, withTags) => (!f.c || p.category === f.c) && (!f.s || p.size === f.s) && (!f.q || p._hay.includes(f.q)) && (!withTags || [...selTags].every(t => p._tags.includes(t)));

  function syncUrl() {
    const f = state(), u = new URLSearchParams();
    if (f.c) u.set('category', f.c);
    if ($('#search').value.trim()) u.set('q', $('#search').value.trim());
    if (f.s) u.set('size', f.s);
    selTags.forEach(t => u.append('tag', t));
    try { history.replaceState(null, '', u.toString() ? `?${u}` : location.pathname); } catch {}
  }

  function renderTags() {
    const f = state(), scope = products.filter(p => matches(p, f, true));
    const counts = new Map();
    for (const p of scope) for (const t of p._tags) counts.set(t, (counts.get(t) || 0) + 1);
    const floor = scope.length > 30 ? 2 : 1;
    // Selected tags always stay visible; tags matching every product (or one product) can't narrow anything.
    // Product-name style tags ("platform broom - soft fibre - black") describe one item, not a useful filter.
    let entries = [...counts].filter(([t, n]) => selTags.has(t) || (isGenericTag(t) && n < scope.length && n >= floor));
    for (const t of selTags) if (!counts.has(t)) entries.push([t, 0]);
    entries.sort((a, b) => (selTags.has(b[0]) - selTags.has(a[0])) || (b[1] - a[1]) || a[0].localeCompare(b[0]));
    // Synonym tags covering exactly the same products (e.g. "car care" / "automotive") would just add noise.
    const seen = new Set(), unique = [];
    for (const e of entries.slice(0, 120)) {
      if (!selTags.has(e[0])) {
        const sig = scope.filter(p => p._tags.includes(e[0])).map(p => p.id).join(',');
        if (seen.has(sig)) continue;
        seen.add(sig);
      }
      unique.push(e);
    }
    const limit = tagsExpanded ? 48 : 14;
    const visible = unique.slice(0, Math.max(limit, selTags.size));
    $('#tag-chips').innerHTML = visible.map(([t, n]) => `<button type="button" class="tag-chip" data-tag="${esc(t)}" aria-pressed="${selTags.has(t)}">${esc(tagLabel(t))}${n ? ` <span class="n">${n}</span>` : ''}${selTags.has(t) ? ' <span class="x" aria-hidden="true">&times;</span>' : ''}</button>`).join('');
    $('#tag-filter').hidden = !unique.length;
    $('#clear-tags').hidden = !selTags.size;
    const more = $('#more-tags');
    more.hidden = unique.length <= 14;
    more.textContent = tagsExpanded ? 'Show fewer tags' : `Show more tags (${unique.length - 14})`;
  }

  const cardHTML = (p, i, inQuote) => {
    const q = inQuote.get(p.id) || 0;
    const tags = cardTags(p);
    return `<article class="card product-card reveal${q ? ' in-quote' : ''}" ${stagger(i)} data-card="${p.id}"><div class="product-media${p.display_image ? ' is-loading' : ''}">${p.display_image ? `<img class="fade" src="${esc(p.display_image)}" alt="${esc(p.name)}" loading="lazy" width="240" height="200">` : noImage}<span class="in-quote-flag">&#10003; In quote${q ? ` &times; ${q}` : ''}</span></div><div class="card-body"><small class="product-category">${esc(p.category)}</small><h3>${esc(p.name)}</h3><small class="product-meta">${esc([p.size,p.stock_code].filter(Boolean).join(' / ')) || '&nbsp;'}</small>${tags.length ? `<div class="card-tags">${tags.map(t => `<button type="button" class="tag-chip" data-tag="${esc(t)}" aria-label="Filter by ${esc(tagLabel(t))}">${esc(tagLabel(t))}</button>`).join('')}</div>` : ''}<p>${esc(p.description)}</p><button data-add="${p.id}" aria-label="Add ${esc(p.name)} to quote"><span class="lbl">Add to quote</span> <span class="plus" aria-hidden="true">+</span></button></div></article>`;
  };

  function appendPage() {
    const inQuote = new Map(cart().map(x => [x.id, x.quantity]));
    const batch = filtered.slice(shown, shown + PAGE);
    grid.insertAdjacentHTML('beforeend', batch.map((p, i) => cardHTML(p, i, inQuote)).join(''));
    shown += batch.length;
    watchImages(grid);
    $('#more').hidden = shown >= filtered.length;
    observer.unobserve($('#sentinel')); observer.observe($('#sentinel'));
  }

  function render() {
    const f = state();
    filtered = products.filter(p => matches(p, f, true));
    shown = 0;
    grid.innerHTML = '';
    grid.removeAttribute('aria-busy');
    $('#result-count').textContent = `${filtered.length.toLocaleString()} product${filtered.length === 1 ? '' : 's'} found`;
    if (!filtered.length) {
      grid.innerHTML = '<div class="panel empty-state"><h2>No products found</h2><p>Try a different keyword or reset your filters.</p></div>';
      $('#more').hidden = true;
    } else appendPage();
    renderTags(); syncUrl();
  }

  // Load the next batch automatically as the visitor nears the bottom; the button remains as a fallback.
  const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting) && shown < filtered.length) appendPage(); }, {rootMargin:'500px 0px'});

  let timer;
  $('#search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 160); });
  $('#category').addEventListener('change', () => {
    selTags.clear(); tagsExpanded = false;
    $('.intro h1').textContent = $('#category').value || 'Our products';
    render();
  });
  $('#size').addEventListener('change', render);
  $('#clear').onclick = () => { $('#search').value = ''; $('#category').value = ''; $('#size').value = ''; selTags.clear(); $('.intro h1').textContent = 'Our products'; render(); };
  $('#clear-tags').onclick = () => { selTags.clear(); render(); };
  $('#more-tags').onclick = () => { tagsExpanded = !tagsExpanded; renderTags(); };
  $('#more').onclick = appendPage;

  const toggleTag = tag => {
    selTags.has(tag) ? selTags.delete(tag) : selTags.add(tag);
    render();
  };
  $('#tag-chips').onclick = e => { const b = e.target.closest('[data-tag]'); if (b) toggleTag(b.dataset.tag); };

  grid.onclick = e => {
    const chip = e.target.closest('.card-tags [data-tag]');
    if (chip) { toggleTag(chip.dataset.tag); $('#tag-filter').scrollIntoView({behavior: RC.reduceMotion() ? 'auto' : 'smooth', block:'center'}); return; }
    const button = e.target.closest('[data-add]'); if (!button) return;
    try {
      const id = Number(button.dataset.add), items = cart(), item = items.find(x => x.id === id);
      if (item) item.quantity = Math.min(10000, item.quantity + 1); else items.push({id, quantity:1});
      saveCart(items);
      const card = button.closest('.card'), product = products.find(p => p.id === id), qty = items.find(x => x.id === id).quantity;
      const img = card.querySelector('.product-media img.loaded');
      RC.flyToQuote(img || card.querySelector('.product-media'), img ? img.currentSrc || img.src : null);
      card.classList.add('in-quote');
      card.querySelector('.in-quote-flag').innerHTML = `&#10003; In quote &times; ${qty}`;
      button.classList.add('added'); button.querySelector('.lbl').textContent = 'Added'; button.querySelector('.plus').innerHTML = '&#10003;';
      clearTimeout(button._t);
      button._t = setTimeout(() => { button.classList.remove('added'); button.querySelector('.lbl').textContent = 'Add to quote'; button.querySelector('.plus').textContent = '+'; }, 1400);
      notify(`${product ? product.name : 'Product'} added — ${items.reduce((n, x) => n + x.quantity, 0)} in your quote`);
    } catch (error) { notify(error.message, 'error'); }
  };

  render();
}

/* ------------------------------------------------------------------ quote page */
function quotePage(products) {
  const byId = new Map(products.map(p => [p.id, p]));
  const wrap = $('.quote-layout');
  wrap.innerHTML = `<section class="panel"><p class="eyebrow">YOUR SELECTION</p><h2>Quote items</h2><p id="cart-summary" class="cart-summary"></p><div id="cart"></div><a class="text-link" href="categories.html">&larr; Continue browsing</a></section><form id="quote-form" class="panel"><p class="eyebrow">GET IN TOUCH</p><h2>Your details</h2><div class="form-grid"><label>Name *<input name="name" autocomplete="name" maxlength="200" required></label><label>Email *<input name="email" autocomplete="email" type="email" maxlength="254" required></label><label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="80"></label><label>Company<input name="company" autocomplete="organization" maxlength="200"></label><label class="wide">How can we help?<textarea name="message" maxlength="4000" placeholder="Delivery area, quantities or any special requirements"></textarea></label></div><p class="muted privacy-note">We use these details to respond to your quote request.</p><p id="status" class="status" role="status"></p><button id="submit-quote">Submit quote request &rarr;</button></form>`;
  let firstRender = true;

  function summary() {
    const items = cart(), n = items.reduce((t, x) => t + x.quantity, 0);
    $('#cart-summary').textContent = items.length ? `${items.length} product${items.length === 1 ? '' : 's'} · ${n.toLocaleString()} item${n === 1 ? '' : 's'}` : '';
    $('#submit-quote').disabled = !items.length || items.some(x => !byId.has(x.id));
  }
  function render() {
    const items = cart();
    $('#cart').innerHTML = items.length ? items.map((x, i) => {
      const p = byId.get(x.id), name = p?.name || 'Product no longer available';
      return `<div class="cart-row${firstRender ? ' reveal' : ''}" ${stagger(i)} data-row="${x.id}"><div class="cart-thumb">${p?.display_image ? `<img src="${esc(p.display_image)}" alt="" width="56" height="56" loading="lazy">` : '<span aria-hidden="true">&#9783;</span>'}</div><strong>${esc(name)}<small class="muted">${esc([p?.size, p?.stock_code].filter(Boolean).join(' / '))}</small></strong><div class="qty" role="group" aria-label="Quantity for ${esc(name)}"><button type="button" class="qty-btn" data-step="-1" data-id="${x.id}" aria-label="Decrease quantity">&minus;</button><input aria-label="Quantity for ${esc(name)}" data-qty="${x.id}" type="number" inputmode="numeric" min="1" max="10000" step="1" value="${x.quantity}"><button type="button" class="qty-btn" data-step="1" data-id="${x.id}" aria-label="Increase quantity">+</button></div><button class="icon-btn danger" data-remove="${x.id}" aria-label="Remove ${esc(name)}" title="Remove"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button></div>`;
    }).join('') : '<div class="empty-state"><div class="empty-icon" aria-hidden="true">&#128221;</div><h3>Your quote starts here</h3><p>Add products from our range to request pricing.</p><a class="button" href="categories.html">Browse the range</a></div>';
    firstRender = false;
    summary();
  }
  function setQty(id, value, input) {
    try {
      const items = cart(), item = items.find(x => x.id === id); if (!item) return;
      item.quantity = Math.max(1, Math.min(10000, parseInt(value) || 1));
      saveCart(items);
      if (input) input.value = item.quantity;
      summary();
    } catch (error) { $('#status').textContent = error.message; }
  }
  $('#cart').onchange = e => { if (e.target.dataset.qty) setQty(Number(e.target.dataset.qty), e.target.value, e.target); };
  $('#cart').onclick = e => {
    const step = e.target.closest('[data-step]');
    if (step) { const input = $(`[data-qty="${step.dataset.id}"]`); setQty(Number(step.dataset.id), Number(input.value) + Number(step.dataset.step), input); return; }
    const remove = e.target.closest('[data-remove]'); if (!remove) return;
    const row = remove.closest('.cart-row'), id = remove.dataset.remove;
    const commit = () => { try { saveCart(cart().filter(x => x.id != id)); render(); } catch (error) { $('#status').textContent = error.message; } };
    if (RC.reduceMotion()) return commit();
    row.classList.add('removing'); setTimeout(commit, 260);
  };
  $('#quote-form').onsubmit = async e => {
    e.preventDefault(); const button = $('#submit-quote'); if (button.disabled) return;
    button.disabled = true; button.textContent = 'Sending request...';
    try {
      await api('/api/quote', {customer:Object.fromEntries(new FormData(e.target)), items:cart()});
      saveCart([]); render(); e.target.reset();
      e.target.innerHTML = '<div class="success-card"><svg class="check" width="72" height="72" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="none" stroke="#1f7a4d" stroke-width="3"/><path d="M15 27l7 7 15-16" fill="none" stroke="#1f7a4d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg><h2>Request received</h2><p>Thank you. Our team will be in touch shortly with your quote.</p><a class="button" href="categories.html">Continue browsing</a></div>';
      notify('Quote request sent');
      window.scrollTo({top: 0, behavior: RC.reduceMotion() ? 'auto' : 'smooth'});
    } catch (error) { $('#status').textContent = error.message; button.textContent = 'Submit quote request →'; summary(); }
  };
  window.addEventListener('storage', render);
  render();
}

// Wait for the shared navigation script to establish the catalogue request.
window.addEventListener('DOMContentLoaded', () => start().catch(error => {
  main.innerHTML = intro('We could not load the range', 'Please try again in a moment, or contact our team for assistance.') + `<div class="wrap"><div class="panel"><p role="alert">${esc(error.message)}</p><button onclick="location.reload()">Try again</button> <a href="tel:0219813320">Call 021 981 3320</a></div></div>`;
}));
