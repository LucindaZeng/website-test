/* ==========================================
   WFX - Main JavaScript
   ========================================== */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initHeroVideo();        // must run early — affects LCP
    initFaqAccordion();
    initCustomLogos();
    initHeader();
    initMobileMenu();
    initMaterialTabs();
    initUploadZone();
    initTestimonialSlider();
    initScrollAnimations();
    initBackToTop();
    initQuoteForm();
    initSmoothScroll();
    initContactForm();
    initLazyLoading();
});

/* ==========================================
   Hero Video — Mobile-aware conditional loading
   ==========================================
   On desktop (width > 768px): inject <source> and autoplay.
   On mobile: leave the <video> empty so only the poster image displays.
   Saves ~1.4 MB of cellular data per first visit.
*/
function initHeroVideo() {
    const container = document.getElementById('hero-video');
    if (!container) return;

    function shouldPlayVideo() {
        // 1. Viewport width — mobile sees the poster only
        if (window.innerWidth <= 768) return false;
        // 2. Save-Data hint
        if (navigator.connection && navigator.connection.saveData) return false;
        // 3. Slow connection
        if (navigator.connection && ['slow-2g', '2g'].includes(navigator.connection.effectiveType)) return false;
        // 4. Reduced-motion preference
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        return true;
    }

    function activateVideo() {
        // Idempotent — don't inject the <video> twice
        if (container.querySelector('video')) return;
        const src = container.getAttribute('data-video-webm');
        if (!src) return;
        const video = document.createElement('video');
        video.muted = true;          // required for autoplay
        video.defaultMuted = true;
        video.autoplay = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.poster = '/images/hero-video-poster.jpg';
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('aria-hidden', 'true');
        video.setAttribute('tabindex', '-1');
        const source = document.createElement('source');
        source.src = src;
        source.type = 'video/webm';
        video.appendChild(source);
        container.appendChild(video);
        const p = video.play();
        if (p && typeof p.catch === 'function') {
            p.catch(function () { /* autoplay blocked → poster image stays visible */ });
        }
    }

    if (shouldPlayVideo()) {
        // Defer slightly so the LCP element (hero text) paints first
        if ('requestIdleCallback' in window) {
            requestIdleCallback(activateVideo, { timeout: 800 });
        } else {
            setTimeout(activateVideo, 200);
        }
    }
    // On mobile / save-data / reduced-motion: do nothing — the poster (CSS background) is the visual.

    // If the user resizes from mobile → desktop later, activate then
    window.addEventListener('resize', function () {
        if (shouldPlayVideo() && !container.querySelector('video')) {
            activateVideo();
        }
    });
}

/* ==========================================
   Custom Logo Loading from Admin
   ========================================== */
function initCustomLogos() {
    // Prefer the server-side branding (window.__WFX_CMS__.branding) so the logo
    // set in Admin shows for ALL visitors. Fall back to the legacy localStorage
    // value (admin's own browser only), then to the default images/logo.png.
    const branding = (window.__WFX_CMS__ && window.__WFX_CMS__.branding) || {};
    const mainLogo = branding.logo_url || localStorage.getItem('wfx_custom_logo');
    const footerLogo = branding.footer_logo_url || mainLogo;

    if (mainLogo) {
        document.querySelectorAll('a.logo .logo-img, a.logo img').forEach(img => {
            if (img.src.includes('/images/logo.png') || img.classList.contains('logo-img')) {
                img.src = mainLogo;
            }
        });
    }
    if (footerLogo) {
        document.querySelectorAll('.footer-logo .logo-img, .footer-logo img').forEach(img => {
            img.src = footerLogo;
        });
    }

    // Favicon (server branding first, then legacy localStorage)
    const customFavicon = branding.favicon_url || localStorage.getItem('wfx_custom_favicon');
    if (customFavicon) {
        document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
            link.href = customFavicon;
        });
    }
}

/* ==========================================
   Header Scroll Effect
   ========================================== */
function initHeader() {
    const header = document.getElementById('header');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        // Add scrolled class for shadow
        if (currentScroll > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        // Hide/show header on scroll
        if (currentScroll > lastScroll && currentScroll > 200) {
            header.style.transform = 'translateY(-100%)';
        } else {
            header.style.transform = 'translateY(0)';
        }

        lastScroll = currentScroll;
    });
}

/* ==========================================
   Mobile Menu Toggle
   ========================================== */
function initMobileMenu() {
    const mobileToggle = document.getElementById('mobile-toggle');
    const navMenu = document.getElementById('nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            mobileToggle.classList.toggle('active');
            document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
        });
    }

    // Mobile mega-menu / dropdown — tap parent link to expand instead of navigate.
    // On desktop, hover handles this; on touch devices, hover doesn't exist.
    document.querySelectorAll('.nav-item').forEach(item => {
        const subMenu = item.querySelector('.dropdown-menu, .mega-menu');
        const parentLink = item.querySelector('.nav-link');
        if (!subMenu || !parentLink) return;

        parentLink.addEventListener('click', (e) => {
            // Only intercept on mobile breakpoint
            if (window.innerWidth > 768) return;
            // First tap → expand the submenu (don't navigate yet)
            // Second tap on same item → navigate to parent's href
            if (!item.classList.contains('mobile-open')) {
                e.preventDefault();
                // Close any other open submenus
                document.querySelectorAll('.nav-item.mobile-open').forEach(other => {
                    if (other !== item) other.classList.remove('mobile-open');
                });
                item.classList.add('mobile-open');
                parentLink.setAttribute('aria-expanded', 'true');
            }
            // If already open, fall through and let default link navigation happen
        });
        // Mark this link as a disclosure widget for screen readers
        parentLink.setAttribute('aria-expanded', 'false');
        parentLink.setAttribute('aria-haspopup', 'true');
    });

    // Close menu when clicking a sublink (mobile)
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Only close the whole menu if it's a leaf link (no sub-menu children)
            const parentItem = link.closest('.nav-item');
            const hasSubMenu = parentItem && parentItem.querySelector('.dropdown-menu, .mega-menu');
            if (window.innerWidth <= 768 && !hasSubMenu) {
                navMenu.classList.remove('active');
                mobileToggle.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // Reset mobile-open state when window resizes back to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            document.querySelectorAll('.nav-item.mobile-open').forEach(item => {
                item.classList.remove('mobile-open');
                const link = item.querySelector('.nav-link');
                if (link) link.setAttribute('aria-expanded', 'false');
            });
        }
    });

    // Close menu on window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            navMenu.classList.remove('active');
            mobileToggle.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
}

/* ==========================================
   Material Tabs
   ========================================== */
function initMaterialTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

/* ==========================================
   File Upload Zone
   ========================================== */
function initUploadZone() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('cad-file');

    if (!uploadZone || !fileInput) return;

    // Click to upload
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

    // Drag and drop events
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

function handleFileUpload(file) {
    const uploadZone = document.getElementById('upload-zone');
    const validExtensions = ['.step', '.stp', '.iges', '.igs', '.stl', '.sldprt', '.x_t', '.sat', '.dwg', '.dxf', '.pdf', '.zip', '.rar'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
        showNotification('Please upload a valid CAD file format', 'error');
        return;
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB limit
        showNotification('File size exceeds 100MB limit', 'error');
        return;
    }

    // Update upload zone UI
    uploadZone.innerHTML = `
        <i class="fas fa-check-circle" style="color: #00875A;"></i>
        <h3>File Uploaded Successfully</h3>
        <p>${file.name.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        <span class="upload-hint">${formatFileSize(file.size)}</span>
    `;

    showNotification('File uploaded successfully!', 'success');

    // Reveal optional specs after file upload to reduce initial form complexity.
    if (typeof showSpecsSection === 'function') {
        showSpecsSection();
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/* ==========================================
   Notification System
   ========================================== */
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;

    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#00875A' : type === 'error' ? '#dc2626' : '#0052CC'};
        color: white;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add notification animations to head
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(notificationStyles);

/* ==========================================
   Testimonial Slider
   ========================================== */
function initTestimonialSlider() {
    const slider = document.querySelector('.testimonials-slider');
    const cards = document.querySelectorAll('.testimonial-card');
    const prevBtn = document.querySelector('.testimonial-nav .prev');
    const nextBtn = document.querySelector('.testimonial-nav .next');
    const dots = document.querySelectorAll('.testimonial-nav .dot');
    
    if (!slider || cards.length === 0) return;

    // Guard against double-binding when the CMS loader rebuilds cards and
    // re-invokes this. Clear any prior auto-advance timer + nav handlers.
    if (slider._wfxSliderInit) {
        if (slider._wfxAutoAdvance) clearInterval(slider._wfxAutoAdvance);
        if (slider._wfxPrev && prevBtn) prevBtn.removeEventListener('click', slider._wfxPrev);
        if (slider._wfxNext && nextBtn) nextBtn.removeEventListener('click', slider._wfxNext);
    }
    slider._wfxSliderInit = true;

    let currentSlide = 0;
    const totalSlides = cards.length;

    function updateSlider() {
        if (window.innerWidth <= 768) {
            slider.style.transform = `translateX(-${currentSlide * 100}%)`;
        } else if (window.innerWidth <= 1024) {
            slider.style.transform = `translateX(-${currentSlide * 50}%)`;
        } else {
            slider.style.transform = `translateX(-${currentSlide * 33.333}%)`;
        }

        // Update dots
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentSlide);
        });
    }

    function nextSlide() {
        currentSlide = (currentSlide + 1) % totalSlides;
        updateSlider();
    }

    function prevSlide() {
        currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
        updateSlider();
    }

    if (prevBtn) prevBtn.addEventListener('click', prevSlide);
    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    slider._wfxPrev = prevSlide;
    slider._wfxNext = nextSlide;

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentSlide = index;
            updateSlider();
        });
    });

    // Auto-advance slider
    slider._wfxAutoAdvance = setInterval(nextSlide, 5000);

    // Update on window resize
    window.addEventListener('resize', updateSlider);
}
// Exposed so the CMS testimonials loader can re-init after rebuilding cards
window.initTestimonialSlider = initTestimonialSlider;

/* ==========================================
   Scroll Animations
   ========================================== */
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        '.service-card, .industry-card, .material-card, .news-card, .feature-item, .stat-card, .process-step'
    );

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    animatedElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        observer.observe(el);
    });
}

/* ==========================================
   Back to Top Button
   ========================================== */
function initBackToTop() {
    const backToTopBtn = document.getElementById('back-to-top');
    
    if (!backToTopBtn) return;

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 500) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

/* ==========================================
   Quote Form Handling
   ========================================== */
function initQuoteForm() {
    const quoteForm = document.getElementById('quote-form');
    
    if (!quoteForm) return;

    quoteForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get form data (use FormData directly so we keep the file)
        const formData = new FormData(quoteForm);
        const fileInput = document.getElementById('cad-file');

        // Validate fields. UI promises material / quantity / file are optional;
        // we honor that here. Only email is strictly required because the engineer
        // needs a way to reply with the quote.
        if (!formData.get('email')) {
            const email = prompt('Please enter your email so we can reply to your quote:');
            if (!email) {
                showNotification('Email is required so we can send you a quote', 'error');
                return;
            }
            formData.set('email', email);
        }
        // Basic sanity check on quantity if provided
        const qtyRaw = formData.get('quantity');
        if (qtyRaw) {
            const qty = parseInt(qtyRaw, 10);
            if (!qty || qty < 1) {
                showNotification('If you specify a quantity, it must be a positive number', 'error');
                return;
            }
        }

        const submitBtn = quoteForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/quote', {
                method: 'POST',
                body: formData
                // Don't set Content-Type — browser sets multipart boundary automatically
            });

            const result = await response.json().catch(() => ({}));

            if (response.ok && result.ok) {
                showNotification(
                    `Quote request #${result.id} received! Our team will contact you within 24 hours.`,
                    'success'
                );
                quoteForm.reset();
                // Reset upload zone visual
                const uploadZone = document.getElementById('upload-zone');
                if (uploadZone) {
                    uploadZone.innerHTML = `
                        <i class="fas fa-cloud-upload-alt"></i>
                        <h3>Drag & Drop Your CAD File</h3>
                        <p>or click to browse</p>
                        <span class="upload-hint">Max file size: 100MB</span>
                    `;
                }
            } else if (response.status === 503) {
                // DB not configured — fall back to mailto so leads aren't lost
                fallbackToMailto(formData);
            } else {
                showNotification(
                    'Submission failed: ' + (result.error || 'Server error') +
                    '. Please email us at lucindaz@wanfuxin.com',
                    'error'
                );
            }
        } catch (err) {
            console.error('Quote submission error:', err);
            // Network error — fall back to mailto
            fallbackToMailto(formData);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

function fallbackToMailto(formData) {
    let body = 'New Quote Request from WFX Website%0A%0A';
    for (const [key, value] of formData.entries()) {
        if (value && key !== 'cad-file') {
            body += key + ': ' + encodeURIComponent(value) + '%0A';
        }
    }
    body += '%0A(Note: CAD file could not be attached automatically — please attach it to this email.)';
    window.location.href = 'mailto:lucindaz@wanfuxin.com?subject=' +
        encodeURIComponent('Quote Request from Website') + '&body=' + body;
    showNotification(
        'Server unavailable — your email client has been opened. Please attach your CAD file and send.',
        'success'
    );
}

/* ==========================================
   Smooth Scrolling
   ========================================== */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                e.preventDefault();
                
                const headerHeight = document.getElementById('header').offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/* ==========================================
   Counter Animation
   ========================================== */
function animateCounter(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        element.textContent = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

/* ==========================================
   Lazy Loading Images
   ========================================== */
function initLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                observer.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

/* ==========================================
   Dropdown Menu for Mobile
   ========================================== */
document.querySelectorAll('.nav-item.dropdown').forEach(item => {
    const link = item.querySelector('.nav-link');
    
    link.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            e.preventDefault();
            const dropdown = item.querySelector('.dropdown-menu, .mega-menu');
            
            if (dropdown) {
                const isVisible = dropdown.style.display === 'block';
                
                // Close all dropdowns first
                document.querySelectorAll('.dropdown-menu, .mega-menu').forEach(d => {
                    d.style.display = 'none';
                });
                
                // Toggle current dropdown
                dropdown.style.display = isVisible ? 'none' : 'block';
            }
        }
    });
});

/* ==========================================
   Form Input Animations
   ========================================== */
document.querySelectorAll('.form-group input, .form-group select, .form-group textarea').forEach(input => {
    input.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
    });
    
    input.addEventListener('blur', function() {
        this.parentElement.classList.remove('focused');
        if (this.value) {
            this.parentElement.classList.add('filled');
        } else {
            this.parentElement.classList.remove('filled');
        }
    });
});

/* ==========================================
   Parallax Effect for Hero
   ========================================== */
window.addEventListener('scroll', () => {
    const hero = document.querySelector('.hero');
    if (hero) {
        const scrolled = window.pageYOffset;
        const heroContent = hero.querySelector('.hero-content');
        if (heroContent) {
            heroContent.style.transform = `translateY(${scrolled * 0.3}px)`;
            heroContent.style.opacity = 1 - (scrolled * 0.002);
        }
    }
});

/* ==========================================
   Loading State
   ========================================== */
window.addEventListener('load', () => {
    document.body.classList.add('loaded');
    
    // Trigger initial animations
    setTimeout(() => {
        document.querySelectorAll('.hero-content > *').forEach((el, index) => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });
    }, 100);
});

/* ==========================================
   Keyboard Navigation
   ========================================== */
document.addEventListener('keydown', (e) => {
    // Close mobile menu on Escape
    if (e.key === 'Escape') {
        const navMenu = document.getElementById('nav-menu');
        const mobileToggle = document.getElementById('mobile-toggle');
        
        if (navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            mobileToggle.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
});

/* ==========================================
   Touch Events for Mobile
   ========================================== */
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
});

document.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
});

function handleSwipe() {
    const slider = document.querySelector('.testimonials-slider');
    if (!slider) return;
    
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // Swipe left - next slide
            document.querySelector('.testimonial-nav .next')?.click();
        } else {
            // Swipe right - previous slide
            document.querySelector('.testimonial-nav .prev')?.click();
        }
    }
}

/* ==========================================
   Console Welcome Message
   ========================================== */
console.log(
    '%c🔧 WFX Website',
    'color: #0052CC; font-size: 20px; font-weight: bold;'
);
console.log(
    '%cWFX - Precision CNC Machining Services',
    'color: #00875A; font-size: 14px;'
);
console.log(
    'For support, contact: lucindaz@wanfuxin.com'
);

/* ==========================================
   Homepage Media Configuration Loader
   ========================================== */
function loadHomepageMedia() {
    // Default media configuration
    const defaultMedia = {
        heroVideo: 'hero-video.mp4',
        companyVideo: 'company-video.mp4',
        companyVideoPoster: '/images/company-video-poster.jpg',
        services: {
            cncMilling: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=300&fit=crop',
            cncTurning: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=400&h=300&fit=crop',
            fiveAxis: 'https://images.unsplash.com/photo-1581091226817-a6a2a5aee158?w=400&h=300&fit=crop',
            precisionInspection: 'https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?w=400&h=300&fit=crop'
        },
        industries: {
            aerospace: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=300&fit=crop',
            automotive: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400&h=300&fit=crop',
            medical: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=300&fit=crop',
            electronics: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=300&fit=crop',
            robotics: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=400&h=300&fit=crop',
            industrial: 'https://images.unsplash.com/photo-1581091226817-a6a2a5aee158?w=400&h=300&fit=crop'
        }
    };

    // Try to load from localStorage
    let media = defaultMedia;
    try {
        const stored = localStorage.getItem('wfx_homepage_media');
        if (stored) {
            media = JSON.parse(stored);
            // Migration: if stored config has the OLD stale vase URL as the company
            // video poster, replace it with the new local poster file
            if (media.companyVideoPoster &&
                (media.companyVideoPoster.includes('1565193566173-7a0ee3dbe261') ||
                 media.companyVideoPoster.includes('1581094271901-8022df4466f9'))) {
                media.companyVideoPoster = '/images/company-video-poster.jpg';
                localStorage.setItem('wfx_homepage_media', JSON.stringify(media));
            }
        }
    } catch (e) {
        console.log('Using default media configuration');
    }

    // Hero background is a self-hosted WebM (see initHeroVideo). To change it,
    // replace images/hero-video-optimized.webm (and the poster), or update the
    // data-video-webm attribute on #hero-video in index.html.

    // Company video is now a YouTube embed (xOvLkmzvKwc). The CMS no longer
    // swaps a local <source>; to change it, update the iframe src in index.html.
    // The querySelector below is kept defensive — it simply finds nothing now.
    const companyVideo = document.querySelector('.video-container video');
    if (companyVideo) {
        const companySource = companyVideo.querySelector('source');
        if (companySource && media.companyVideo) {
            companySource.src = media.companyVideo;
        }
        if (media.companyVideoPoster) {
            companyVideo.poster = media.companyVideoPoster;
        }
        companyVideo.load();
    }

    // Update Services Section Images
    if (media.services) {
        const serviceImages = {
            cncMilling: document.querySelector('[data-service="cnc-milling"] img'),
            cncTurning: document.querySelector('[data-service="cnc-turning"] img'),
            fiveAxis: document.querySelector('[data-service="5-axis"] img'),
            precisionInspection: document.querySelector('[data-service="precision-inspection"] img')
        };
        
        Object.entries(serviceImages).forEach(([key, img]) => {
            if (img && media.services[key]) {
                img.src = media.services[key];
            }
        });
    }

    // Update Industries Section Images
    if (media.industries) {
        const industryImages = {
            aerospace: document.querySelector('[data-industry="aerospace"] img'),
            automotive: document.querySelector('[data-industry="automotive"] img'),
            medical: document.querySelector('[data-industry="medical"] img'),
            electronics: document.querySelector('[data-industry="electronics"] img'),
            robotics: document.querySelector('[data-industry="robotics"] img'),
            industrial: document.querySelector('[data-industry="industrial"] img')
        };
        
        Object.entries(industryImages).forEach(([key, img]) => {
            if (img && media.industries[key]) {
                img.src = media.industries[key];
            }
        });
    }
}

// Load media configuration when DOM is ready
document.addEventListener('DOMContentLoaded', loadHomepageMedia);

/* ==========================================
   Contact Form Handling
   ========================================== */
function initContactForm() {
    const contactForm = document.getElementById('contact-form');
    
    if (!contactForm) return;

    contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData);

        if (!data['first-name'] || !data.email || !data.message) {
            showNotification('Please fill in all required fields.', 'error');
            return;
        }

        const submitBtn = contactForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json().catch(() => ({}));

            if (response.ok && result.ok) {
                showNotification(
                    `Thank you! Your inquiry #${result.id} has been received. We'll respond within 1 business day.`,
                    'success'
                );
                contactForm.reset();
            } else if (response.status === 503) {
                contactFallbackToMailto(data);
            } else {
                showNotification('Failed to send: ' + (result.error || 'Server error'), 'error');
            }
        } catch (err) {
            console.error('Contact submission error:', err);
            contactFallbackToMailto(data);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

function contactFallbackToMailto(data) {
    let body = 'New Contact Form Message from WFX Website%0A%0A';
    body += 'Name: ' + encodeURIComponent((data['first-name'] || '') + ' ' + (data['last-name'] || '')) + '%0A';
    body += 'Email: ' + encodeURIComponent(data.email || '') + '%0A';
    body += 'Phone: ' + encodeURIComponent(data.phone || '') + '%0A';
    body += 'Company: ' + encodeURIComponent(data.company || '') + '%0A';
    body += 'Inquiry Type: ' + encodeURIComponent(data['inquiry-type'] || '') + '%0A';
    body += 'Message: ' + encodeURIComponent(data.message || '') + '%0A';
    const subject = encodeURIComponent('Website Inquiry: ' + (data['inquiry-type'] || 'General'));
    window.location.href = 'mailto:lucindaz@wanfuxin.com?subject=' + subject + '&body=' + body;
    showNotification(
        'Server unavailable — your email client has been opened. Please send the email.',
        'success'
    );
}

// ─── Progressive quote form (step-2 reveal) ──────────────────────────────
// Reduces friction: users see only upload + email at first; specs appear
// after they've committed to the form.
function showSpecsSection() {
    const fields = document.getElementById('step-2-fields');
    const chevron = document.getElementById('step-2-chevron');
    const button = document.getElementById('step-2-button');
    if (!fields) return;
    if (fields.style.display === 'none' || !fields.style.display) {
        fields.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
        if (button) button.setAttribute('aria-expanded', 'true');
        // Smooth scroll into view
        setTimeout(() => fields.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    }
}

function hideSpecsSection() {
    const fields = document.getElementById('step-2-fields');
    const chevron = document.getElementById('step-2-chevron');
    const button = document.getElementById('step-2-button');
    if (!fields) return;
    fields.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    if (button) button.setAttribute('aria-expanded', 'false');
}

function toggleSpecsSection() {
    const fields = document.getElementById('step-2-fields');
    if (!fields) return;
    if (fields.style.display === 'none' || !fields.style.display) {
        showSpecsSection();
    } else {
        hideSpecsSection();
    }
}

// Expose globally so inline onclick handlers can find them
window.toggleSpecsSection = toggleSpecsSection;
window.showSpecsSection = showSpecsSection;
window.hideSpecsSection = hideSpecsSection;


/* ==========================================
   720yun VR Facade — click-to-load iframe
   ==========================================
   Heavy third-party iframes (3-5 MB of JS/textures) are deferred until the
   user actually clicks the placeholder. This saves first-paint bandwidth on
   pages where most visitors never engage with the VR tour.
*/
(function initVrFacades() {
    // ─── Fallback for blocked iframe embeds ─────────────────────────────
    // If 720yun (or any embedded service) refuses to load via X-Frame-Options
    // or returns an error, show a clear "Open in new tab" link instead of
    // leaving the user staring at a broken black box.
    window.showEmbedFallback = function(facade, src) {
        facade.dataset.loaded = 'failed';
        facade.innerHTML = '';
        facade.style.background = '#0a1628';
        facade.style.display = 'flex';
        facade.style.alignItems = 'center';
        facade.style.justifyContent = 'center';
        facade.style.flexDirection = 'column';
        facade.style.color = 'white';
        facade.style.padding = '40px 20px';
        facade.style.textAlign = 'center';

        const icon = document.createElement('i');
        icon.className = 'fas fa-external-link-alt';
        icon.setAttribute('aria-hidden', 'true');
        icon.style.cssText = 'font-size:2.2rem; margin-bottom:14px; opacity:0.8;';
        facade.appendChild(icon);

        const heading = document.createElement('h3');
        heading.textContent = 'The factory tour opens in a new tab';
        heading.style.cssText = 'color:white; margin:0 0 8px; font-size:1.25rem;';
        facade.appendChild(heading);

        const note = document.createElement('p');
        note.textContent = 'The 360° viewer cannot be embedded here. Click below to open it on 720yun.com.';
        note.style.cssText = 'color:rgba(255,255,255,0.75); margin:0 0 16px; font-size:0.9rem; max-width:500px;';
        facade.appendChild(note);

        const btn = document.createElement('a');
        btn.href = src;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.textContent = 'Open Factory Tour';
        btn.style.cssText = 'background:white; color:#0a1628; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:600; font-size:0.95rem; display:inline-flex; align-items:center; gap:8px;';
        const btnIcon = document.createElement('i');
        btnIcon.className = 'fas fa-external-link-alt';
        btnIcon.setAttribute('aria-hidden', 'true');
        btn.appendChild(btnIcon);
        facade.appendChild(btn);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', activateFacades);
    } else {
        activateFacades();
    }

    function activateFacades() {
        const facades = document.querySelectorAll('.vr-facade');
        facades.forEach(facade => {
            const src = facade.getAttribute('data-vr-src');
            if (!src) return;

            const handler = () => {
                // Idempotent — if already replaced, no-op
                if (facade.dataset.activated === '1') return;
                facade.dataset.activated = '1';

                // Extract numeric height from facade's inline style.
                // facade.style.height returns "400px" (or similar) — the iframe
                // HTML `height` attribute needs a number-only string, so strip
                // the "px" suffix. Default to 400 if no height set.
                const heightStyle = facade.style.height || '400';
                const heightNum = parseInt(heightStyle, 10) || 400;

                const iframe = document.createElement('iframe');
                iframe.src = src;
                iframe.width = '100%';
                iframe.height = String(heightNum);
                iframe.frameBorder = '0';
                iframe.allowFullscreen = true;
                iframe.setAttribute('allow', 'fullscreen; accelerometer; gyroscope; vr; xr-spatial-tracking');
                iframe.setAttribute('loading', 'eager');
                iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
                iframe.style.cssText = 'display:block; width:100%; height:100%; border:0;';

                // Error handler: if iframe fails to load (e.g. 720yun blocks
                // embedding via X-Frame-Options), show a fallback link instead
                // of a blank black box.
                let loadTimeout = setTimeout(() => {
                    if (facade.dataset.loaded !== '1') {
                        showEmbedFallback(facade, src);
                    }
                }, 8000);  // 8s grace period

                iframe.addEventListener('load', () => {
                    clearTimeout(loadTimeout);
                    facade.dataset.loaded = '1';
                });
                iframe.addEventListener('error', () => {
                    clearTimeout(loadTimeout);
                    showEmbedFallback(facade, src);
                });

                // Replace facade content with iframe
                facade.innerHTML = '';
                facade.style.cursor = 'default';
                facade.style.padding = '0';
                facade.style.background = '#000';
                facade.removeAttribute('role');
                facade.removeAttribute('tabindex');
                facade.appendChild(iframe);
            };

            facade.addEventListener('click', handler);
            facade.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handler();
                }
            });
        });
    }
})();


/* ==========================================
   Safe Industry Product Card Rendering
   ==========================================
   Replaces the legacy innerHTML pattern across all 6 industry pages.
   All product-supplied strings (name/description/material/tolerance/process)
   are inserted via textContent — guaranteed XSS-safe even if a malicious
   admin uploads a product named '<script>alert(1)</script>'.

   Usage on each industry page:
     WFX_renderIndustryProducts('products-gallery', 'robotics');
*/
window.WFX_renderIndustryProducts = function(galleryId, industryKey) {
    const gallery = document.getElementById(galleryId);
    if (!gallery) return;

    // Prefer server-injected CMS data (visible to Google) over localStorage
    const all = (window.__WFX_CMS__ && window.__WFX_CMS__.industry_products)
        ? window.__WFX_CMS__.industry_products
        : JSON.parse(localStorage.getItem('wfx_industry_products') || '[]');
    const products = all.filter(p => p.industry === industryKey);
    if (products.length === 0) {
        return;  // keep static crawlable fallback HTML
    }

    // Validate image URLs — only allow http(s) and our own paths.
    // Rejects javascript:, data:, vbscript: etc.
    function safeImageUrl(raw) {
        if (!raw || typeof raw !== 'string') return 'https://via.placeholder.com/400x250?text=Product';
        const trimmed = raw.trim();
        // Block dangerous schemes (javascript:, data:, vbscript:, file: ...) but
        // allow http(s) URLs, root-relative (/...) and same-origin relative paths
        // (e.g. images/content/part.webp) so admin-uploaded photos display.
        if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
            return 'https://via.placeholder.com/400x250?text=Product';
        }
        return trimmed.charAt(0) === '/' ? trimmed : '/' + trimmed;
    }

    // Replace static fallback with admin-managed products
    gallery.textContent = '';

    products.forEach(product => {
        const card = document.createElement('div');
        card.style.cssText = 'background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); transition: transform 0.3s ease;';
        card.onmouseover = function() { this.style.transform = 'translateY(-5px)'; };
        card.onmouseout = function() { this.style.transform = 'translateY(0)'; };

        // Image — setAttribute is safe (browser ignores JS-protocol URLs in src
        // when the URL has already been validated above, but we also blanket-block).
        const img = document.createElement('img');
        img.setAttribute('src', safeImageUrl(product.image_url || product.image));
        img.setAttribute('alt', product.name || 'Product');  // setAttribute escapes attrs
        img.setAttribute('loading', 'lazy');
        img.style.cssText = 'width: 100%; height: 220px; object-fit: cover;';
        card.appendChild(img);

        // Body
        const body = document.createElement('div');
        body.style.cssText = 'padding: 25px;';

        const heading = document.createElement('h3');
        heading.style.cssText = 'margin: 0 0 10px; font-size: 1.25rem;';
        heading.textContent = product.name || '';  // textContent escapes HTML
        body.appendChild(heading);

        if (product.description) {
            const p = document.createElement('p');
            p.style.cssText = 'color: var(--gray); margin: 0 0 15px; font-size: 0.95rem; line-height: 1.6;';
            p.textContent = product.description;
            body.appendChild(p);
        }

        // Badge row
        const badgeRow = document.createElement('div');
        badgeRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
        function addBadge(text, bg, color) {
            if (!text) return;
            const span = document.createElement('span');
            span.style.cssText = `background: ${bg}; color: ${color}; padding: 5px 12px; border-radius: 20px; font-size: 0.8rem;`;
            span.textContent = text;
            badgeRow.appendChild(span);
        }
        addBadge(product.material,  '#e0f2fe', '#0369a1');
        addBadge(product.tolerance, '#dcfce7', '#166534');
        addBadge(product.process,   '#fef3c7', '#92400e');
        body.appendChild(badgeRow);

        card.appendChild(body);
        gallery.appendChild(card);
    });
};


/* FAQ accordion: delegated so it also covers CMS-rendered items.
   faqExpandAll(true/false) opens/closes everything (the "view all" list). */
function initFaqAccordion() {
    document.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.faq-question') : null;
        if (!btn) return;
        var item = btn.closest('.faq-item');
        if (item) item.classList.toggle('active');
    });
}
window.faqExpandAll = function (open) {
    document.querySelectorAll('.faq-item').forEach(function (it) {
        it.classList.toggle('active', !!open);
    });
};
