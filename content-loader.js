/* Normalize a same-origin relative image path (e.g. "images/x.webp") to
   root-absolute ("/images/x.webp") so CMS images resolve on directory URLs.
   Leaves absolute URLs (http(s):// or /...) and empty values untouched. */
function _absImg(u) {
    if (!u || typeof u !== 'string') return u;
    var t = u.trim();
    if (!t) return t;
    if (/^(https?:)?\/\//i.test(t) || t.charAt(0) === '/') return t;
    return '/' + t;
}

/**
 * WFX Content Loader
 * Loads editable content from localStorage and updates page elements
 * Works with both data attributes and automatic element detection
 */

const ContentLoader = {
    STORAGE_KEY: 'wfx_page_content',

    // Page selectors mapping - defines which elements to update on each page
    PAGE_SELECTORS: {
        index: {
            'hero.title': '.hero-title',
            'hero.description': '.hero-description',
            'hero.videoUrl': '.hero-video source',
            'trustedBy.label': '.trusted-by-label',
            'services.sectionTitle': '#services .section-title',
            'services.sectionDescription': '#services .section-description',
            'services.ctaText': '.services-cta p',
            'quote.title': '#quote h2',
            'quote.description': '#quote > .container > .quote-wrapper > .quote-content > p',
            'whyChoose.title': '.features-section .section-title, .why-choose .section-title',
            'whyChoose.description': '.features-section .section-description, .why-choose .section-description',
            'companyVideo.title': '.company-video-section h2, .video-section h2',
            'companyVideo.description': '.company-video-section p, .video-section p'
        },
        about: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero p',
            'intro.title': '.about-intro h2, .about-intro-content h2',
            'intro.content': '.about-intro p, .about-intro-content p'
        },
        industries: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero p'
        },
        finishing: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero p',
            'intro.title': '.finishing-intro h2',
            'intro.description': '.finishing-intro p'
        },
        resources: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero p'
        },
        contact: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero p'
        },
        cncMilling: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero p'
        },
        cncTurning: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero p'
        },
        fiveAxis: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero p'
        }
    },

    // Initialize and load content
    init: function() {
        // One-time migration: clear stale poster URLs from previous versions
        try {
            const MIGRATION_KEY = 'wfx_migration_v3_applied';
            if (!localStorage.getItem(MIGRATION_KEY)) {
                // 1. Clean wfx_page_content
                const pageContent = JSON.parse(localStorage.getItem('wfx_page_content') || '{}');
                if (pageContent.index && pageContent.index.companyVideo && pageContent.index.companyVideo.posterUrl) {
                    const url = pageContent.index.companyVideo.posterUrl;
                    if (url.includes('1565193566173-7a0ee3dbe261') ||
                        url.includes('1581094271901-8022df4466f9')) {
                        pageContent.index.companyVideo.posterUrl = 'images/company-video-poster.jpg';
                        localStorage.setItem('wfx_page_content', JSON.stringify(pageContent));
                    }
                }
                // 2. Clean wfx_homepage_media (used by loadHomepageMedia in script.js)
                const homepageMedia = JSON.parse(localStorage.getItem('wfx_homepage_media') || 'null');
                if (homepageMedia && homepageMedia.companyVideoPoster) {
                    if (homepageMedia.companyVideoPoster.includes('1565193566173-7a0ee3dbe261') ||
                        homepageMedia.companyVideoPoster.includes('1581094271901-8022df4466f9')) {
                        homepageMedia.companyVideoPoster = 'images/company-video-poster.jpg';
                        localStorage.setItem('wfx_homepage_media', JSON.stringify(homepageMedia));
                    }
                }
                localStorage.setItem(MIGRATION_KEY, '1');
            }
        } catch (e) { /* ignore */ }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.loadPageContent());
        } else {
            this.loadPageContent();
        }
    },

    // Get content from storage. Priority order:
    //   1. Server-injected data (window.__WFX_CMS__) — what Google sees, always fresh
    //   2. localStorage cache — for offline/legacy fallback
    getContent: function() {
        // Server-injected data takes precedence (set by server.py before </head>)
        if (window.__WFX_CMS__ && window.__WFX_CMS__.page_content) {
            return window.__WFX_CMS__.page_content;
        }
        try {
            const content = localStorage.getItem(this.STORAGE_KEY);
            return content ? JSON.parse(content) : null;
        } catch (e) {
            console.warn('ContentLoader: Failed to load content from storage');
            return null;
        }
    },

    // Get current page name from URL
    getCurrentPage: function() {
        const path = window.location.pathname;
        const filename = path.split('/').pop().replace('.html', '') || 'index';
        
        // Skip Chinese pages
        if (path.includes('/cn/')) return null;
        
        // Map filenames to content keys
        const pageMap = {
            'index': 'index',
            '': 'index',
            'about': 'about',
            'cnc-milling': 'cncMilling',
            'cnc-turning': 'cncTurning',
            '5-axis': 'fiveAxis',
            'industries': 'industries',
            'finishing': 'finishing',
            'materials': 'materials',
            'resources': 'resources',
            'contact': 'contact',
            'aerospace': 'industries',
            'medical': 'industries',
            'electronics': 'industries',
            'industrial': 'industries',
            'robotics': 'industries',
            'liquid-cooling': 'industries'
        };
        
        return pageMap[filename] || null;
    },

    // Load and apply content to page
    loadPageContent: function() {
        const allContent = this.getContent();
        if (!allContent) return;

        const pageName = this.getCurrentPage();
        if (!pageName) return;

        const pageContent = allContent[pageName];
        if (!pageContent) return;

        // Apply content using selectors
        this.applySelectorsContent(pageName, pageContent);

        // Apply content to elements with data-content attributes
        this.applyDataAttributes(pageContent);

        // Load video content
        this.loadVideoContent(pageContent);

        // Load repeated/array content
        this.loadRepeatedContent(pageName, pageContent, allContent);
    },

    // Load video content
    loadVideoContent: function(pageContent) {
        // Hero video
        if (pageContent.hero && pageContent.hero.videoUrl) {
            const heroVideo = document.querySelector('.hero-video');
            if (heroVideo) {
                const source = heroVideo.querySelector('source');
                if (source) {
                    source.src = pageContent.hero.videoUrl;
                    heroVideo.load();
                }
            }
        }

        // Company video
        if (pageContent.companyVideo) {
            const companyVideo = document.querySelector('#company-video, .video-container video, .company-video video, #companyVideo');
            if (companyVideo) {
                // Update video source
                if (pageContent.companyVideo.videoUrl) {
                    const source = companyVideo.querySelector('source');
                    if (source) {
                        source.src = pageContent.companyVideo.videoUrl;
                        companyVideo.load();
                    }
                }
                // Update poster — but skip if it's the old vase image from stale localStorage
                if (pageContent.companyVideo.posterUrl) {
                    const posterUrl = pageContent.companyVideo.posterUrl;
                    // Filter out stale stock photos that were used as defaults before
                    // (vase image and any Unsplash placeholder that isn't a real custom upload)
                    const isStaleDefault = posterUrl.includes('1565193566173-7a0ee3dbe261') ||
                                          posterUrl.includes('1581094271901-8022df4466f9') ||
                                          posterUrl === '' ||
                                          posterUrl === 'https://...';
                    if (!isStaleDefault) {
                        companyVideo.poster = posterUrl;
                    }
                }
            }

            // Update video section title and description
            const videoSection = document.querySelector('.video-section, .company-video-section');
            if (videoSection) {
                const title = videoSection.querySelector('h2, .section-title');
                const desc = videoSection.querySelector('p, .section-description');
                if (title && pageContent.companyVideo.title) {
                    title.textContent = pageContent.companyVideo.title;
                }
                if (desc && pageContent.companyVideo.description) {
                    desc.textContent = pageContent.companyVideo.description;
                }
            }
        }
    },

    // Apply content using predefined selectors
    applySelectorsContent: function(pageName, pageContent) {
        const selectors = this.PAGE_SELECTORS[pageName];
        if (!selectors) return;

        for (const [contentPath, selector] of Object.entries(selectors)) {
            const value = this.getNestedValue(pageContent, contentPath);
            if (value === undefined || value === null) continue;

            document.querySelectorAll(selector).forEach(element => {
                this.applyContent(element, value);
            });
        }
    },

    // Apply content to elements with data-content attributes
    applyDataAttributes: function(pageContent) {
        // Text content
        document.querySelectorAll('[data-content]').forEach(element => {
            const contentPath = element.dataset.content;
            const value = this.getNestedValue(pageContent, contentPath);
            if (value !== undefined) {
                this.applyContent(element, value);
            }
        });

        // Image/video sources
        document.querySelectorAll('[data-content-src]').forEach(element => {
            const contentPath = element.dataset.contentSrc;
            const value = this.getNestedValue(pageContent, contentPath);
            if (value) {
                if (element.tagName === 'IMG') {
                    element.src = value;
                } else if (element.tagName === 'VIDEO') {
                    const source = element.querySelector('source');
                    if (source) source.src = value;
                } else if (element.tagName === 'SOURCE') {
                    element.src = value;
                }
            }
        });

        // Links
        document.querySelectorAll('[data-content-href]').forEach(element => {
            const contentPath = element.dataset.contentHref;
            const value = this.getNestedValue(pageContent, contentPath);
            if (value) {
                element.href = value;
            }
        });
    },

    // Get nested value from object using dot notation
    getNestedValue: function(obj, path) {
        return path.split('.').reduce((current, key) => {
            if (!current) return undefined;
            // Handle array index notation like items[0]
            const match = key.match(/^(\w+)\[(\d+)\]$/);
            if (match) {
                const arrayKey = match[1];
                const index = parseInt(match[2]);
                return current[arrayKey] ? current[arrayKey][index] : undefined;
            }
            return current[key];
        }, obj);
    },

    // Apply content to element based on type
    applyContent: function(element, value) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            element.value = value;
        } else if (element.tagName === 'IMG') {
            element.src = value;
        } else if (element.tagName === 'SOURCE') {
            element.src = value;
            // Reload parent video
            const video = element.closest('video');
            if (video) video.load();
        } else if (element.tagName === 'A' && value.startsWith('http')) {
            element.href = value;
        } else {
            // Preserve any HTML structure within the element if it contains tags
            if (element.children.length > 0 && !element.dataset.replaceHtml) {
                // Only update text nodes
                const textNode = Array.from(element.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
                if (textNode) {
                    textNode.textContent = value;
                }
            } else {
                element.textContent = value;
            }
        }
    },

    // Load repeated/array content (services, industries, etc.)
    loadRepeatedContent: function(pageName, pageContent, allContent) {
        // Update services on index page
        if (pageName === 'index' && pageContent.services && pageContent.services.items) {
            this.updateServicesSection(pageContent.services.items);
        }

        // Update trusted brands
        if (pageContent.trustedBy && pageContent.trustedBy.brands) {
            this.updateBrandsSection(pageContent.trustedBy.brands);
        }

        // Update industries section
        if (pageName === 'industries' && pageContent.items) {
            this.updateIndustriesSection(pageContent.items);
        }

        // Update finishing processes
        if (pageName === 'finishing' && pageContent.processes) {
            this.updateFinishingSection(pageContent.processes);
        }

        // Update stats
        if (pageContent.stats) {
            this.updateStatsSection(pageContent.stats);
        }

        // Update features/why choose section
        if (pageContent.whyChoose && pageContent.whyChoose.features) {
            this.updateFeaturesSection(pageContent.whyChoose.features);
        }
    },

    // Update services cards
    updateServicesSection: function(services) {
        const serviceCards = document.querySelectorAll('.service-card, [data-service]');
        const serviceIds = ['cnc-milling', 'cnc-turning', '5-axis', 'precision-inspection'];

        serviceCards.forEach((card, index) => {
            const serviceId = card.dataset.service || serviceIds[index];
            const service = services.find(s => s.id === serviceId) || services[index];
            
            if (!service) return;

            const titleEl = card.querySelector('h3');
            const descEl = card.querySelector('p');
            const imgEl = card.querySelector('img');
            const linkEl = card.querySelector('a.service-link');

            if (titleEl && service.title) titleEl.textContent = service.title;
            if (descEl && service.description) descEl.textContent = service.description;
            if (imgEl && service.image) imgEl.src = service.image;
            if (linkEl && service.link) linkEl.href = service.link;
        });
    },

    // Update trusted brands
    updateBrandsSection: function(brands) {
        const brandElements = document.querySelectorAll('.trusted-by-logos a, .trust-logo-item');
        
        brandElements.forEach((element, index) => {
            const brand = brands[index];
            if (!brand) return;

            element.textContent = brand.name;
            if (brand.url) element.href = brand.url;
        });
    },

    // Update industries cards
    updateIndustriesSection: function(industries) {
        const industryCards = document.querySelectorAll('.industry-card');
        
        industryCards.forEach((card, index) => {
            const industry = industries[index];
            if (!industry) return;

            const titleEl = card.querySelector('h3');
            const descEl = card.querySelector('p');
            const imgEl = card.querySelector('img');
            const linkEl = card.querySelector('a.btn-link, a[href]');

            if (titleEl && industry.title) titleEl.textContent = industry.title;
            if (descEl && industry.description) descEl.textContent = industry.description;
            if (imgEl && industry.image) imgEl.src = industry.image;
            if (linkEl && industry.link) linkEl.href = industry.link;
        });
    },

    // Update finishing process cards
    updateFinishingSection: function(processes) {
        const processCards = document.querySelectorAll('.finishing-card');
        
        processCards.forEach((card, index) => {
            const process = processes[index];
            if (!process) return;

            const titleEl = card.querySelector('h3');
            const descEl = card.querySelector('p');
            const imgEl = card.querySelector('img');
            const featuresEl = card.querySelector('.finishing-features');

            if (titleEl && process.title) titleEl.textContent = process.title;
            if (descEl && process.description) descEl.textContent = process.description;
            if (imgEl && process.image) imgEl.src = process.image;
            
            if (featuresEl && process.features && Array.isArray(process.features)) {
                // Use DOM construction (not innerHTML) — admin-supplied strings
                // could contain HTML/JS otherwise. textContent is XSS-safe.
                featuresEl.textContent = '';
                process.features.forEach(f => {
                    const li = document.createElement('li');
                    const icon = document.createElement('i');
                    icon.className = 'fas fa-check';
                    icon.setAttribute('aria-hidden', 'true');
                    li.appendChild(icon);
                    li.appendChild(document.createTextNode(' ' + String(f)));
                    featuresEl.appendChild(li);
                });
            }
        });
    },

    // Update stats section
    updateStatsSection: function(stats) {
        const statItems = document.querySelectorAll('.stat-item, .stat-card');
        
        statItems.forEach((item, index) => {
            const stat = stats[index];
            if (!stat) return;

            const valueEl = item.querySelector('.stat-number, .stat-value, h3');
            const labelEl = item.querySelector('.stat-label, p');

            if (valueEl && stat.value) valueEl.textContent = stat.value;
            if (labelEl && stat.label) labelEl.textContent = stat.label;
        });
    },

    // Update features/why choose section
    updateFeaturesSection: function(features) {
        const featureItems = document.querySelectorAll('.feature-card, .value-card, .why-item');
        
        featureItems.forEach((item, index) => {
            const feature = features[index];
            if (!feature) return;

            const iconEl = item.querySelector('i');
            const titleEl = item.querySelector('h3, h4');
            const descEl = item.querySelector('p');

            if (iconEl && feature.icon) iconEl.className = feature.icon;
            if (titleEl && feature.title) titleEl.textContent = feature.title;
            if (descEl && feature.description) descEl.textContent = feature.description;
        });
    }
};

// Auto-initialize
ContentLoader.init();


/**
 * ─── Generic CMS Collections Renderer ──────────────────────────────────────
 * Renders per-page editable lists (equipment, materials, …) that admins manage
 * in the CMS. Fully self-contained and wrapped in try/catch so any failure here
 * NEVER affects the rest of the page — the inline HTML fallback simply stays.
 *
 * Markup contract on a page:
 *   <div data-cms-collection="cnc-milling:equipment">
 *       <!-- existing hardcoded items here = the fallback, shown if CMS is empty -->
 *       <template data-cms-item>
 *           <div class="...">
 *               <h3 data-field="name"></h3>
 *               <p  data-field="description"></p>
 *               <img data-field-src="image">
 *               <a   data-field-href="link">…</a>
 *           </div>
 *       </template>
 *   </div>
 *
 * Behaviour: if window.__WFX_CMS__.collections[page][collection] has items, the
 * fallback children are replaced with rendered items. Otherwise nothing changes.
 * All values are written via textContent / setAttribute (never innerHTML), so
 * admin-entered content cannot inject markup.
 */
(function () {
    function renderCollections() {
        var cms = window.__WFX_CMS__;
        var data = cms && cms.collections;
        if (!data) return; // No server data (e.g. static preview) → keep fallbacks

        var containers = document.querySelectorAll('[data-cms-collection]');
        Array.prototype.forEach.call(containers, function (container) {
            try {
                var key = container.getAttribute('data-cms-collection') || '';
                var sep = key.indexOf(':');
                if (sep < 0) return;
                var page = key.slice(0, sep);
                var collection = key.slice(sep + 1);

                var items = data[page] && data[page][collection];
                if (!Array.isArray(items) || items.length === 0) return; // keep fallback

                var tpl = container.querySelector('template[data-cms-item]');
                if (!tpl || !tpl.content || !tpl.content.firstElementChild) return;

                var frag = document.createDocumentFragment();
                items.forEach(function (item) {
                    var node = tpl.content.firstElementChild.cloneNode(true);

                    // slug("Very High") -> "very-high"
                    var slug = function (v) {
                        return String(v == null ? '' : v).trim().toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    };
                    // include the cloned root itself, not just descendants (a field
                    // attribute may sit on the item's root element, e.g. <a data-field-href>)
                    var withSelf = function (sel) {
                        var list = Array.prototype.slice.call(node.querySelectorAll(sel));
                        if (node.matches && node.matches(sel)) list.unshift(node);
                        return list;
                    };

                    // Text fields → textContent (auto-escaped)
                    withSelf('[data-field]').forEach(function (el) {
                        var f = el.getAttribute('data-field');
                        if (item[f] != null && item[f] !== '') el.textContent = item[f];
                    });
                    // Image source
                    withSelf('[data-field-src]').forEach(function (el) {
                        var f = el.getAttribute('data-field-src');
                        if (item[f]) el.setAttribute('src', _absImg(item[f]));
                    });
                    // Link href
                    withSelf('[data-field-href]').forEach(function (el) {
                        var f = el.getAttribute('data-field-href');
                        if (item[f]) el.setAttribute('href', item[f]);
                    });
                    // data-field-class="machinability" -> adds "rating-excellent" (CSS colours it)
                    withSelf('[data-field-class]').forEach(function (el) {
                        var sv = slug(item[el.getAttribute('data-field-class')]);
                        if (sv) el.classList.add('rating-' + sv);
                    });
                    // data-field-iconclass="icon" -> sets the element's class to the field value
                    // (e.g. "fas fa-plane"). Sanitised to class-name-safe chars only.
                    withSelf('[data-field-iconclass]').forEach(function (el) {
                        var v = item[el.getAttribute('data-field-iconclass')];
                        if (v != null && v !== '') {
                            var safe = String(v).replace(/[^a-zA-Z0-9 _-]/g, '').trim();
                            if (safe) el.className = safe;
                        }
                    });
                    // data-field-addclass="family" -> adds "aluminum" (keeps the row filter working)
                    withSelf('[data-field-addclass]').forEach(function (el) {
                        var sv = slug(item[el.getAttribute('data-field-addclass')]);
                        if (sv) el.classList.add(sv);
                    });
                    // Nested string list (e.g. feature bullets). A container with
                    // data-cms-list="features" holds <template data-cms-subitem>; the field
                    // value is an array of strings (or newline-separated string). Each entry
                    // clones the sub-template; data-field="." receives the entry text.
                    withSelf('[data-cms-list]').forEach(function (listEl) {
                        var fname = listEl.getAttribute('data-cms-list');
                        var raw = item[fname];
                        var entries = Array.isArray(raw)
                            ? raw
                            : (raw == null || raw === '' ? [] : String(raw).split('\n'));
                        entries = entries.map(function (e) { return String(e).trim(); })
                                         .filter(function (e) { return e !== ''; });
                        var sub = listEl.querySelector('template[data-cms-subitem]');
                        if (!sub || !sub.content || !sub.content.firstElementChild || !entries.length) return;
                        var subfrag = node.ownerDocument.createDocumentFragment();
                        entries.forEach(function (text) {
                            var li = sub.content.firstElementChild.cloneNode(true);
                            var target = (li.matches && li.matches('[data-field="."]'))
                                ? li : li.querySelector('[data-field="."]');
                            if (target) target.textContent = text;
                            subfrag.appendChild(li);
                        });
                        Array.prototype.slice.call(listEl.children).forEach(function (c) {
                            if (c.tagName !== 'TEMPLATE') c.remove();
                        });
                        listEl.appendChild(subfrag);
                    });
                    frag.appendChild(node);
                });

                // Remove fallback children (but keep the <template>), then insert rendered items
                Array.prototype.slice.call(container.children).forEach(function (c) {
                    if (c.tagName !== 'TEMPLATE') c.remove();
                });
                container.appendChild(frag);
            } catch (err) {
                // Isolated failure: this one container keeps its fallback HTML
                if (window.console) console.warn('CMS collection render skipped:', err);
            }
        });
    }

    function boot() {
        try { renderCollections(); } catch (e) { /* keep all fallbacks */ }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();


/**
 * ─── Homepage "What's New" Renderer ─────────────────────────────────────────
 * Rebuilds the .news-grid from the admin-selected articles
 * (window.__WFX_CMS__.homepage_news; first item = featured big card). If nothing
 * is selected or the data is missing, the built-in cards in the HTML stay as the
 * fallback. Self-contained + try/caught so it can never break the page; every
 * value is written via textContent / setAttribute (no markup injection).
 */
(function () {
    function fmtDate(s) {
        if (!s) return '';
        var d = new Date(s);
        if (isNaN(d.getTime())) return String(s);
        try { return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
        catch (e) { return d.toISOString().slice(0, 10); }
    }
    function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

    function buildCard(item, featured) {
        var card = el('div', 'news-card' + (featured ? ' featured' : ''));
        var imgWrap = el('div', 'news-image');
        var img = el('img');
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        if (item.image_url) img.setAttribute('src', _absImg(item.image_url));
        img.setAttribute('alt', item.title || '');
        imgWrap.appendChild(img);
        if (item.category) {
            var cat = el('span', 'news-category');
            cat.textContent = item.category;
            imgWrap.appendChild(cat);
        }
        card.appendChild(imgWrap);

        var content = el('div', 'news-content');
        var date = el('span', 'news-date');
        date.textContent = fmtDate(item.published_at);
        content.appendChild(date);
        var h3 = el('h3'); h3.textContent = item.title || ''; content.appendChild(h3);
        if (item.excerpt) { var p = el('p'); p.textContent = item.excerpt; content.appendChild(p); }
        var link = el('a', 'news-link');
        link.setAttribute('href', item.slug ? ('blog.html#' + item.slug) : 'blog.html');
        link.innerHTML = 'Read More <i class="fas fa-arrow-right" aria-hidden="true"></i>';
        content.appendChild(link);
        card.appendChild(content);
        return card;
    }

    function renderHomepageNews() {
        var cms = window.__WFX_CMS__;
        var items = cms && cms.homepage_news;
        if (!Array.isArray(items) || items.length === 0) return;  // keep built-in cards
        var grid = document.querySelector('.news-grid');
        if (!grid) return;
        var frag = document.createDocumentFragment();
        items.forEach(function (item, i) {
            try { frag.appendChild(buildCard(item, item.featured != null ? !!item.featured : i === 0)); }
            catch (e) { /* skip a bad item, keep the rest */ }
        });
        if (!frag.childNodes.length) return;  // nothing valid → keep fallback
        grid.innerHTML = '';
        grid.appendChild(frag);
    }

    function boot() { try { renderHomepageNews(); } catch (e) { /* keep built-in cards */ } }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();


/**
 * ─── Blog & News page (blog.html) ────────────────────────────────────────────
 * Renders #blog-dynamic from the CMS as a LIST, with News and Blog kept in
 * separate sections. A single article opens at blog.html?post=<slug> (detail
 * view). If there's no CMS data, #blog-fallback (static cards) stays visible.
 * All values via textContent (no markup injection); the article body renders as
 * text paragraphs (preserves line breaks) for safety.
 */
(function () {
    function el(t, c) { var e = document.createElement(t); if (c) e.className = c; return e; }
    function fmtDate(s) {
        if (!s) return '';
        var d = new Date(s);
        if (isNaN(d.getTime())) return String(s);
        try { return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
        catch (e) { return d.toISOString().slice(0, 10); }
    }
    function param(name) { try { return new URLSearchParams(window.location.search).get(name); } catch (e) { return null; } }
    function published(arr) {
        return (Array.isArray(arr) ? arr : []).filter(function (x) {
            return x && x.is_published !== 0 && x.is_published !== false;
        });
    }

    function listItem(item) {
        var a = el('a', 'blog-list-item');
        a.setAttribute('href', 'blog.html?post=' + encodeURIComponent(item.slug || ''));
        if (item.image_url) {
            var th = el('div', 'blog-list-thumb');
            var img = el('img'); img.setAttribute('loading', 'lazy');
            img.setAttribute('src', item.image_url); img.setAttribute('alt', item.title || '');
            th.appendChild(img); a.appendChild(th);
        }
        var body = el('div', 'blog-list-body');
        var meta = el('div', 'blog-list-meta');
        if (item.category) { var c = el('span', 'blog-list-cat'); c.textContent = item.category; meta.appendChild(c); }
        var dt = el('span', 'blog-list-date'); dt.textContent = fmtDate(item.published_at); meta.appendChild(dt);
        body.appendChild(meta);
        var h = el('h3'); h.textContent = item.title || ''; body.appendChild(h);
        if (item.excerpt) { var p = el('p'); p.textContent = item.excerpt; body.appendChild(p); }
        a.appendChild(body);
        var chev = el('i', 'blog-list-arrow fas fa-chevron-right'); chev.setAttribute('aria-hidden', 'true');
        a.appendChild(chev);
        return a;
    }

    function renderList(host, news, blog) {
        host.innerHTML = '';
        function listOf(items) {
            var list = el('div', 'blog-list');
            items.forEach(function (it) { try { list.appendChild(listItem(it)); } catch (e) {} });
            return list;
        }
        if (news.length) {
            var nh = el('h2', 'blog-section-title'); nh.textContent = 'News'; host.appendChild(nh);
            host.appendChild(listOf(news));
        }
        if (blog.length) {
            var bh = el('h2', 'blog-section-title'); bh.textContent = 'Blog & Articles'; host.appendChild(bh);
            // Group articles by category; show the three core types first, then any others.
            var order = ['CNC Processes & Machines', 'Materials Knowledge Hub', 'Engineering Drawings & DFM', 'Surface Finishing', 'Related Processes & Quality'];
            var groups = {}, seen = [];
            blog.forEach(function (it) {
                var c = (it.category && String(it.category).trim()) || 'Other';
                if (!groups[c]) { groups[c] = []; seen.push(c); }
                groups[c].push(it);
            });
            var cats = order.filter(function (c) { return groups[c]; })
                .concat(seen.filter(function (c) { return order.indexOf(c) < 0; }));
            cats.forEach(function (c) {
                var ch = el('h3', 'blog-cat-title'); ch.textContent = c; host.appendChild(ch);
                host.appendChild(listOf(groups[c]));
            });
        }
    }

    function injectArticleSchema(item) {
        try {
            var data = {
                "@context": "https://schema.org",
                "@type": "Article",
                "headline": item.title || "",
                "datePublished": item.published_at || undefined,
                "author": { "@type": "Organization", "name": "WFX Wanfuxin" },
                "publisher": {
                    "@type": "Organization", "name": "WFX Wanfuxin",
                    "logo": { "@type": "ImageObject", "url": "https://wanfuxin-dg.com/images/logo.png" }
                },
                "mainEntityOfPage": window.location.href
            };
            if (item.image_url) data.image = item.image_url;
            if (item.excerpt) data.description = item.excerpt;
            var sc = document.createElement('script');
            sc.type = 'application/ld+json';
            sc.setAttribute('data-blog-article', '1');
            sc.textContent = JSON.stringify(data);
            document.head.appendChild(sc);
        } catch (e) {}
    }
    function renderDetail(host, item) {
        host.innerHTML = '';
        injectArticleSchema(item);
        var back = el('a', 'blog-back'); back.setAttribute('href', 'blog.html');
        back.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i> All articles';
        host.appendChild(back);
        var art = el('article', 'blog-detail');
        if (item.category) { var c = el('span', 'blog-detail-cat'); c.textContent = item.category; art.appendChild(c); }
        var h = el('h1', 'blog-detail-title'); h.textContent = item.title || ''; art.appendChild(h);
        var meta = el('div', 'blog-detail-meta');
        meta.textContent = [fmtDate(item.published_at), item.author].filter(Boolean).join('  ·  ');
        art.appendChild(meta);
        if (item.image_url) {
            var img = el('img', 'blog-detail-img'); img.setAttribute('src', _absImg(item.image_url));
            img.setAttribute('alt', item.title || ''); art.appendChild(img);
        }
        var bodyDiv = el('div', 'blog-detail-body');
        var content = item.content || item.excerpt || '';
        String(content).split(/\n{2,}/).forEach(function (par) {
            var t = par.replace(/\r/g, '').trim(); if (!t) return;
            var p = el('p');
            t.split(/\n/).forEach(function (line, i) { if (i) p.appendChild(document.createElement('br')); p.appendChild(document.createTextNode(line)); });
            bodyDiv.appendChild(p);
        });
        art.appendChild(bodyDiv);
        var cta = el('div', 'blog-detail-cta');
        var btn = el('a', 'btn btn-primary'); btn.setAttribute('href', 'contact.html');
        btn.textContent = 'Contact Us for Details'; cta.appendChild(btn);
        art.appendChild(cta);
        host.appendChild(art);
    }

    function boot() {
        var cms = window.__WFX_CMS__; if (!cms) return;
        var host = document.getElementById('blog-dynamic');
        var fb = document.getElementById('blog-fallback');
        if (!host) return;
        var news = published(cms.news), blog = published(cms.blog);
        if (!news.length && !blog.length) return;     // no CMS data → keep static fallback
        if (fb) fb.style.display = 'none';
        var slug = param('post');
        if (slug) {
            var item = news.concat(blog).filter(function (x) { return x.slug === slug; })[0];
            if (item) { renderDetail(host, item); return; }
        }
        renderList(host, news, blog);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { try { boot(); } catch (e) {} });
    else { try { boot(); } catch (e) {} }
})();
