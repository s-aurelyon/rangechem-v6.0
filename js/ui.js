/* Shared polish for catalogue, quote and management pages (not loaded on the homepage).
   Exposes window.RC: toast(), flyToQuote(), bumpQuote(), categoryImage(). */
(() => {
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Toast ---------- */
  let toastEl, toastTimer, toastHide;
  function ensureToast() {
    toastEl = document.getElementById('notification');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'notification';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
  }
  function toast(message, type) {
    if (!toastEl) ensureToast();
    clearTimeout(toastTimer); clearTimeout(toastHide);
    toastEl.classList.remove('show');
    toastEl.dataset.type = type || 'info';
    toastEl.textContent = message;
    void toastEl.offsetWidth; // restart the transition after display:none -> block
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      toastHide = setTimeout(() => { toastEl.textContent = ''; }, 350);
    }, type === 'error' ? 5000 : 2800);
  }

  /* ---------- Quote badge bump + fly-to-quote ---------- */
  function bumpQuote() {
    const badge = document.getElementById('quote-badge');
    if (!badge) return;
    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
    setTimeout(() => badge.classList.remove('bump'), 700);
  }
  function flyToQuote(source, imgSrc) {
    const target = document.getElementById('quote-badge');
    if (!target || !source || reduceMotion()) { bumpQuote(); return; }
    const s = source.getBoundingClientRect(), t = target.getBoundingClientRect();
    if (!s.width || !t.width || t.bottom < 0) { bumpQuote(); return; }
    const size = 72, el = document.createElement('div');
    el.className = 'fly-item';
    el.style.width = el.style.height = size + 'px';
    if (imgSrc) { const img = new Image(); img.alt = ''; img.src = imgSrc; el.appendChild(img); }
    else el.innerHTML = '<span aria-hidden="true">+</span>';
    document.body.appendChild(el);
    const sx = s.left + s.width / 2 - size / 2, sy = s.top + s.height / 2 - size / 2;
    const ex = t.left + t.width / 2 - size / 2, ey = t.top + t.height / 2 - size / 2;
    // Bow the path upwards, but keep the mid-point on screen (the quote link sits at the top of the page).
    const mx = sx + (ex - sx) * .5, my = Math.max(10, (sy + ey) / 2 - Math.min(110, Math.abs(ex - sx) * .3));
    const anim = el.animate([
      { transform: `translate(${sx}px,${sy}px) scale(1) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${mx}px,${my}px) scale(.85) rotate(-10deg)`, opacity: 1, offset: .45 },
      { transform: `translate(${ex}px,${ey}px) scale(.18) rotate(8deg)`, opacity: .35 }
    ], { duration: 780, easing: 'cubic-bezier(.45,.05,.55,.95)' });
    const done = () => { el.remove(); bumpQuote(); };
    anim.onfinish = done; anim.oncancel = done;
  }

  /* ---------- Back to top (with scroll progress ring) ---------- */
  function backToTop() {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    const C = 2 * Math.PI * 23;
    btn.innerHTML = `<svg class="btt-ring" viewBox="0 0 52 52" aria-hidden="true"><circle class="btt-track" cx="26" cy="26" r="23"/><circle class="btt-bar" cx="26" cy="26" r="23" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><svg class="btt-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
    document.body.appendChild(btn);
    const bar = btn.querySelector('.btt-bar');
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      btn.classList.toggle('show', y > 480);
      bar.style.strokeDashoffset = C * (1 - (max > 0 ? Math.min(1, y / max) : 0));
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
      btn.blur();
    });
    update();
  }

  const categoryImages = {'Auto':'auto','Bathroom':'bathroom','Consumables':'consumables','Fabric Care':'fabric-care','Floorcare':'floorcare','General Cleaning':'general-cleaning','Industrial Cleaning':'industrial-cleaning','Janitorial':'janitorial','Kitchen':'kitchen','Laundry':'laundry','PPE & Safety':'ppe-safety'};
  const categoryImage = name => `assets/categories/${categoryImages[name] || 'category'}.svg`;

  /* Fade product images in once loaded; swap to a placeholder if one fails. */
  const noImage = '<span class="image-placeholder">Image coming soon</span>';
  function watchImages(root) {
    root.querySelectorAll('img.fade:not(.loaded)').forEach(img => {
      const box = img.parentElement;
      const done = () => { img.classList.add('loaded'); box.classList.remove('is-loading'); };
      if (img.complete && img.naturalWidth) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', () => { box.classList.remove('is-loading'); img.replaceWith(Object.assign(document.createElement('span'), { className: 'image-placeholder', textContent: 'Image coming soon' })); }, { once: true });
      }
    });
  }

  ensureToast();
  backToTop();
  window.RC = { toast, flyToQuote, bumpQuote, categoryImage, reduceMotion, watchImages, noImage };
})();
