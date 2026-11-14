/* Shared Products disclosure. The text link always opens All Categories. */
(() => {
  if (!document.getElementById('main-nav')) {
    document.body.classList.add('has-shared-nav');
    document.body.insertAdjacentHTML('afterbegin', `<nav id="main-nav" class="shared-nav" aria-label="Main navigation"><div class="shared-nav-container"><div class="shared-nav-row"><a href="index.html" class="shared-logo" aria-label="Rangechem home"><img src="assets/RC_Logo.png" alt="Rangechem Logo">RANGE<span>CHEM</span></a><div class="shared-links"><a href="index.html" class="nav-link">Home</a><a href="index.html#contact" class="nav-link">Contact</a><div data-products-nav></div></div><div class="shared-actions"><a href="quote-request.html" id="quote-badge" class="nav-link" aria-label="View quote cart"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg><span class="quote-count" id="nav-quote-count">0</span><span class="shared-quote-label">Quote</span></a><button id="hamburger-btn" type="button" aria-label="Toggle mobile menu" aria-expanded="false" aria-controls="mobile-menu"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div></div><div id="mobile-menu"><a href="index.html" class="nav-link">Home</a><a href="index.html#contact" class="nav-link">Contact</a><div data-products-nav></div></div></div></nav>`);
    const nav = document.getElementById('main-nav'), button = document.getElementById('hamburger-btn'), menu = document.getElementById('mobile-menu');
    const close = () => { menu.classList.remove('open'); nav.classList.remove('menu-open'); button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', () => { const open = menu.classList.toggle('open'); nav.classList.toggle('menu-open', open); button.setAttribute('aria-expanded', String(open)); });
    document.addEventListener('click', e => { if (!nav.contains(e.target)) close(); });
    nav.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('open')) { close(); button.focus(); } });
    window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
    nav.classList.toggle('scrolled', window.scrollY > 40);
    try { const cart = JSON.parse(localStorage.getItem('rangechem_quote') || '[]'); document.getElementById('nav-quote-count').textContent = Array.isArray(cart) ? cart.reduce((n, item) => n + (Number(item.quantity) || 0), 0) : 0; } catch {}
  }
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const groups = document.querySelectorAll('[data-products-nav]');
  groups.forEach((group, index) => {
    group.innerHTML = `<a href="categories.html" class="nav-link">Products</a><button class="products-toggle" aria-label="Show product categories" aria-expanded="false" aria-controls="products-menu-${index}">⌄</button><div class="products-menu" id="products-menu-${index}"><a href="categories.html">All Categories</a><div data-category-links></div><a href="products.html">All Products</a></div>`;
    const button = group.querySelector('button');
    let openedByHover = false;
    const close = () => { openedByHover = false; group.classList.remove('is-open'); button.setAttribute('aria-expanded', 'false'); };
    button.onclick = () => { const open = openedByHover || !group.classList.contains('is-open'); openedByHover = false; group.classList.toggle('is-open', open); button.setAttribute('aria-expanded', String(open)); };
    group.addEventListener('pointerenter', e => { if(e.pointerType === 'mouse' && innerWidth >= 768 && !group.classList.contains('is-open')) { openedByHover = true; group.classList.add('is-open'); button.setAttribute('aria-expanded', 'true'); } });
    group.addEventListener('pointerleave', e => { if(e.pointerType === 'mouse' && !group.contains(document.activeElement)) close(); });
    group.addEventListener('keydown', e => { if(e.key === 'Escape') { close(); button.focus(); } });
    group.addEventListener('focusout', e => { if(!group.contains(e.relatedTarget)) close(); });
    document.addEventListener('click', e => { if(!group.contains(e.target)) close(); });
  });
  window.rangechemProducts = fetch('/api/products').then(r => { if(!r.ok) throw Error('Catalogue unavailable'); return r.json(); });
  window.rangechemProducts.then(products => {
    const categories = [...new Set(products.map(p => p.category))].sort();
    document.querySelectorAll('[data-category-links]').forEach(el => {
      el.innerHTML = categories.map(c => `<a href="products.html?category=${encodeURIComponent(c)}">${escape(c)}</a>`).join('');
    });
  }).catch(() => {});
})();
