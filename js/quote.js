// Quote counter helper
(function() {
    function updateQuoteCount() {
        try {
            const saved = JSON.parse(localStorage.getItem('rangechem_quote') || '[]');
            const countEl = document.getElementById('nav-quote-count');
            if (countEl) {
                countEl.textContent = saved.length || 0;
            }
        } catch (e) {
            // Ignore parse errors
        }
    }
    document.addEventListener('DOMContentLoaded', updateQuoteCount);
    window.addEventListener('storage', updateQuoteCount);
})();
