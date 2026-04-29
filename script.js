/* ==========================================
   WFX - Main JavaScript
   ========================================== */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
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
   Custom Logo Loading from Admin
   ========================================== */
function initCustomLogos() {
    // Load custom main logo
    const customLogo = localStorage.getItem('wfx_custom_logo');
    if (customLogo) {
        const logoImages = document.querySelectorAll('.logo-img, .footer-logo img, a.logo img');
        logoImages.forEach(img => {
            if (img.src.includes('logo.png')) {
                img.src = customLogo;
            }
        });
    }
    
    // Load custom favicon
    const customFavicon = localStorage.getItem('wfx_custom_favicon');
    if (customFavicon) {
        // Update favicon links
        const faviconLinks = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]');
        faviconLinks.forEach(link => {
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

    // Close menu when clicking a link
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                navMenu.classList.remove('active');
                mobileToggle.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
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

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentSlide = index;
            updateSlider();
        });
    });

    // Auto-advance slider
    setInterval(nextSlide, 5000);

    // Update on window resize
    window.addEventListener('resize', updateSlider);
}

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

        // Validate required fields
        if (!fileInput.files.length) {
            showNotification('Please upload a CAD file', 'error');
            return;
        }
        if (!formData.get('material')) {
            showNotification('Please select a material', 'error');
            return;
        }
        const qty = parseInt(formData.get('quantity'), 10);
        if (!qty || qty < 1) {
            showNotification('Please enter a valid quantity', 'error');
            return;
        }
        if (!formData.get('email')) {
            // If no email field exists yet, prompt
            const email = prompt('Please enter your email so we can reply to your quote:');
            if (!email) {
                showNotification('Email is required', 'error');
                return;
            }
            formData.append('email', email);
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
        companyVideoPoster: 'company-video-poster.jpg',
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
                media.companyVideoPoster = 'company-video-poster.jpg';
                localStorage.setItem('wfx_homepage_media', JSON.stringify(media));
            }
        }
    } catch (e) {
        console.log('Using default media configuration');
    }

    // Update Hero Video
    const heroVideo = document.querySelector('.hero-video source');
    if (heroVideo && media.heroVideo) {
        heroVideo.src = media.heroVideo;
        heroVideo.parentElement.load();
    }

    // Update Company Video
    const companyVideo = document.querySelector('#company-video, .video-container video');
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
