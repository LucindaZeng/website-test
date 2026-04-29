/**
 * WFX CMS Sync Layer
 * ==================
 * Intercepts localStorage writes to wfx_* keys and mirrors them to the server.
 * On admin pages, this means: every "Save" button click in the admin UI now
 * also pushes data to MySQL — no admin-side code changes needed.
 *
 * On page load, optionally pulls fresh data from server back into localStorage,
 * so admin sees what's actually live for users.
 *
 * Required: window.WFX_ADMIN_TOKEN must be set (loaded from localStorage on
 * admin login). Without it, write requests are skipped.
 */
(function() {
    'use strict';

    // Map localStorage keys → server resource (path + method)
    const SYNC_MAP = {
        'wfx_homepage_media':    { type: 'content', key: 'homepage_media' },
        'wfx_page_content':      { type: 'content', key: 'page_content' },
        'wfx_site_settings':     { type: 'content', key: 'site_settings' },
        'wfx_categories':        { type: 'content', key: 'categories' },
        'wfx_industry_products': { type: 'products' },
        'wfx_news':              { type: 'news', subtype: 'news' },
        'wfx_news_articles':     { type: 'news', subtype: 'news' },
        'wfx_blog_posts':        { type: 'news', subtype: 'blog' },
    };

    // Auth/transient keys that should NEVER sync to server
    const SKIP_KEYS = new Set([
        'wfx_admin_logged_in', 'wfx_admin_user',
        'wfx_activity_log', 'wfx_migration_v3_applied',
        'wfx_users',  // user accounts stay client-side; server has its own auth
    ]);

    // ─── Push to server ──────────────────────────────────────────────────
    function pushToServer(key, value) {
        const cfg = SYNC_MAP[key];
        if (!cfg) return;

        const token = window.WFX_ADMIN_TOKEN || localStorage.getItem('wfx_api_token') || '';
        if (!token) {
            // Admin not logged in or token missing — silently skip
            return;
        }

        let parsed;
        try {
            parsed = typeof value === 'string' ? JSON.parse(value) : value;
        } catch (e) {
            parsed = value;
        }

        let url, body;
        if (cfg.type === 'content') {
            url = '/api/cms/content/' + encodeURIComponent(cfg.key);
            body = JSON.stringify({ value: parsed });
        } else if (cfg.type === 'products') {
            // Products may be an array or an object grouped by industry
            if (Array.isArray(parsed)) {
                // Group by industry
                const byIndustry = {};
                parsed.forEach(p => {
                    const ind = p.industry || 'general';
                    if (!byIndustry[ind]) byIndustry[ind] = [];
                    byIndustry[ind].push(p);
                });
                Object.keys(byIndustry).forEach(industry => {
                    fetch('/api/cms/products/' + encodeURIComponent(industry), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
                        body: JSON.stringify({ products: byIndustry[industry] })
                    }).catch(e => console.warn('CMS sync (products):', e.message));
                });
                return;
            } else {
                // Already grouped as { industry: [...] }
                Object.keys(parsed || {}).forEach(industry => {
                    fetch('/api/cms/products/' + encodeURIComponent(industry), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
                        body: JSON.stringify({ products: parsed[industry] })
                    }).catch(e => console.warn('CMS sync (products):', e.message));
                });
                return;
            }
        } else if (cfg.type === 'news') {
            url = '/api/cms/news/' + cfg.subtype;
            body = JSON.stringify({ posts: Array.isArray(parsed) ? parsed : [] });
        } else {
            return;
        }

        // Fire-and-forget POST (server handles deduplication)
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
            body: body
        })
        .then(r => r.ok ? null : console.warn('CMS sync failed:', r.status, key))
        .catch(e => console.warn('CMS sync error:', key, e.message));
    }

    // ─── Hook localStorage.setItem ───────────────────────────────────────
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
        const result = origSetItem.apply(this, arguments);
        // Only intercept on the localStorage instance (not sessionStorage)
        // and only for wfx_ keys we care about
        if (this === localStorage && key.startsWith('wfx_') && !SKIP_KEYS.has(key)) {
            // Debounce rapid sequential writes (admin Save All triggers many)
            clearTimeout(window.__wfxSyncTimers__ = window.__wfxSyncTimers__ || {});
            window.__wfxSyncTimers__[key] = setTimeout(() => pushToServer(key, value), 300);
        }
        return result;
    };

    // ─── Optional: pull latest from server on admin page load ────────────
    // This helps admins see what other admins have published
    window.WFX_CMS_SYNC = {
        pushNow: pushToServer,

        pullAll: async function() {
            try {
                const r = await fetch('/api/cms/all');
                if (!r.ok) return false;
                const j = await r.json();
                if (!j.ok || !j.data) return false;

                // Restore to localStorage WITHOUT triggering re-sync
                const writeRaw = (k, v) => origSetItem.call(localStorage, k, JSON.stringify(v));

                if (j.data.page_content)   writeRaw('wfx_page_content',   j.data.page_content);
                if (j.data.homepage_media) writeRaw('wfx_homepage_media', j.data.homepage_media);
                if (j.data.site_settings)  writeRaw('wfx_site_settings',  j.data.site_settings);
                if (j.data.categories)     writeRaw('wfx_categories',     j.data.categories);
                if (j.data.industry_products) writeRaw('wfx_industry_products', j.data.industry_products);
                if (j.data.news)           writeRaw('wfx_news',           j.data.news);
                if (j.data.blog)           writeRaw('wfx_blog_posts',     j.data.blog);

                console.log('CMS data pulled from server');
                return true;
            } catch (e) {
                console.warn('CMS pull failed:', e.message);
                return false;
            }
        }
    };
})();
