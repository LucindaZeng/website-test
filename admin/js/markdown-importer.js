/**
 * WFX Markdown Importer
 * =====================
 *
 * Parses uploaded .md files with YAML frontmatter and auto-fills the
 * blog/news post form. Supports the industry-standard format used by
 * Jekyll, Hugo, Gatsby, Astro, etc.:
 *
 *   ---
 *   title: How DFM Reduces CNC Cost
 *   category: drawings-dfm
 *   excerpt: A practical checklist for designers.
 *   tags: DFM, design, cost reduction
 *   cover: https://example.com/cover.jpg
 *   status: draft
 *   date: 2026-05-27
 *   author: Lu Zeng
 *   ---
 *
 *   # Body content starts here
 *
 *   Markdown body content...
 *
 * If frontmatter is absent, we treat the whole file as body content and
 * extract the title from the first `# Heading` line (with toast warning).
 *
 * Public API:
 *   WFXMarkdownImporter.attachUploadButton(buttonContainer, formMapping)
 *   WFXMarkdownImporter.parse(markdownText) → { frontmatter, body }
 *   WFXMarkdownImporter.fillForm(formMapping, parsed)
 */
(function() {
    'use strict';

    const MAX_FILE_SIZE = 2 * 1024 * 1024;  // 2 MB — generous for any blog post
    const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'];

    /**
     * Parse frontmatter + body from a markdown string.
     * Frontmatter is YAML-like key:value (one per line), bounded by --- delimiters.
     * Lists can be inline (`tags: a, b, c`) or YAML-style (`tags:\n  - a\n  - b`).
     */
    function parseMarkdown(text) {
        // Normalize line endings
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const frontmatter = {};
        let body = text;

        // Detect frontmatter block: starts with --- at file start, ends with ---
        const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        if (fmMatch) {
            const fmText = fmMatch[1];
            body = fmMatch[2];

            // Parse line by line. Supports:
            //   key: value
            //   key: "quoted value"
            //   key: 'single quoted'
            //   key:
            //     - list item 1
            //     - list item 2
            let currentListKey = null;
            const lines = fmText.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // YAML-style list item under previous key
                if (currentListKey && /^\s+-\s+/.test(line)) {
                    const itemValue = line.replace(/^\s+-\s+/, '').trim();
                    frontmatter[currentListKey].push(stripQuotes(itemValue));
                    continue;
                }
                currentListKey = null;

                const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
                if (!m) continue;
                const key = m[1].toLowerCase();
                const rawValue = m[2].trim();

                if (rawValue === '') {
                    // Empty value: might be a YAML list following on next lines
                    frontmatter[key] = [];
                    currentListKey = key;
                } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
                    // Inline JSON-style array: [a, b, c]
                    frontmatter[key] = rawValue
                        .slice(1, -1)
                        .split(',')
                        .map(s => stripQuotes(s.trim()))
                        .filter(s => s.length > 0);
                } else if (key === 'tags' || key === 'keywords') {
                    // Common case: tags as comma-separated string
                    frontmatter[key] = rawValue
                        .split(',')
                        .map(s => stripQuotes(s.trim()))
                        .filter(s => s.length > 0);
                } else {
                    frontmatter[key] = stripQuotes(rawValue);
                }
            }
        }

        // Trim leading blank lines from body
        body = body.replace(/^\n+/, '');

        return { frontmatter, body };
    }

    function stripQuotes(s) {
        if (s.length >= 2) {
            if ((s.startsWith('"') && s.endsWith('"')) ||
                (s.startsWith("'") && s.endsWith("'"))) {
                return s.slice(1, -1);
            }
        }
        return s;
    }

    /**
     * Extract a title from the first H1 line if frontmatter title is missing.
     * Returns { title, bodyWithoutH1 } or null if no H1 found.
     */
    function extractH1Title(body) {
        const m = body.match(/^#\s+(.+?)(?:\n|$)/);
        if (!m) return null;
        const title = m[1].trim();
        const bodyWithoutH1 = body.replace(/^#\s+.+?(?:\n+|$)/, '');
        return { title, bodyWithoutH1 };
    }

    /**
     * Fill a form using a mapping of frontmatter keys to DOM element IDs.
     *
     * @param {Object} mapping   - e.g. { title: 'post-title', category: 'post-category', ... }
     *                              Special key 'content' maps to the textarea ID.
     * @param {Object} parsed    - Result of parseMarkdown(text)
     * @returns {Object}         - { filled: [...], missing: [...], warnings: [...] }
     */
    function fillForm(mapping, parsed) {
        const filled = [];
        const missing = [];
        const warnings = [];
        const { frontmatter, body } = parsed;

        // Title: prefer frontmatter, fall back to H1
        let title = frontmatter.title;
        let effectiveBody = body;
        if (!title) {
            const extracted = extractH1Title(body);
            if (extracted) {
                title = extracted.title;
                effectiveBody = extracted.bodyWithoutH1;
                warnings.push('No frontmatter title — using first # heading as title.');
            } else {
                warnings.push('No title found in frontmatter or # heading.');
            }
        }

        // Apply each mapped field
        for (const [fmKey, elementId] of Object.entries(mapping)) {
            if (fmKey === 'content') {
                const el = document.getElementById(elementId);
                if (el) {
                    // If TinyMCE is bound to this textarea, use its API; else
                    // set the textarea value directly.
                    const tinyEditor = (window.tinymce && window.tinymce.get(elementId)) || null;
                    if (tinyEditor && window.WFXMarkdownEditor) {
                        // Convert markdown → HTML for the editor
                        // marked.js is usually loaded by markdown-editor.js already
                        const html = window.marked ? window.marked.parse(effectiveBody) : effectiveBody;
                        tinyEditor.setContent(html);
                    } else {
                        el.value = effectiveBody;
                    }
                    filled.push('content');
                } else {
                    missing.push(`content (textarea #${elementId} not found)`);
                }
                continue;
            }

            const value = (fmKey === 'title') ? title : frontmatter[fmKey];
            if (value === undefined || value === null || value === '') {
                continue;  // not present in frontmatter — leave the field as-is
            }

            const el = document.getElementById(elementId);
            if (!el) {
                missing.push(`${fmKey} (element #${elementId} not found)`);
                continue;
            }

            if (el.tagName === 'SELECT') {
                // For category dropdowns: try exact match on value, then on label
                const targetValue = String(value).trim();
                let matched = false;
                for (const opt of el.options) {
                    if (opt.value === targetValue || opt.textContent.trim() === targetValue) {
                        el.value = opt.value;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    warnings.push(`Category "${targetValue}" not found in dropdown — leaving as-is.`);
                } else {
                    filled.push(fmKey);
                }
            } else if (Array.isArray(value)) {
                // Tags array → comma-separated string
                el.value = value.join(', ');
                filled.push(fmKey);
            } else {
                el.value = String(value);
                filled.push(fmKey);
            }

            // Fire change event so any listeners (e.g. dependent dropdowns) react
            try {
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (e) { /* old browsers */ }
        }

        return { filled, missing, warnings };
    }

    /**
     * Wire up a file input + button inside the given container.
     *
     * @param {HTMLElement} container  - Element to inject the upload UI into
     * @param {Object} formMapping     - { frontmatterKey: elementId, ... } incl. 'content'
     * @param {Function} onComplete    - Optional callback after successful fill
     */
    function attachUploadButton(container, formMapping, onComplete) {
        if (!container) return;
        if (container.querySelector('.md-import-btn')) return;  // idempotent

        const wrapper = document.createElement('div');
        wrapper.className = 'md-import-wrapper';
        wrapper.style.cssText = 'margin: 0 0 16px; padding: 12px 14px; background: #f0f9ff; border: 1px dashed #7dd3fc; border-radius: 8px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;';

        const icon = document.createElement('i');
        icon.className = 'fas fa-file-import';
        icon.setAttribute('aria-hidden', 'true');
        icon.style.cssText = 'color: #0369a1; font-size: 1.2rem;';
        wrapper.appendChild(icon);

        const label = document.createElement('div');
        label.style.cssText = 'flex: 1; min-width: 200px; font-size: 0.9rem; color: #075985;';
        label.innerHTML =
            '<strong>Import from Markdown file</strong> ' +
            '<span style="color: #64748b;">— upload a .md file to auto-fill all fields</span>';
        wrapper.appendChild(label);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = SUPPORTED_EXTENSIONS.join(',') + ',text/markdown';
        fileInput.style.display = 'none';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary btn-sm md-import-btn';
        button.innerHTML = '<i class="fas fa-upload" aria-hidden="true"></i> Choose .md file';
        button.style.cssText = 'white-space: nowrap;';
        button.addEventListener('click', () => fileInput.click());

        const helpLink = document.createElement('a');
        helpLink.href = '#';
        helpLink.textContent = 'Format help';
        helpLink.style.cssText = 'font-size: 0.85rem; color: #0369a1;';
        helpLink.addEventListener('click', (e) => {
            e.preventDefault();
            showFormatHelp();
        });

        wrapper.appendChild(button);
        wrapper.appendChild(fileInput);
        wrapper.appendChild(helpLink);

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validate extension
            const lname = file.name.toLowerCase();
            const hasValidExt = SUPPORTED_EXTENSIONS.some(ext => lname.endsWith(ext));
            if (!hasValidExt) {
                showToast('Please upload a .md (Markdown) file.', 'danger');
                fileInput.value = '';
                return;
            }

            // Validate size
            if (file.size > MAX_FILE_SIZE) {
                showToast(`File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB.`, 'danger');
                fileInput.value = '';
                return;
            }

            try {
                const text = await file.text();
                const parsed = parseMarkdown(text);
                const result = fillForm(formMapping, parsed);

                // Build user-facing summary
                const filledCount = result.filled.length;
                if (filledCount > 0) {
                    showToast(`Imported ${filledCount} field(s) from ${file.name}`, 'success');
                } else {
                    showToast(`File parsed but no fields filled — check format.`, 'warning');
                }

                // Show warnings as separate toasts (less critical but useful)
                if (result.warnings.length > 0) {
                    result.warnings.forEach(w => {
                        setTimeout(() => showToast(w, 'warning'), 300);
                    });
                }

                if (typeof onComplete === 'function') {
                    onComplete(parsed, result);
                }
            } catch (err) {
                showToast(`Could not read file: ${err.message}`, 'danger');
            }

            fileInput.value = '';  // allow re-upload of same file
        });

        // Drag and drop support
        wrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            wrapper.style.background = '#e0f2fe';
            wrapper.style.borderColor = '#0284c7';
        });
        wrapper.addEventListener('dragleave', () => {
            wrapper.style.background = '#f0f9ff';
            wrapper.style.borderColor = '#7dd3fc';
        });
        wrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            wrapper.style.background = '#f0f9ff';
            wrapper.style.borderColor = '#7dd3fc';
            const file = e.dataTransfer.files[0];
            if (file) {
                fileInput.files = e.dataTransfer.files;
                fileInput.dispatchEvent(new Event('change'));
            }
        });

        container.insertBefore(wrapper, container.firstChild);
    }

    function showFormatHelp() {
        const helpText = `Supported Markdown file format:

---
title: How DFM Reduces CNC Cost by 30%
category: drawings-dfm
excerpt: A practical checklist for designers.
tags: DFM, design, cost reduction
cover: https://example.com/cover.jpg
status: draft
---

# Heading

Your **markdown** content here.

NOTES:
• Frontmatter is optional but recommended.
• Without frontmatter, the first # heading becomes the title.
• Category must match an existing slug (e.g. cnc-processes, materials).
• Tags can be inline (a, b, c) or YAML list.
• Compatible with Jekyll, Hugo, Gatsby, Astro export.`;

        if (confirm(helpText + '\n\nClick OK to copy this template to clipboard.')) {
            const template = `---
title: Your Post Title
category: cnc-processes
excerpt: A short description of the post.
tags: tag1, tag2, tag3
status: draft
---

# Your Heading

Write your **markdown** content here.
`;
            try {
                navigator.clipboard.writeText(template).then(
                    () => showToast('Template copied to clipboard', 'success'),
                    () => showToast('Could not copy. Select the text manually.', 'warning')
                );
            } catch (e) {
                showToast('Clipboard not supported.', 'warning');
            }
        }
    }

    // ─── Downloadable template ──────────────────────────────────────────────
    // Generates the standard article template as a .md file the user can
    // download, edit, and re-upload. Single source of truth for the format.
    const TEMPLATE_MD = [
        '---',
        'title: How Design for Manufacturability Reduces CNC Machining Cost',
        'category: drawings-dfm',
        'excerpt: A practical checklist that helps engineers cut machining cost without sacrificing part quality.',
        'tags: DFM, design, cost reduction, CNC',
        'cover: https://wanfuxin-dg.com/images/company-video-poster.jpg',
        'status: draft',
        'date: 2026-06-01',
        'author: Lu Zeng',
        '---',
        '',
        '# How Design for Manufacturability Reduces CNC Machining Cost',
        '',
        'Write your opening paragraph here. The text above the first heading is',
        'optional — the title comes from the `title:` field in the frontmatter.',
        '',
        '## Why DFM Matters',
        '',
        'Use `##` for section headings. Keep paragraphs short and scannable.',
        'You can use all standard Markdown:',
        '',
        '- **Bold** for emphasis',
        '- *Italic* for terms',
        '- `inline code` for tolerances like `±0.01mm`',
        '- [Links](https://wanfuxin-dg.com) to other pages',
        '',
        '## A Simple Example',
        '',
        '1. Numbered lists work too',
        '2. Use them for step-by-step instructions',
        '3. Or process sequences',
        '',
        '> Blockquotes are good for key takeaways or customer quotes.',
        '',
        '## Tables',
        '',
        '| Material | Machinability | Typical Use |',
        '|----------|---------------|-------------|',
        '| Aluminum 6061 | Excellent | Brackets, housings |',
        '| Stainless 304 | Moderate | Medical, food-grade |',
        '| Titanium Ti-6Al-4V | Difficult | Aerospace, implants |',
        '',
        '## Images',
        '',
        '![Alt text describing the image](https://wanfuxin-dg.com/images/company-video-poster.jpg)',
        '',
        '## Conclusion',
        '',
        'Wrap up with a clear call to action — invite the reader to request a',
        'quote or download a resource.',
        '',
        '<!--',
        '====================================================================',
        'FRONTMATTER FIELD REFERENCE (the block between the --- lines at top)',
        '====================================================================',
        '',
        '  title     (required)  The article headline.',
        '  category  (required)  One of the 5 category slugs below.',
        '  excerpt   (optional)  1-2 sentence summary shown in listings.',
        '  tags      (optional)  Comma-separated keywords.',
        '  cover     (optional)  Full URL to the cover image.',
        '  status    (optional)  "draft" or "published". Defaults to draft.',
        '  date      (optional)  YYYY-MM-DD. Defaults to today.',
        '  author    (optional)  Author name.',
        '',
        'VALID CATEGORY SLUGS (use the slug on the left in the category: field):',
        '  cnc-processes       -> CNC Processes & Machines',
        '  materials           -> Materials Knowledge Hub',
        '  drawings-dfm        -> Engineering Drawings & DFM',
        '  surface-finishing   -> Surface Finishing',
        '  related-processes   -> Related Processes & Quality',
        '',
        'NOTES:',
        '  - The frontmatter block MUST be the very first thing in the file,',
        '    wrapped in three dashes (---) above and below.',
        '  - If you omit the frontmatter entirely, the importer treats the whole',
        '    file as body content and pulls the title from the first "# Heading".',
        '  - When batch-uploading, you can override the category for each file in',
        '    the upload dialog.',
        '-->',
        ''
    ].join('\n');

    function downloadTemplate() {
        const blob = new Blob([TEMPLATE_MD], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wfx-article-template.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Template downloaded: wfx-article-template.md', 'success');
    }

    // ─── Category options (kept in sync with the 5 news pillars) ────────────
    // Reads live categories from localStorage if present, else falls back to
    // the canonical 5. Returns [{name, slug}].
    function getCategoryOptions() {
        try {
            const stored = JSON.parse(localStorage.getItem('wfx_categories') || '{}');
            if (stored.news && stored.news.length) {
                return stored.news.map(c => ({ name: c.name, slug: c.slug }));
            }
        } catch (e) {}
        return [
            { name: 'CNC Processes & Machines',    slug: 'cnc-processes' },
            { name: 'Materials Knowledge Hub',     slug: 'materials' },
            { name: 'Engineering Drawings & DFM',  slug: 'drawings-dfm' },
            { name: 'Surface Finishing',           slug: 'surface-finishing' },
            { name: 'Related Processes & Quality', slug: 'related-processes' }
        ];
    }

    // ─── Batch upload ───────────────────────────────────────────────────────
    // Accepts multiple .md files, parses each, shows a review table where the
    // user can set/override the category per file, then creates all posts at
    // once via the provided saveFn(parsedPost) callback.
    function openBatchUpload(saveFn, opts) {
        opts = opts || {};
        const kind = opts.kind || 'post';  // 'post' or 'news'

        // Build modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'md-batch-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; z-index:2000; background:rgba(10,22,40,0.6); display:flex; align-items:center; justify-content:center; padding:20px;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#fff; border-radius:14px; max-width:760px; width:100%; max-height:90vh; overflow-y:auto; padding:26px; position:relative;';
        overlay.appendChild(modal);

        const cats = getCategoryOptions();

        modal.innerHTML =
            '<button class="md-batch-close" aria-label="Close" style="position:absolute; top:14px; right:14px; width:30px; height:30px; border:none; background:#f1f5f9; border-radius:50%; cursor:pointer; font-size:1rem; color:#64748b;">&times;</button>' +
            '<h2 style="margin:0 0 6px; font-size:1.3rem; color:#0f172a;"><i class="fas fa-layer-group" aria-hidden="true"></i> Batch upload Markdown</h2>' +
            '<p style="color:#64748b; font-size:0.9rem; margin:0 0 18px;">Select multiple .md files. Review each below, set the category, then import all at once.</p>' +
            '<div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:18px;">' +
              '<button type="button" class="btn btn-primary btn-sm md-batch-choose"><i class="fas fa-upload" aria-hidden="true"></i> Choose .md files</button>' +
              '<button type="button" class="btn btn-outline btn-sm md-batch-template"><i class="fas fa-download" aria-hidden="true"></i> Download template</button>' +
              '<input type="file" class="md-batch-input" accept="' + (SUPPORTED_EXTENSIONS.join(',')) + ',text/markdown" multiple style="display:none;">' +
            '</div>' +
            '<div class="md-batch-list"></div>' +
            '<div class="md-batch-actions" style="display:none; margin-top:18px; gap:10px; display:flex; justify-content:flex-end;">' +
              '<button type="button" class="btn btn-outline md-batch-cancel">Cancel</button>' +
              '<button type="button" class="btn btn-primary md-batch-import"><i class="fas fa-check" aria-hidden="true"></i> Import all</button>' +
            '</div>';

        document.body.appendChild(overlay);

        const fileInput = modal.querySelector('.md-batch-input');
        const listEl = modal.querySelector('.md-batch-list');
        const actionsEl = modal.querySelector('.md-batch-actions');
        let parsedFiles = [];  // [{ name, parsed, category }]

        function close() {
            document.body.removeChild(overlay);
        }
        modal.querySelector('.md-batch-close').addEventListener('click', close);
        modal.querySelector('.md-batch-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        modal.querySelector('.md-batch-template').addEventListener('click', downloadTemplate);
        modal.querySelector('.md-batch-choose').addEventListener('click', () => fileInput.click());

        function catSelectHTML(selectedSlug) {
            let html = '<select class="form-control md-batch-cat" style="padding:6px 10px; font-size:0.85rem; min-width:200px;">';
            cats.forEach(c => {
                const sel = c.slug === selectedSlug ? ' selected' : '';
                html += '<option value="' + c.slug + '"' + sel + '>' + escapeHtml(c.name) + '</option>';
            });
            html += '</select>';
            return html;
        }

        function escapeHtml(s) {
            if (s == null) return '';
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        function renderList() {
            if (parsedFiles.length === 0) {
                listEl.innerHTML = '';
                actionsEl.style.display = 'none';
                return;
            }
            let html = '<table style="width:100%; border-collapse:collapse; font-size:0.88rem;">' +
                '<thead><tr style="text-align:left; color:#475569; border-bottom:1px solid #e2e8f0;">' +
                '<th style="padding:8px 6px;">File</th><th style="padding:8px 6px;">Title</th>' +
                '<th style="padding:8px 6px;">Category</th><th style="padding:8px 6px;">Status</th>' +
                '<th style="padding:8px 6px;"></th></tr></thead><tbody>';
            parsedFiles.forEach((pf, i) => {
                const fm = pf.parsed.frontmatter || {};
                const title = fm.title || pf.parsed.derivedTitle || '(no title)';
                const status = (fm.status || 'draft');
                html += '<tr data-idx="' + i + '" style="border-bottom:1px solid #f1f5f9;">' +
                    '<td style="padding:8px 6px; color:#64748b;"><i class="fas fa-file-alt" aria-hidden="true"></i> ' + escapeHtml(pf.name) + '</td>' +
                    '<td style="padding:8px 6px; font-weight:500;">' + escapeHtml(title) + '</td>' +
                    '<td style="padding:8px 6px;">' + catSelectHTML(pf.category) + '</td>' +
                    '<td style="padding:8px 6px;"><span style="padding:2px 8px; border-radius:10px; font-size:0.75rem; background:' + (status === 'published' ? '#d1fae5;color:#065f46' : '#fef3c7;color:#92400e') + ';">' + escapeHtml(status) + '</span></td>' +
                    '<td style="padding:8px 6px;"><button type="button" class="md-batch-remove" data-idx="' + i + '" style="border:none;background:none;color:#dc2626;cursor:pointer;" aria-label="Remove"><i class="fas fa-times" aria-hidden="true"></i></button></td>' +
                    '</tr>';
            });
            html += '</tbody></table>';
            listEl.innerHTML = html;
            actionsEl.style.display = 'flex';

            // Wire per-row category selects
            listEl.querySelectorAll('tr[data-idx]').forEach(row => {
                const idx = parseInt(row.getAttribute('data-idx'));
                const sel = row.querySelector('.md-batch-cat');
                if (sel) sel.addEventListener('change', () => { parsedFiles[idx].category = sel.value; });
            });
            // Wire remove buttons
            listEl.querySelectorAll('.md-batch-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.getAttribute('data-idx'));
                    parsedFiles.splice(idx, 1);
                    renderList();
                });
            });
        }

        fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            for (const file of files) {
                const lname = file.name.toLowerCase();
                if (!SUPPORTED_EXTENSIONS.some(ext => lname.endsWith(ext))) {
                    showToast('Skipped non-Markdown file: ' + file.name, 'warning');
                    continue;
                }
                if (file.size > MAX_FILE_SIZE) {
                    showToast('Skipped (too large): ' + file.name, 'warning');
                    continue;
                }
                const text = await file.text();
                const parsed = parseMarkdown(text);
                if (!parsed.frontmatter.title) {
                    const h1 = extractH1Title(parsed.body);
                    parsed.derivedTitle = (h1 && h1.title) || file.name.replace(/\.[^.]+$/, '');
                }
                const defaultCat = parsed.frontmatter.category || (cats[0] && cats[0].slug);
                parsedFiles.push({ name: file.name, parsed: parsed, category: defaultCat });
            }
            fileInput.value = '';
            renderList();
        });

        modal.querySelector('.md-batch-import').addEventListener('click', () => {
            if (parsedFiles.length === 0) { showToast('No files to import.', 'warning'); return; }
            let ok = 0, fail = 0;
            parsedFiles.forEach(pf => {
                const fm = pf.parsed.frontmatter || {};
                const postData = {
                    title: fm.title || pf.parsed.derivedTitle || '(untitled)',
                    category: pf.category,
                    status: fm.status || 'draft',
                    excerpt: fm.excerpt || '',
                    content: pf.parsed.body || '',
                    content_format: 'markdown',
                    featuredImage: fm.cover || '',
                    tags: (fm.tags || '').split(',').map(t => t.trim()).filter(Boolean)
                };
                try {
                    const res = saveFn(postData);
                    if (res && res.success !== false) ok++; else fail++;
                } catch (err) {
                    fail++;
                }
            });
            showToast('Imported ' + ok + ' article(s)' + (fail ? ', ' + fail + ' failed' : ''), fail ? 'warning' : 'success');
            close();
            if (typeof opts.onComplete === 'function') opts.onComplete();
        });
    }

    // Minimal toast helper (uses global showToast if available, else simple alert)
    function showToast(msg, kind) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, kind);
        } else {
            // Fallback: console + visible inline notice
            console.log(`[${kind || 'info'}] ${msg}`);
        }
    }

    // Public API
    window.WFXMarkdownImporter = {
        parse: parseMarkdown,
        fillForm: fillForm,
        attachUploadButton: attachUploadButton,
        downloadTemplate: downloadTemplate,
        openBatchUpload: openBatchUpload,
    };
})();
