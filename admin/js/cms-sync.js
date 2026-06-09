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
    async function pushToServer(key, value) {
        const cfg = SYNC_MAP[key];
        if (!cfg) return true;

        // Build authentication headers:
        // - Modern: rely on session cookie (sent automatically) + CSRF token
        // - Legacy: X-Admin-Token header for backwards compat / CI scripts
        const csrf = window.WFX_CSRF_TOKEN || localStorage.getItem('wfx_csrf_token') || '';
        const legacyToken = window.WFX_ADMIN_TOKEN || localStorage.getItem('wfx_api_token') || '';

        // If neither auth method is available, skip
        if (!csrf && !legacyToken) {
            if (localStorage.getItem('wfx_admin_logged_in') === 'true') {
                showSyncFailure(key, 'Your login session is not ready. This change is saved only in this browser.');
            }
            return false;
        }

        function authHeaders() {
            const h = { 'Content-Type': 'application/json' };
            if (csrf) h['X-CSRF-Token'] = csrf;
            if (legacyToken) h['X-Admin-Token'] = legacyToken;
            return h;
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
            const products = Array.isArray(parsed)
                ? parsed
                : Object.keys(parsed || {}).flatMap(industry =>
                    (parsed[industry] || []).map(product => ({ ...product, industry }))
                );
            url = '/api/cms/products';
            body = JSON.stringify({ products });
        } else if (cfg.type === 'news') {
            url = '/api/cms/news/' + cfg.subtype;
            body = JSON.stringify({ posts: Array.isArray(parsed) ? parsed : [] });
        } else {
            return true;
        }

        try {
            const r = await fetch(url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: authHeaders(),
                body: body
            });
            if (r.ok) return true;
            const result = await r.json().catch(() => ({}));
            // 409 Conflict: another user edited the same content
            if (r.status === 409) {
                showConflictDialog(key, result.message || 'Another user has modified this content.', result.current_version);
                return false;
            }
            // 403 Permission denied — surface to user (not silent)
            if (r.status === 403) {
                showPermissionDenied(result.error || 'You do not have permission to perform this action.');
                return false;
            }
            showSyncFailure(key, result.error || `Server returned ${r.status}.`);
            console.warn('CMS sync failed:', r.status, key);
            return false;
        } catch (error) {
            showSyncFailure(key, error.message || 'Server unreachable.');
            console.warn('CMS sync error:', key, error.message);
            return false;
        }
    }

    // ─── Conflict / permission UI ─────────────────────────────────────────
    function showSyncFailure(key, message) {
        let div = document.getElementById('wfx-sync-failure-toast');
        if (!div) {
            div = document.createElement('div');
            div.id = 'wfx-sync-failure-toast';
            div.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; ' +
                'background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; ' +
                'border-radius:8px; padding:14px 18px; box-shadow:0 8px 25px rgba(0,0,0,0.15); ' +
                'max-width:420px; font-family:Inter,sans-serif; font-size:0.9rem;';
            document.body.appendChild(div);
        }
        div.textContent = '';
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700; margin-bottom:5px;';
        title.textContent = 'Change not published';
        const detail = document.createElement('div');
        detail.style.cssText = 'line-height:1.5;';
        detail.textContent = `${key}: ${message}`;
        div.append(title, detail);
        setTimeout(() => {
            const current = document.getElementById('wfx-sync-failure-toast');
            if (current) current.remove();
        }, 10000);
    }

    function showConflictDialog(key, message, currentVersion) {
        // Avoid stacking multiple toasts for the same conflict
        if (document.getElementById('wfx-conflict-toast')) return;
        const div = document.createElement('div');
        div.id = 'wfx-conflict-toast';
        div.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; ' +
            'background:#fef3c7; color:#92400e; border:1px solid #fcd34d; ' +
            'border-radius:8px; padding:16px 20px; box-shadow:0 8px 25px rgba(0,0,0,0.15); ' +
            'max-width:420px; font-family:Inter,sans-serif; font-size:0.9rem;';
        div.innerHTML =
            '<div style="display:flex; gap:12px; align-items:flex-start;">' +
                '<i class="fas fa-exclamation-triangle" style="color:#d97706; font-size:1.2rem; margin-top:2px;" aria-hidden="true"></i>' +
                '<div style="flex:1;">' +
                    '<div style="font-weight:600; margin-bottom:6px;">Edit Conflict</div>' +
                    '<div style="margin-bottom:10px; line-height:1.5;">' +
                        (message || 'Someone else updated this content while you were editing.') +
                        '<br><span style="opacity:0.8;">Reload to see the latest version. Your unsaved changes will be lost — copy them somewhere safe first.</span>' +
                    '</div>' +
                    '<div style="display:flex; gap:8px;">' +
                        '<button onclick="window.location.reload()" style="background:#d97706; color:white; border:none; padding:6px 14px; border-radius:6px; font-weight:500; cursor:pointer;">Reload Page</button>' +
                        '<button onclick="document.getElementById(\'wfx-conflict-toast\').remove()" style="background:transparent; color:#92400e; border:1px solid #92400e; padding:6px 14px; border-radius:6px; font-weight:500; cursor:pointer;">Dismiss</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(div);
    }

    function showPermissionDenied(message) {
        if (document.getElementById('wfx-permission-toast')) return;
        const div = document.createElement('div');
        div.id = 'wfx-permission-toast';
        div.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; ' +
            'background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; ' +
            'border-radius:8px; padding:14px 18px; box-shadow:0 8px 25px rgba(0,0,0,0.15); ' +
            'max-width:380px; font-family:Inter,sans-serif; font-size:0.9rem;';
        div.innerHTML =
            '<div style="display:flex; gap:10px; align-items:flex-start;">' +
                '<i class="fas fa-lock" style="color:#dc2626; margin-top:2px;" aria-hidden="true"></i>' +
                '<div style="flex:1;">' +
                    '<div style="font-weight:600; margin-bottom:4px;">Permission Denied</div>' +
                    '<div style="margin-bottom:8px;">' + (message || '') + '</div>' +
                    '<button onclick="document.getElementById(\'wfx-permission-toast\').remove()" style="background:transparent; color:#991b1b; border:1px solid #991b1b; padding:4px 10px; border-radius:4px; font-size:0.85rem; cursor:pointer;">Dismiss</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(div);
        setTimeout(() => { const el = document.getElementById('wfx-permission-toast'); if (el) el.remove(); }, 8000);
    }

    // ─── Hook localStorage.setItem ───────────────────────────────────────
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
        const result = origSetItem.apply(this, arguments);
        // Only intercept on the localStorage instance (not sessionStorage)
        // and only for wfx_ keys we care about
        if (this === localStorage && key.startsWith('wfx_') && !SKIP_KEYS.has(key)) {
            // Debounce rapid sequential writes (admin Save All triggers many)
            window.__wfxSyncTimers__ = window.__wfxSyncTimers__ || {};
            clearTimeout(window.__wfxSyncTimers__[key]);
            window.__wfxSyncTimers__[key] = setTimeout(() => { pushToServer(key, value); }, 300);
        }
        return result;
    };

    // ─── Optional: pull latest from server on admin page load ────────────
    // This helps admins see what other admins have published
    window.WFX_CMS_SYNC = {
        pushNow: pushToServer,
        cacheRaw: function(key, value) {
            origSetItem.call(localStorage, key, JSON.stringify(value));
        },

        pullAll: async function() {
            try {
                const r = await fetch('/api/cms/all', { credentials: 'same-origin' });
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
