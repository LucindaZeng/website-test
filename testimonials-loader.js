/* ─── Testimonials loader ────────────────────────────────────────────────────
 * Fetches editable testimonials from /api/cms/content/testimonials and rebuilds
 * the homepage "What Our Customers Say" slider. If the API is unavailable or
 * returns nothing (e.g. local dev with no database), the hardcoded testimonials
 * already in the HTML are left untouched — so the section never breaks.
 * Managed in the admin at /admin/testimonials.html.
 * ────────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    // Rotating icons so each card keeps the visual variety of the original design
    var ICONS = ['fa-industry', 'fa-microchip', 'fa-cogs', 'fa-rocket', 'fa-cog', 'fa-wrench'];

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function buildCard(t, i) {
        var stars = Math.max(1, Math.min(5, parseInt(t.stars, 10) || 5));
        var starHtml = '';
        for (var s = 0; s < stars; s++) {
            starHtml += '<i class="fas fa-star" aria-hidden="true"></i>';
        }
        var icon = ICONS[i % ICONS.length];
        return ''
            + '<div class="testimonial-card">'
            +   '<div class="testimonial-content">'
            +     '<div class="stars">' + starHtml + '</div>'
            +     '<p>"' + esc(t.quote) + '"</p>'
            +     '<div class="testimonial-author">'
            +       '<div style="width:50px;height:50px;border-radius:50%;background:var(--gradient-primary);display:flex;align-items:center;justify-content:center;">'
            +         '<i class="fas ' + icon + '" aria-hidden="true" style="color:white;font-size:1.2rem;"></i>'
            +       '</div>'
            +       '<div>'
            +         '<h4>' + esc(t.author) + '</h4>'
            +         (t.subtitle ? '<span>' + esc(t.subtitle) + '</span>' : '')
            +       '</div>'
            +     '</div>'
            +   '</div>'
            + '</div>';
    }

    function apply(items) {
        var slider = document.getElementById('testimonials-slider');
        if (!slider || !Array.isArray(items) || !items.length) return;
        // Only valid entries
        var valid = items.filter(function (t) { return t && t.quote && t.author; });
        if (!valid.length) return;
        slider.innerHTML = valid.map(buildCard).join('\n');

        // Re-init the slider behavior now that cards were rebuilt.
        if (typeof window.initTestimonialSlider === 'function') {
            try { window.initTestimonialSlider(); } catch (e) {}
        }
    }

    function load() {
        if (!document.getElementById('testimonials-slider')) return;
        fetch('/api/cms/content/testimonials')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) {
                if (!j || !j.ok || !j.value) return;   // keep hardcoded fallback
                var data = typeof j.value === 'string' ? JSON.parse(j.value) : j.value;
                apply(data);
            })
            .catch(function () { /* keep hardcoded fallback */ });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }
})();
