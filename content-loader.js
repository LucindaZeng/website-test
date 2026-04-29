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
                        pageContent.index.companyVideo.posterUrl = 'company-video-poster.jpg';
                        localStorage.setItem('wfx_page_content', JSON.stringify(pageContent));
                    }
                }
                // 2. Clean wfx_homepage_media (used by loadHomepageMedia in script.js)
                const homepageMedia = JSON.parse(localStorage.getItem('wfx_homepage_media') || 'null');
                if (homepageMedia && homepageMedia.companyVideoPoster) {
                    if (homepageMedia.companyVideoPoster.includes('1565193566173-7a0ee3dbe261') ||
                        homepageMedia.companyVideoPoster.includes('1581094271901-8022df4466f9')) {
                        homepageMedia.companyVideoPoster = 'company-video-poster.jpg';
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
            
            if (featuresEl && process.features) {
                featuresEl.innerHTML = process.features.map(f => 
                    `<li><i class="fas fa-check"></i> ${f}</li>`
                ).join('');
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
