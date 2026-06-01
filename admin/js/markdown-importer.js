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
    };
})();
