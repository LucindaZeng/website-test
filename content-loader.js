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

function _categoryLabel(value) {
    if (!value) return '';
    var categories = window.__WFX_CMS__ && window.__WFX_CMS__.categories;
    var newsCategories = categories && Array.isArray(categories.news) ? categories.news : [];
    var match = newsCategories.find(function (category) {
        return category && (category.slug === value || category.name === value);
    });
    if (match && match.name) return match.name;
    var defaults = {
        'cnc-processes': 'CNC Processes & Machines',
        'materials': 'Materials Knowledge Hub',
        'drawings-dfm': 'Engineering Drawings & DFM',
        'surface-finishing': 'Surface Finishing',
        'related-processes': 'Related Processes & Quality'
    };
    return defaults[value] || value;
}

var _markedLoader = null;

function _loadMarked() {
    if (window.marked) return Promise.resolve(window.marked);
    if (_markedLoader) return _markedLoader;
    _markedLoader = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js';
        script.crossOrigin = 'anonymous';
        script.onload = function () {
            if (window.marked) resolve(window.marked);
            else reject(new Error('Markdown parser did not initialize'));
        };
        script.onerror = function () { reject(new Error('Could not load Markdown parser')); };
        document.head.appendChild(script);
    });
    return _markedLoader;
}

function _sanitizeArticleHtml(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(String(html || ''), 'text/html');
    var allowed = new Set([
        'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'INS',
        'SUB', 'SUP', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL',
        'LI', 'A', 'IMG', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD',
        'TBODY', 'TR', 'TH', 'TD', 'HR'
    ]);
    var blocked = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'LINK', 'META']);

    Array.from(doc.body.querySelectorAll('*')).forEach(function (element) {
        if (blocked.has(element.tagName)) {
            element.remove();
            return;
        }
        if (!allowed.has(element.tagName)) {
            element.replaceWith.apply(element, Array.from(element.childNodes));
            return;
        }

        var keep = {
            A: new Set(['href', 'title', 'target']),
            IMG: new Set(['src', 'alt', 'title', 'width', 'height']),
            TH: new Set(['scope'])
        }[element.tagName] || new Set();
        Array.from(element.attributes).forEach(function (attribute) {
            if (!keep.has(attribute.name.toLowerCase())) element.removeAttribute(attribute.name);
        });

        if (element.tagName === 'A') {
            var href = element.getAttribute('href') || '';
            if (/^\s*(javascript|data|vbscript|file):/i.test(href)) element.removeAttribute('href');
            if (element.getAttribute('target') === '_blank') {
                element.setAttribute('rel', 'noopener noreferrer');
            }
        }
        if (element.tagName === 'IMG') {
            var src = element.getAttribute('src') || '';
            if (/^\s*(javascript|data|vbscript|file):/i.test(src)) element.removeAttribute('src');
        }
    });
    return doc.body.innerHTML;
}

async function _renderMarkdownSafe(markdown) {
    var marked = await _loadMarked();
    var html = marked.parse(String(markdown || ''), { gfm: true, breaks: false });
    return _sanitizeArticleHtml(html);
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
            'hero.badge': '.hero-badge span',
            'hero.title': '.hero-title',
            'hero.subtitle': '.hero-title .gradient-text',
            'hero.description': '.hero-description',
            'hero.videoUrl': '.hero-video source',
            'hero.primaryButtonText': '.hero-actions .btn-primary',
            'hero.secondaryButtonText': '.hero-actions .btn-secondary-light',
            'trustedBy.label': '.trusted-by-label',
            'services.sectionTitle': '#services .section-title',
            'services.sectionDescription': '#services .section-description',
            'services.ctaText': '.services-cta p',
            'quote.title': '#quote h2',
            'quote.description': '#quote > .container > .quote-wrapper > .quote-content > p',
            'whyChoose.title': '.features-section .section-title, .why-choose .section-title',
            'whyChoose.description': '.features-section .section-description, .why-choose .section-description',
            'companyVideo.title': '.factory-tour .section-title',
            'companyVideo.description': '.factory-tour .section-description'
        },
        about: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero p',
            'intro.title': '.about-intro h2, .about-intro-content h2',
            'intro.content': '.about-intro-content > p:first-of-type'
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
            'hero.description': '.page-hero p',
            'intro.title': '.contact-info h2'
        },
        services: {
            'hero.title': '.page-hero h1',
            'hero.description': '.page-hero > .container > p',
            'cta.description': 'section[style*="text-align: center"] > .container > p'
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
            'services': 'services'
        };
        
        return pageMap[filename] || null;
    },

    // Load and apply content to page
    loadPageContent: function() {
        const allContent = this.getContent();
        if (!allContent) return;

        this.applyGlobalContent(allContent);

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

    applyGlobalContent: function(allContent) {
        const contact = allContent && allContent.index && allContent.index.contact;
        if (!contact) return;

        const replaceTextPreservingIcon = (element, value) => {
            const icon = element.querySelector('i, svg');
            if (!icon) {
                element.textContent = value;
                return;
            }
            Array.from(element.childNodes).forEach(node => {
                if (node !== icon && node.nodeType === Node.TEXT_NODE) node.remove();
            });
            element.appendChild(document.createTextNode(' ' + value));
        };

        if (contact.phone) {
            const phoneHref = 'tel:' + String(contact.phone).replace(/[^\d+]/g, '');
            document.querySelectorAll('a[href^="tel:"]').forEach(link => {
                link.href = phoneHref;
                if (link.querySelector('i, svg')) {
                    link.setAttribute('aria-label', 'Call ' + contact.phone);
                } else {
                    link.textContent = contact.phone;
                }
            });
            document.querySelectorAll('.top-bar-left span').forEach(item => {
                if (item.querySelector('.fa-phone')) replaceTextPreservingIcon(item, contact.phone);
            });
        }
        if (contact.email) {
            document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
                link.href = 'mailto:' + contact.email;
                if (link.querySelector('i, svg')) {
                    link.setAttribute('aria-label', 'Email ' + contact.email);
                } else {
                    link.textContent = contact.email;
                }
            });
            document.querySelectorAll('.top-bar-left span').forEach(item => {
                if (item.querySelector('.fa-envelope')) replaceTextPreservingIcon(item, contact.email);
            });
        }
        if (contact.address) {
            document.querySelectorAll('.footer-contact address > p:first-child').forEach(paragraph => {
                const icon = paragraph.querySelector('i');
                paragraph.textContent = '';
                if (icon) paragraph.appendChild(icon);
                paragraph.appendChild(document.createTextNode(' ' + contact.address));
            });
        }
        if (contact.hours) {
            document.querySelectorAll('.footer-hours .hours-list').forEach(list => {
                const item = document.createElement('li');
                item.textContent = contact.hours;
                list.textContent = '';
                list.appendChild(item);
            });
        }
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
            const videoSection = document.querySelector('.factory-tour');
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

/* Apply global settings that are managed in Admin > Settings. Page-specific
   titles stay in the HTML; the global description and keywords apply only to
   the homepage so they do not overwrite stronger per-page SEO metadata. */
(function () {
    'use strict';

    function setMeta(selector, value) {
        if (!value) return;
        var element = document.querySelector(selector);
        if (element) element.setAttribute('content', value);
    }

    function boot() {
        var settings = window.__WFX_CMS__ && window.__WFX_CMS__.site_settings;
        if (!settings || typeof settings !== 'object') {
            try {
                settings = JSON.parse(localStorage.getItem('wfx_site_settings') || '{}');
            } catch (e) {
                settings = {};
            }
        }

        setMeta('meta[property="og:site_name"]', settings.siteName);

        if (settings.siteUrl) {
            var base = String(settings.siteUrl).replace(/\/+$/, '');
            var pathname = window.location.pathname;
            var canonicalUrl = base + (pathname === '/index.html' ? '/' : pathname);
            var canonical = document.querySelector('link[rel="canonical"]');
            if (canonical) canonical.setAttribute('href', canonicalUrl);
            setMeta('meta[property="og:url"]', canonicalUrl);
        }

        var page = (window.location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
        if (page === 'index') {
            setMeta('meta[name="description"]', settings.siteDescription);
            setMeta('meta[property="og:description"]', settings.siteDescription);
            setMeta('meta[name="twitter:description"]', settings.siteDescription);
            setMeta('meta[name="keywords"]', settings.siteKeywords);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

/* Apply server-managed images to their real public-page locations. Page Images
   stores only URL overrides; these selectors remain the source of truth for
   where each image is used. */
(function () {
    'use strict';

    var TARGETS = {
        index: {
            'hero-poster': { selector: '#hero-video', type: 'background' },
            'service-milling': { selector: '.service-card[data-service="cnc-milling"] img' },
            'service-turning': { selector: '.service-card[data-service="cnc-turning"] img' },
            'service-5axis': { selector: '.service-card[data-service="5-axis"] img' },
            'service-inspection': { selector: '.service-card[data-service="precision-inspection"] img' },
            'industry-aerospace': { selector: '.industry-card[data-industry="aerospace"] img' },
            'industry-liquid-cooling': { selector: '.industry-card[data-industry="liquid-cooling"] img' },
            'industry-medical': { selector: '.industry-card[data-industry="medical"] img' },
            'industry-electronics': { selector: '.industry-card[data-industry="electronics"] img' },
            'industry-robotics': { selector: '.industry-card[data-industry="robotics"] img' },
            'industry-industrial': { selector: '.industry-card[data-industry="industrial"] img' },
            'news-1': { selector: '.news-grid .news-card:nth-child(1) img' },
            'news-2': { selector: '.news-grid .news-card:nth-child(2) img' },
            'news-3': { selector: '.news-grid .news-card:nth-child(3) img' }
        },
        about: {
            'tour-poster': { selector: '.vr-facade', type: 'background' }
        },
        'cnc-milling': {
            'hero': { selector: '.page-hero-image img' },
            'gallery-1': { selector: '.gallery-item:nth-child(1) img' },
            'gallery-2': { selector: '.gallery-item:nth-child(2) img' },
            'gallery-3': { selector: '.gallery-item:nth-child(3) img' },
            'gallery-4': { selector: '.gallery-item:nth-child(4) img' }
        },
        industries: {
            'aerospace': { selector: '.industry-card:nth-child(1) img' },
            'liquid-cooling': { selector: '.industry-card:nth-child(2) img' },
            'medical': { selector: '.industry-card:nth-child(3) img' },
            'electronics': { selector: '.industry-card:nth-child(4) img' },
            'industrial': { selector: '.industry-card:nth-child(5) img' },
            'robotics': { selector: '.industry-card:nth-child(6) img' }
        },
        contact: {
            'facility-1': { selector: '.location-card:nth-child(1) img' },
            'facility-2': { selector: '.location-card:nth-child(2) img' },
            'facility-3': { selector: '.location-card:nth-child(3) img' }
        },
        resources: {
            'featured': { selector: 'img[src*="CNC_Milling_800x600"]' }
        },
        blog: {
            'fallback-1': { selector: '#blog-fallback article:nth-child(1) img' },
            'fallback-2': { selector: '#blog-fallback article:nth-child(2) img' },
            'fallback-3': { selector: '#blog-fallback article:nth-child(3) img' },
            'fallback-4': { selector: '#blog-fallback article:nth-child(4) img' },
            'fallback-5': { selector: '#blog-fallback article:nth-child(5) img' },
            'fallback-6': { selector: '#blog-fallback article:nth-child(6) img' }
        }
    };

    function pageName() {
        return (window.location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    }

    function apply(data) {
        var page = pageName();
        var values = data && data[page];
        var targets = TARGETS[page];
        if (!values || !targets) return;
        Object.keys(values).forEach(function (key) {
            var target = targets[key];
            var url = _absImg(values[key]);
            if (!target || !url) return;
            document.querySelectorAll(target.selector).forEach(function (element) {
                if (target.type === 'background') {
                    element.style.backgroundImage = "url('" + String(url).replace(/'/g, "%27") + "')";
                    element.dataset.posterImage = url;
                } else if (element.tagName === 'IMG') {
                    element.src = url;
                }
            });
        });
    }

    var currentData = null;
    window.WFX_applyManagedPageImages = function () {
        if (currentData) apply(currentData);
    };

    function boot() {
        var injected = window.__WFX_CMS__ && window.__WFX_CMS__.page_images;
        if (injected && Object.keys(injected).length) {
            currentData = injected;
            apply(injected);
            return;
        }
        fetch('/api/cms/content/page_images')
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (result) {
                if (result && result.ok && result.value) {
                    currentData = result.value;
                    apply(result.value);
                }
            })
            .catch(function () {});
    }

    document.addEventListener('wfxCollectionsRendered', function () {
        window.WFX_applyManagedPageImages();
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

/* Keep the company-video assignment in the Video Manager effective for both
   YouTube embeds and uploaded MP4/WebM files. */
(function () {
    'use strict';

    function youtubeEmbed(url) {
        var match = String(url || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/))([^?&/]+)/i);
        return match ? 'https://www.youtube-nocookie.com/embed/' + match[1] + '?rel=0&modestbranding=1' : '';
    }

    function boot() {
        var page = (window.location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
        if (page !== 'index') return;
        var pageContent = window.__WFX_CMS__ && window.__WFX_CMS__.page_content;
        var config = pageContent && pageContent.index && pageContent.index.companyVideo;
        var wrap = document.querySelector('.youtube-embed-wrap');
        if (!config || !config.videoUrl || !wrap) return;
        var embed = youtubeEmbed(config.videoUrl);
        if (embed) {
            var frame = wrap.querySelector('iframe');
            if (frame) frame.src = embed;
            return;
        }
        var video = document.createElement('video');
        video.controls = true;
        video.preload = 'metadata';
        video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
        video.src = _absImg(config.videoUrl);
        if (config.posterUrl) video.poster = _absImg(config.posterUrl);
        wrap.innerHTML = '';
        wrap.appendChild(video);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();


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

                var pageCollections = data[page];
                if (!pageCollections || !Object.prototype.hasOwnProperty.call(pageCollections, collection)) return;
                var items = pageCollections[collection];
                if (!Array.isArray(items)) return;
                var tpl = container.querySelector('template[data-cms-item]');
                if (!tpl || !tpl.content || !tpl.content.firstElementChild) return;
                if (items.length === 0) {
                    Array.prototype.slice.call(container.children).forEach(function (child) {
                        if (child.tagName !== 'TEMPLATE') child.remove();
                    });
                    container.hidden = true;
                    return;
                }

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
        try { document.dispatchEvent(new CustomEvent('wfxCollectionsRendered')); } catch (e) {}
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
            cat.textContent = _categoryLabel(item.category);
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
        link.setAttribute('href', item.slug ? ('blog.html?post=' + encodeURIComponent(item.slug)) : 'blog.html');
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
        if (typeof window.WFX_applyManagedPageImages === 'function') {
            window.WFX_applyManagedPageImages();
        }
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
        if (item.category) { var c = el('span', 'blog-list-cat'); c.textContent = _categoryLabel(item.category); meta.appendChild(c); }
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
                var c = _categoryLabel(it.category) || 'Other';
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
                    "logo": { "@type": "ImageObject", "url": "https://wanfuxin-dg.com/images/logo/logo.webp" }
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
    async function renderDetail(host, item) {
        host.innerHTML = '';
        injectArticleSchema(item);
        var back = el('a', 'blog-back'); back.setAttribute('href', 'blog.html');
        back.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i> All articles';
        host.appendChild(back);
        var art = el('article', 'blog-detail');
        if (item.category) { var c = el('span', 'blog-detail-cat'); c.textContent = _categoryLabel(item.category); art.appendChild(c); }
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
        try {
            bodyDiv.innerHTML = await _renderMarkdownSafe(String(content));
        } catch (e) {
            String(content).split(/\n{2,}/).forEach(function (par) {
                var t = par.replace(/\r/g, '').trim(); if (!t) return;
                var p = el('p');
                t.split(/\n/).forEach(function (line, i) {
                    if (i) p.appendChild(document.createElement('br'));
                    p.appendChild(document.createTextNode(line));
                });
                bodyDiv.appendChild(p);
            });
        }
        art.appendChild(bodyDiv);
        var cta = el('div', 'blog-detail-cta');
        var btn = el('a', 'btn btn-primary'); btn.setAttribute('href', 'contact.html');
        btn.textContent = 'Contact Us for Details'; cta.appendChild(btn);
        art.appendChild(cta);
        host.appendChild(art);
    }

    async function boot() {
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
            if (item) { await renderDetail(host, item); return; }
        }
        renderList(host, news, blog);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { boot().catch(function () {}); });
    } else {
        boot().catch(function () {});
    }
})();
