/**
 * WFX Markdown Editor — TinyMCE Cloud Integration
 * ================================================
 *
 * Provides a rich-text WYSIWYG editor that stores content as Markdown.
 *
 * Architecture:
 *   - Storage format:  Markdown (clean, portable, version-control friendly)
 *   - Display format:  HTML (rendered via marked.js)
 *   - Editor format:   HTML (rendered by TinyMCE)
 *   - On save:         HTML → Markdown via Turndown.js → store
 *   - On load:         Markdown → HTML via marked.js → editor
 *
 * Why this hybrid? Pure Markdown editors are jarring for non-technical users.
 * Pure HTML editors produce messy markup hard to migrate. This gives marketing
 * staff a Word-like experience while keeping data in a clean, portable format.
 *
 * SETUP:
 *   1. Sign up free at https://tiny.cloud (5,000 editor loads/month free).
 *   2. Get your API key.
 *   3. Set window.TINYMCE_API_KEY = 'your-key' before loading this script,
 *      OR replace 'no-api-key' below with your actual key.
 *
 * Usage:
 *   const editor = await WFXMarkdownEditor.init('#news-content');
 *   editor.setMarkdown('# Hello\n\nWorld');
 *   const md = editor.getMarkdown();
 */

(function() {
    'use strict';

    const TINYMCE_VERSION = '7';
    const MARKED_CDN     = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js';
    const TURNDOWN_CDN   = 'https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.min.js';
    const TINYMCE_API_KEY = window.TINYMCE_API_KEY || '';
    const TINYMCE_CDN = TINYMCE_API_KEY
        ? `https://cdn.tiny.cloud/1/${TINYMCE_API_KEY}/tinymce/${TINYMCE_VERSION}/tinymce.min.js`
        : `https://cdn.jsdelivr.net/npm/tinymce@${TINYMCE_VERSION}/tinymce.min.js`;

    // ─── Loader: fetch a script if not already loaded ───────────────────
    function loadScript(src, globalName) {
        return new Promise((resolve, reject) => {
            if (globalName && window[globalName]) {
                resolve(window[globalName]);
                return;
            }
            // Avoid double-loading
            if (document.querySelector(`script[src="${src}"]`)) {
                const check = setInterval(() => {
                    if (!globalName || window[globalName]) {
                        clearInterval(check);
                        resolve(globalName ? window[globalName] : true);
                    }
                }, 50);
                setTimeout(() => { clearInterval(check); reject(new Error('Script load timeout: ' + src)); }, 15000);
                return;
            }
            const s = document.createElement('script');
            s.src = src;
            s.async = false;       // Preserve order
            s.crossOrigin = 'anonymous';
            s.referrerPolicy = 'origin';
            s.onload = () => resolve(globalName ? window[globalName] : true);
            s.onerror = () => reject(new Error('Failed to load: ' + src));
            document.head.appendChild(s);
        });
    }

    // ─── Configure marked.js for safe Markdown → HTML rendering ─────────
    function configureMarked() {
        if (!window.marked) return;
        // Use GFM (GitHub-flavored Markdown): fenced code, tables, autolinks
        window.marked.setOptions({
            gfm: true,
            breaks: false,           // Single newlines = same paragraph (CommonMark)
            headerIds: true,
            mangle: false,
        });
    }

    // ─── Configure Turndown for HTML → Markdown conversion ──────────────
    function makeTurndown() {
        if (!window.TurndownService) return null;
        const td = new window.TurndownService({
            headingStyle: 'atx',         // # heading instead of underline
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',    // ```code``` instead of indented
            emDelimiter: '*',
            strongDelimiter: '**',
            linkStyle: 'inlined',        // [text](url) instead of [text][1]
        });
        // Strip class/style/id attributes to keep markdown clean
        td.addRule('strip-attrs', {
            filter: ['span', 'div'],
            replacement: (content) => content,
        });
        return td;
    }

    // ─── Main editor class ──────────────────────────────────────────────
    class MarkdownEditor {
        constructor(selector, options) {
            this.selector = selector;
            this.options = options || {};
            this.tinymceInstance = null;
            this.turndown = null;
        }

        async init() {
            // Load all dependencies in parallel
            await Promise.all([
                loadScript(MARKED_CDN, 'marked'),
                loadScript(TURNDOWN_CDN, 'TurndownService'),
                loadScript(TINYMCE_CDN, 'tinymce'),
            ]);
            configureMarked();
            this.turndown = makeTurndown();

            const target = document.querySelector(this.selector);
            if (!target) throw new Error('Editor target not found: ' + this.selector);

            const editorOptions = {
                target: target,
                license_key: 'gpl',  // Required for some plugins; cloud key handles rest
                height: 500,
                menubar: 'edit view insert format table',
                plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount autoresize',
                toolbar: 'undo redo | blocks | bold italic underline strikethrough | bullist numlist | link image table | code preview | fullscreen',
                branding: false,
                promotion: false,
                content_style: 'body { font-family: Inter, -apple-system, sans-serif; font-size: 15px; line-height: 1.6; }',
                // Sanitize on paste so users pasting from Word don't bring dangerous markup
                paste_as_text: false,
                paste_data_images: true,
                // Limit nesting/complexity
                valid_elements: 'p,br,strong/b,em/i,u,strike,s,del,ins,sub,sup,h1,h2,h3,h4,h5,h6,ul,ol,li,a[href|title|target],img[src|alt|title|width|height],blockquote,pre,code,table,thead,tbody,tr,th[scope],td,hr',
                // Auto-sync to underlying textarea
                setup: (editor) => {
                    editor.on('change input', () => {
                        editor.save();   // Push HTML to the textarea
                    });
                    if (this.options.onChange) {
                        editor.on('input change', () => this.options.onChange());
                    }
                },
            };

            return new Promise((resolve, reject) => {
                editorOptions.init_instance_callback = (ed) => {
                    this.tinymceInstance = ed;
                    resolve(this);
                };
                window.tinymce.init(editorOptions).catch(reject);
            });
        }

        /** Set editor content from a Markdown string */
        setMarkdown(md) {
            if (!this.tinymceInstance || !window.marked) return;
            const html = window.marked.parse(md || '');
            this.tinymceInstance.setContent(html);
        }

        /** Get editor content as a Markdown string */
        getMarkdown() {
            if (!this.tinymceInstance || !this.turndown) return '';
            const html = this.tinymceInstance.getContent();
            return this.turndown.turndown(html || '');
        }

        /** Get editor content as HTML (for previewing on public pages) */
        getHtml() {
            return this.tinymceInstance ? this.tinymceInstance.getContent() : '';
        }

        /** Clear the editor */
        clear() {
            if (this.tinymceInstance) this.tinymceInstance.setContent('');
        }

        /** Destroy the editor (free memory) */
        destroy() {
            if (this.tinymceInstance) {
                this.tinymceInstance.destroy();
                this.tinymceInstance = null;
            }
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────
    window.WFXMarkdownEditor = {
        /**
         * Initialize a markdown editor on the given selector.
         * @param {string} selector - CSS selector for the textarea/element
         * @param {object} options - { onChange: function }
         * @returns {Promise<MarkdownEditor>}
         */
        init: async function(selector, options) {
            const editor = new MarkdownEditor(selector, options);
            return editor.init();
        },

        /**
         * Convert Markdown to HTML — for public pages displaying news/blog.
         * Lightweight: only loads marked.js, no TinyMCE.
         */
        renderMarkdown: async function(md) {
            if (!window.marked) {
                await loadScript(MARKED_CDN, 'marked');
                configureMarked();
            }
            // Strip dangerous tags from rendered HTML before insertion
            const html = window.marked.parse(md || '');
            return html
                .replace(/<\s*(script|iframe|object|embed|link|meta|style|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
                .replace(/<\s*(script|iframe|object|embed|link|meta|style|form)\b[^>]*\/?>/gi, '')
                .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
                .replace(/javascript:/gi, '');
        },
    };
})();
