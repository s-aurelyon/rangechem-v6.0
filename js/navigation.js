/* Shared Products disclosure. The text link always opens All Categories. */
(() => {
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
