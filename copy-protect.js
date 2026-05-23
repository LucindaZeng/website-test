/**
 * WFX Content Protection
 * ========================
 * Casual deterrent against copy-paste of marketing content. Loaded ONLY on
 * public-facing pages (not /admin/). Blocks:
 *   - Right-click context menu (except on form inputs and .copyable elements)
 *   - Ctrl/Cmd+C copy events on body text
 *   - Ctrl/Cmd+A select-all
 *   - Ctrl/Cmd+S save-page
 *   - Ctrl/Cmd+P print
 *   - Drag-and-drop on images
 *   - DevTools shortcut keys (F12, Ctrl+Shift+I/J/C, Ctrl+U)
 *
 * Does NOT block:
 *   - Form inputs and textareas (users must type their quote)
 *   - Elements with .copyable class (e.g. email, phone — meant to be copied)
 *   - Admin pages (this script doesn't load there)
 *
 * Honest about limits: a determined user with DevTools, curl, or a screenshot
 * can defeat this trivially. This is for casual deterrence only.
 */
(function() {
    'use strict';

    // Don't run twice
    if (window.__wfxCopyProtectActive) return;
    window.__wfxCopyProtectActive = true;

    // Mark body so CSS rules activate
    function activate() {
        document.body.classList.add('copy-protected');
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', activate);
    } else {
        activate();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────
    function isInteractiveTarget(el) {
        if (!el || !el.closest) return false;
        // Always allow these (quote form, admin pages, copyable elements)
        return !!el.closest('input, textarea, select, [contenteditable="true"], .copyable, a[href^="mailto:"], a[href^="tel:"]');
    }

    let toastEl = null;
    let toastTimeout = null;
    function showToast(message) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'copy-protect-toast';
            toastEl.setAttribute('role', 'status');
            toastEl.setAttribute('aria-live', 'polite');
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        // Force reflow then add visible class
        toastEl.offsetHeight;
        toastEl.classList.add('visible');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toastEl.classList.remove('visible');
        }, 2400);
    }

    // ─── Right-click context menu ─────────────────────────────────────────
    document.addEventListener('contextmenu', function(e) {
        if (isInteractiveTarget(e.target)) return;  // allow right-click in inputs
        e.preventDefault();
        showToast('© WFX Wanfuxin — content is protected. Email lucindaz@wanfuxin.com for licensing.');
    }, false);

    // ─── Copy / cut / select-all / save / print keyboard shortcuts ───────
    document.addEventListener('keydown', function(e) {
        const k = e.key ? e.key.toLowerCase() : '';
        const mod = e.ctrlKey || e.metaKey;

        // Allow all shortcuts inside inputs (typing, paste, undo, etc.)
        if (isInteractiveTarget(e.target)) return;

        // Ctrl/Cmd + (C, X, A, S, P, U)
        if (mod && ['c', 'x', 'a', 's', 'p', 'u'].includes(k)) {
            e.preventDefault();
            const messages = {
                c: 'Copying disabled. Email us for content licensing.',
                x: 'Cutting disabled.',
                a: 'Select-all disabled.',
                s: 'Saving disabled.',
                p: 'Printing disabled.',
                u: 'View source disabled.',
            };
            showToast(messages[k] || 'Action blocked.');
            return;
        }

        // F12 (DevTools)
        if (e.key === 'F12') {
            e.preventDefault();
            showToast('Developer tools shortcut blocked.');
            return;
        }

        // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C  (DevTools)
        if (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) {
            e.preventDefault();
            showToast('Developer tools shortcut blocked.');
            return;
        }
    }, false);

    // ─── Block native copy event (defense in depth) ──────────────────────
    // When the user (or a low-level scraper) copies text, replace the clipboard
    // content with an attribution notice that includes the SOURCE URL of the
    // page they copied from. This makes any stolen content carry its own
    // provenance — useful for DMCA takedowns when content reappears elsewhere.
    document.addEventListener('copy', function(e) {
        if (isInteractiveTarget(e.target)) return;
        e.preventDefault();
        if (e.clipboardData) {
            const sourceUrl = window.location.href.split('#')[0];  // strip fragment
            e.clipboardData.setData('text/plain',
                '© WFX Wanfuxin — Content protected.\n' +
                'Source: ' + sourceUrl + '\n' +
                'For licensing, contact lucindaz@wanfuxin.com');
        }
        showToast('Content protected. © WFX Wanfuxin');
    }, false);

    document.addEventListener('cut', function(e) {
        if (isInteractiveTarget(e.target)) return;
        e.preventDefault();
    }, false);

    // ─── Block drag-save on images ────────────────────────────────────────
    document.addEventListener('dragstart', function(e) {
        if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO')) {
            e.preventDefault();
        }
    }, false);

    // ─── Selectstart fallback for older browsers (defense in depth) ───────
    document.addEventListener('selectstart', function(e) {
        if (isInteractiveTarget(e.target)) return;
        e.preventDefault();
    }, false);
})();
