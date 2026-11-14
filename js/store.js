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
const categoryImages = {'Auto':'auto','Bathroom':'bathroom','Consumables':'consumables','Fabric Care':'fabric-care','Floorcare':'floorcare','General Cleaning':'general-cleaning','Industrial Cleaning':'industrial-cleaning','Janitorial':'janitorial','Kitchen':'kitchen','Laundry':'laundry','PPE & Safety':'ppe-safety'};
const categoryCopy = {'Auto':'Care for vehicles, from the workshop to the finishing touch.','Bathroom':'Keep washrooms fresh, clean and ready for use.','Consumables':'Everyday essentials to keep your operation stocked.','Fabric Care':'Specialist care for textiles and upholstery.','Floorcare':'Cleaning and maintenance for hardworking floors.','General Cleaning':'Versatile solutions for everyday cleaning tasks.','Industrial Cleaning':'Cleaning solutions for demanding working environments.','Janitorial':'Tools and equipment for a thorough clean.','Kitchen':'Cleaning essentials for kitchens and food preparation areas.','Laundry':'Solutions for fresh, clean laundry.','PPE & Safety':'Protective equipment for the task at hand.'};
const categoryImage = name => `assets/categories/${categoryImages[name] || 'category'}.svg`;
const intro = (title, text) => `<section class="intro"><div class="intro-inner"><p class="eyebrow">RANGECHEM / CLEANING &amp; HYGIENE</p><h1>${esc(title)}</h1><p>${esc(text)}</p><div class="intro-rule"></div></div></section>`;
document.body.insertAdjacentHTML('beforeend', `<footer class="store-footer"><div><strong class="store-footer-brand"><img src="assets/RC_Logo.png" alt="" width="36" height="36">RANGE <span>CHEM</span></strong><p>Industrial cleaning solutions. Personal service.</p></div><div><a href="categories.html">Explore the range</a><a href="mailto:info@rangechem.co.za">info@rangechem.co.za</a><a href="tel:0219813320">021 981 3320</a></div></footer><div id="notification" role="status" aria-live="polite"></div>`);
count();
function notify(message) { $('#notification').textContent = message; }
const main = $('main');
const page = main.dataset.page;
async function start() {
  // navigation.js shares this request with the dropdown.
  const products = await (window.rangechemProducts || api('/api/products'));
  const cats = [...new Set(products.map(p => p.category))].sort();
  if (page === 'categories') {
    main.innerHTML = intro('Find your cleaning solution', 'Explore our cleaning and hygiene range, organised around the work you do.') + `<div class="wrap"><div class="section-heading"><div><p class="eyebrow">OUR RANGE</p><h2>All categories</h2></div><a class="text-link" href="products.html">View all products &rarr;</a></div><div class="grid category-grid">${cats.map(c => `<a class="card category-card" href="products.html?category=${encodeURIComponent(c)}"><div class="category-media"><img src="${categoryImage(c)}" alt="" width="256" height="240" loading="lazy"></div><div class="card-body"><small>${products.filter(p => p.category === c).length} PRODUCTS</small><h3>${esc(c)}</h3><p>${esc(categoryCopy[c] || 'Explore products in this category.')}</p><span class="accent">Explore category &rarr;</span></div></a>`).join('')}</div></div>`;
    return;
  }
  if (page === 'catalogue') {
    const initial = new URLSearchParams(location.search).get('category') || '';
    main.innerHTML = intro(cats.includes(initial) ? initial : 'Our products', 'Find the right product and add it to your quote. Our team will help with the rest.') + `<div class="wrap"><a class="text-link" href="categories.html">&larr; All categories</a><div class="controls filter-panel"><label class="search-field">Search the range<input id="search" type="search" placeholder="Product, stock code or keyword"></label><label>Category<select id="category"><option value="">All categories</option>${cats.map(c => `<option ${c === initial ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label><label>Pack size<select id="size"><option value="">All sizes</option>${[...new Set(products.map(p => p.size).filter(Boolean))].sort().map(s => `<option>${esc(s)}</option>`).join('')}</select></label><button id="clear" class="secondary">Reset filters</button></div><p id="result-count" class="muted" role="status"></p><div id="products" class="grid"></div><div class="load-more"><button id="more" class="secondary">Show more products</button></div></div>`;
    let limit = 48;
    function render() {
      const q = $('#search').value.trim().toLowerCase(), c = $('#category').value, s = $('#size').value;
      const filtered = products.filter(p => (!c || p.category === c) && (!s || p.size === s) && [p.name,p.description,p.stock_code,p.tags,p.category,p.size].some(v => String(v || '').toLowerCase().includes(q)));
      $('#result-count').textContent = `${filtered.length} products found`;
      $('#products').innerHTML = filtered.slice(0, limit).map(p => `<article class="card product-card"><div class="product-media">${p.display_image ? `<img src="${esc(p.display_image)}" alt="${esc(p.name)}" loading="lazy" width="240" height="200">` : '<span class="image-placeholder">Image coming soon</span>'}</div><div class="card-body"><small class="product-category">${esc(p.category)}</small><h3>${esc(p.name)}</h3><small class="product-meta">${esc([p.size,p.stock_code].filter(Boolean).join(' / ')) || '&nbsp;'}</small><p>${esc(p.description)}</p><button data-add="${p.id}" aria-label="Add ${esc(p.name)} to quote">Add to quote <span aria-hidden="true">+</span></button></div></article>`).join('') || '<div class="panel empty-state"><h2>No products found</h2><p>Try a different keyword or reset your filters.</p></div>';
      $('#products').querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.parentElement.innerHTML = '<span class="image-placeholder">Image coming soon</span>'; }, {once:true}));
      $('#more').hidden = limit >= filtered.length;
    }
    for (const el of [$('#search'),$('#category'),$('#size')]) el.addEventListener('input', () => { limit = 48; render(); });
    $('#clear').onclick = () => { $('#search').value = ''; $('#category').value = ''; $('#size').value = ''; limit = 48; render(); };
    $('#more').onclick = () => { limit += 48; render(); };
    $('#products').onclick = e => {
      const button = e.target.closest('[data-add]'); if (!button) return;
      try {
        const id = Number(button.dataset.add), items = cart(), item = items.find(x => x.id === id);
        if (item) item.quantity = Math.min(10000,item.quantity + 1); else items.push({id,quantity:1});
        saveCart(items); notify('Product added to your quote.');
        button.textContent = 'Added to quote'; setTimeout(() => { button.innerHTML = 'Add to quote <span aria-hidden="true">+</span>'; }, 1200);
      } catch (error) { notify(error.message); }
    };
    render(); return;
  }
  if (page === 'quote') {
    main.innerHTML = intro('Let\'s build your quote', 'Review your selection and send us your details. Our team will prepare your quote.') + `<div class="wrap quote-layout"><section class="panel"><p class="eyebrow">YOUR SELECTION</p><h2>Quote items</h2><div id="cart"></div><a class="text-link" href="categories.html">&larr; Continue browsing</a></section><form id="quote-form" class="panel"><p class="eyebrow">GET IN TOUCH</p><h2>Your details</h2><div class="form-grid"><label>Name *<input name="name" autocomplete="name" maxlength="200" required></label><label>Email *<input name="email" autocomplete="email" type="email" maxlength="254" required></label><label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="80"></label><label>Company<input name="company" autocomplete="organization" maxlength="200"></label><label class="wide">How can we help?<textarea name="message" maxlength="4000" placeholder="Delivery area, quantities or any special requirements"></textarea></label></div><p class="muted privacy-note">We use these details to respond to your quote request.</p><p id="status" class="status" role="status"></p><button id="submit-quote">Submit quote request &rarr;</button></form></div>`;
    function render() {
      const items = cart();
      $('#cart').innerHTML = items.length ? items.map(x => {
        const p = products.find(p => p.id === x.id);
        return `<div class="cart-row"><strong>${esc(p?.name || 'Product no longer available')}<small class="muted">${esc(p?.size || '')} ${esc(p?.stock_code || '')}</small></strong><label>Qty<input aria-label="Quantity for ${esc(p?.name || 'unavailable product')}" data-qty="${x.id}" type="number" min="1" max="10000" step="1" value="${x.quantity}"></label><button class="secondary" data-remove="${x.id}" aria-label="Remove ${esc(p?.name || 'unavailable product')}">Remove</button></div>`;
      }).join('') : '<div class="empty-state"><h3>Your quote starts here</h3><p>Add products from our range to request pricing.</p></div>';
      $('#submit-quote').disabled = !items.length || items.some(x => !products.some(p => p.id === x.id));
    }
    $('#cart').onchange = e => {
      if (!e.target.dataset.qty) return;
      try { const items = cart(), item = items.find(x => x.id == e.target.dataset.qty); item.quantity = Math.max(1,Math.min(10000,parseInt(e.target.value) || 1)); saveCart(items); render(); } catch(error) { $('#status').textContent = error.message; }
    };
    $('#cart').onclick = e => {
      if (!e.target.dataset.remove) return;
      try { saveCart(cart().filter(x => x.id != e.target.dataset.remove)); render(); } catch(error) { $('#status').textContent = error.message; }
    };
    $('#quote-form').onsubmit = async e => {
      e.preventDefault(); const button = $('#submit-quote'); if(button.disabled) return;
      button.disabled = true; button.textContent = 'Sending request...';
      try {
        await api('/api/quote', {customer:Object.fromEntries(new FormData(e.target)),items:cart()});
        saveCart([]); render(); e.target.reset(); $('#status').textContent = 'Your request has been received. Thank you. Our team will be in touch.';
      } catch(error) { $('#status').textContent = error.message; }
      finally { button.textContent = 'Submit quote request'; render(); }
    };
    window.addEventListener('storage', render); render();
  }
}
// Wait for the shared navigation script to establish the catalogue request.
window.addEventListener('DOMContentLoaded', () => start().catch(error => {
  main.innerHTML = intro('We could not load the range', 'Please try again in a moment, or contact our team for assistance.') + `<div class="wrap"><div class="panel"><p role="alert">${esc(error.message)}</p><button onclick="location.reload()">Try again</button> <a href="tel:0219813320">Call 021 981 3320</a></div></div>`;
}));
