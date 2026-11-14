// Quote counter helper
(function() {
    function updateQuoteCount() {
        try {
            const saved = JSON.parse(localStorage.getItem('rangechem_quote') || '[]');
            const countEl = document.getElementById('nav-quote-count');
            if (countEl) {
                countEl.textContent = (Array.isArray(saved) ? saved : []).reduce((n, item) => n + (Number(item.quantity) || 0), 0);
            }
        } catch (e) {
            // Ignore parse errors
        }
    }
    document.addEventListener('DOMContentLoaded', updateQuoteCount);
    window.addEventListener('storage', updateQuoteCount);
    fetch('/api/settings').then(r => r.ok ? r.json() : {}).then(settings => {
        const hero = document.querySelector('.hero-bg');
        if (hero && settings.hero_image) hero.style.backgroundImage = `url(${JSON.stringify(settings.hero_image)})`;
        if (settings.hero_title && document.querySelector('.hero-title')) document.querySelector('.hero-title').textContent = settings.hero_title;
        if (settings.hero_text && document.querySelector('.hero-subtitle')) document.querySelector('.hero-subtitle').textContent = settings.hero_text;
    }).catch(() => {});
})();
