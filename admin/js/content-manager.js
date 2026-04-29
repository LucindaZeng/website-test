/**
 * WFX Page Content Manager
 * Manages editable content for all pages
 */

const PageContentManager = {
    // Storage key
    STORAGE_KEY: 'wfx_page_content',

    // Default content structure for all pages
    DEFAULT_CONTENT: {
        // Index/Home Page
        index: {
            hero: {
                title: 'Precision CNC Machining',
                subtitle: 'From Prototype to Production',
                description: 'Industry-leading precision manufacturing with tolerances down to ±0.005mm. Trusted by engineers at Fortune 500 companies worldwide.',
                buttonText: 'Get Instant Quote',
                videoUrl: 'hero-video.mp4'
            },
            trustedBy: {
                label: 'Trusted by engineers at world-leading companies',
                brands: [
                    { name: 'MOLEX', url: 'https://www.molex.com' },
                    { name: 'NVIDIA', url: 'https://www.nvidia.com' },
                    { name: 'Unilumin', url: 'https://www.unilumin.com' },
                    { name: 'STEAMBOW', url: 'https://www.steambow.com' },
                    { name: 'BLACKMAGICDESIGN', url: 'https://www.blackmagicdesign.com' },
                    { name: 'ROE', url: 'https://www.roevisual.com/en/' },
                    { name: 'ENVICOOL', url: 'https://www.envicool.com' },
                    { name: 'BYD', url: 'https://www.byd.com' }
                ]
            },
            services: {
                sectionTitle: 'Comprehensive CNC Machining Solutions',
                sectionDescription: 'From rapid prototyping to full-scale production, we deliver precision-machined components with industry-leading quality and speed.',
                items: [
                    {
                        id: 'cnc-milling',
                        title: 'CNC Milling',
                        description: '3-axis to 6-axis milling capabilities for complex geometries. Ideal for prototypes, fixtures, and production parts with tight tolerances.',
                        image: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=300&fit=crop',
                        features: ['Parts in as fast as 1 day', 'Tolerances to ±0.005mm'],
                        link: 'cnc-milling.html'
                    },
                    {
                        id: 'cnc-turning',
                        title: 'CNC Turning',
                        description: 'High-precision turned parts with live tooling capabilities. Perfect for shafts, bushings, and rotational components.',
                        image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=400&h=300&fit=crop',
                        features: ['Swiss-style turning', 'Multi-axis live tooling'],
                        link: 'cnc-turning.html'
                    },
                    {
                        id: '5-axis',
                        title: '5-Axis Machining',
                        description: 'Complex geometries in single setups. Reduce lead times and improve accuracy with simultaneous 5-axis machining.',
                        image: 'https://images.unsplash.com/photo-1581091226817-a6a2a5aee158?w=400&h=300&fit=crop',
                        features: ['Complex geometries', 'Single setup machining'],
                        link: '5-axis.html'
                    },
                    {
                        id: 'precision-inspection',
                        title: 'Precision Inspection',
                        description: 'CMM inspection and quality verification for all critical dimensions. Full inspection reports available.',
                        image: 'https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?w=400&h=300&fit=crop',
                        features: ['CMM inspection', 'Full quality reports'],
                        link: 'precision-inspection.html'
                    }
                ],
                ctaText: 'Not sure which service is right for your project?',
                ctaButton: 'Talk to an Engineer'
            },
            quote: {
                title: 'Get Your Custom Quote in Minutes',
                description: 'Upload your CAD file and receive instant DFM feedback, pricing, and lead times. Our automated quoting system analyzes your design 24/7.',
                features: [
                    { icon: 'fas fa-clock', title: 'Instant Analysis', description: 'Get feedback in seconds' },
                    { icon: 'fas fa-file-alt', title: 'DFM Feedback', description: 'Free manufacturability review' },
                    { icon: 'fas fa-tags', title: 'Transparent Pricing', description: 'No hidden fees' }
                ]
            },
            whyChoose: {
                title: 'Why Engineers Choose WFX',
                description: 'We combine advanced technology with decades of manufacturing expertise to deliver parts that exceed expectations.',
                features: [
                    { icon: 'fas fa-award', title: 'Quality Certified', description: 'ISO9001 and IATF16949 certified facility with rigorous quality control.' },
                    { icon: 'fas fa-shipping-fast', title: 'Fast Turnaround', description: 'Parts delivered in as fast as 1 day. Standard lead times of 3-5 days.' },
                    { icon: 'fas fa-users-cog', title: 'Expert Support', description: 'Dedicated engineers review every project. Free DFM analysis and design optimization.' },
                    { icon: 'fas fa-globe-americas', title: 'Global Delivery', description: 'Worldwide shipping with DDP options. Track your order in real-time.' }
                ]
            },
            stats: [
                { value: '19+', label: 'Years Experience' },
                { value: '50+', label: 'CNC Machines' },
                { value: '10000+', label: 'Parts Monthly' },
                { value: '99.8%', label: 'On-Time Delivery' }
            ],
            companyVideo: {
                title: 'See Our Capabilities',
                description: 'Take a virtual tour of our state-of-the-art facility and see how we deliver precision parts at scale.',
                videoUrl: 'company-video.mp4',
                posterUrl: 'company-video-poster.jpg'
            }
        },

        // About Page
        about: {
            hero: {
                title: 'About WFX',
                description: 'Industry-leading precision manufacturing with 17+ years of experience serving global customers.'
            },
            intro: {
                title: 'Our Story',
                content: 'Founded in 2007, WFX (Wanfuxin) has grown from a small machine shop to a world-class precision manufacturing facility. With over 50 CNC machines and 200+ skilled employees, we serve customers across aerospace, medical, automotive, and electronics industries.',
                image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop'
            },
            values: [
                { icon: 'fas fa-bullseye', title: 'Precision', description: 'Tolerances down to ±0.005mm' },
                { icon: 'fas fa-clock', title: 'Speed', description: 'Parts in as fast as 1 day' },
                { icon: 'fas fa-award', title: 'Quality', description: 'ISO9001 & IATF16949 certified' },
                { icon: 'fas fa-handshake', title: 'Service', description: 'Dedicated engineering support' }
            ],
            certifications: ['ISO9001', 'IATF16949']
        },

        // Services Pages
        cncMilling: {
            hero: {
                title: 'CNC Milling Services',
                description: 'Precision milling from prototypes to production. 3-axis to 6-axis capabilities with tolerances to ±0.005mm.'
            },
            capabilities: [
                { title: '3-Axis Milling', description: 'Standard milling for most applications' },
                { title: '4-Axis Milling', description: 'Complex parts with rotary indexing' },
                { title: '5-Axis Milling', description: 'Simultaneous 5-axis for complex geometries' },
                { title: '6-Axis Milling', description: 'Maximum flexibility and precision' }
            ],
            specs: {
                maxPartSize: '1500 x 800 x 600mm',
                tolerance: '±0.005mm',
                surfaceFinish: 'Ra 0.4μm',
                materials: 'Aluminum, Steel, Stainless, Titanium, Brass, Copper, Plastics'
            }
        },

        cncTurning: {
            hero: {
                title: 'CNC Turning Services',
                description: 'High-precision turned parts with live tooling capabilities. Swiss-style and conventional turning available.'
            },
            capabilities: [
                { title: 'Conventional Turning', description: 'Standard lathe operations' },
                { title: 'Swiss-Style Turning', description: 'Small, precise parts' },
                { title: 'Live Tooling', description: 'Milling operations on lathe' },
                { title: 'Multi-Axis Turning', description: 'Complex turned parts' }
            ]
        },

        fiveAxis: {
            hero: {
                title: '5-Axis CNC Machining',
                description: 'Complex geometries in single setups. Reduce lead times and improve accuracy with simultaneous 5-axis machining.'
            },
            benefits: [
                'Single setup for complex parts',
                'Better surface finish',
                'Tighter tolerances',
                'Reduced lead times',
                'Lower per-part cost'
            ]
        },

        // Industries Pages
        industries: {
            hero: {
                title: 'Industries We Serve',
                description: 'Precision CNC machining solutions tailored to meet the unique demands of diverse industries worldwide.'
            },
            items: [
                {
                    id: 'aerospace',
                    title: 'Aerospace Parts',
                    description: 'AS9100D certified manufacturing for flight-critical components.',
                    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=400&fit=crop',
                    link: 'aerospace.html'
                },
                {
                    id: 'liquid-cooling',
                    title: 'Liquid Cooling Parts',
                    description: 'High-precision thermal management components for data centers and EVs.',
                    image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=600&h=400&fit=crop',
                    link: 'liquid-cooling.html'
                },
                {
                    id: 'medical',
                    title: 'Medical Devices',
                    description: 'ISO 13485 compliant manufacturing for surgical instruments and implants.',
                    image: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=600&h=400&fit=crop',
                    link: 'medical.html'
                },
                {
                    id: 'electronics',
                    title: 'Electronics',
                    description: 'Precision enclosures and heat sinks for consumer electronics.',
                    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop',
                    link: 'electronics.html'
                },
                {
                    id: 'industrial',
                    title: 'Industrial Equipment',
                    description: 'Heavy-duty components for manufacturing machinery.',
                    image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop',
                    link: 'industrial.html'
                },
                {
                    id: 'robotics',
                    title: 'Robotics & Automation',
                    description: 'High-precision components for robotic arms and actuators.',
                    image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=400&fit=crop',
                    link: 'robotics.html'
                }
            ]
        },

        // Surface Finishing Page
        finishing: {
            hero: {
                title: 'Surface Finishing Services',
                description: 'Complete your CNC machined parts with professional surface treatments.'
            },
            intro: {
                title: 'Professional Surface Treatment Solutions',
                description: 'Surface finishing is essential for protecting your parts from corrosion, enhancing aesthetics, and improving functional properties.'
            },
            processes: [
                {
                    id: 'anodizing',
                    title: 'Anodizing',
                    description: 'Electrochemical process that creates a durable, corrosion-resistant oxide layer on aluminum parts.',
                    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop',
                    features: ['Type II: 8-25μm thickness', 'Type III: 25-100μm thickness', 'Various colors available']
                },
                {
                    id: 'sandblasting',
                    title: 'Sandblasting / Bead Blasting',
                    description: 'Surface preparation process using high-pressure abrasive media.',
                    image: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600&h=400&fit=crop',
                    features: ['Uniform matte finish', 'Removes machining marks', 'Various grit sizes']
                },
                {
                    id: 'painting',
                    title: 'Spray Painting',
                    description: 'Liquid coating application providing excellent color matching.',
                    image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600&h=400&fit=crop',
                    features: ['Unlimited colors', 'Gloss/matte options', 'UV resistant']
                },
                {
                    id: 'powder-coating',
                    title: 'Powder Coating',
                    description: 'Dry finishing process with excellent durability.',
                    image: 'https://images.unsplash.com/photo-1567789884554-0b844b597180?w=600&h=400&fit=crop',
                    features: ['60-80μm thickness', 'Superior durability', 'Eco-friendly']
                },
                {
                    id: 'passivation',
                    title: 'Passivation',
                    description: 'Chemical treatment for stainless steel corrosion protection.',
                    image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=600&h=400&fit=crop',
                    features: ['ASTM A967 compliant', 'No dimensional change', 'Food-grade safe']
                },
                {
                    id: 'polishing',
                    title: 'Polishing',
                    description: 'Mechanical or electrochemical process for mirror finishes.',
                    image: 'https://images.unsplash.com/photo-1558618047-f4b511ce8e17?w=600&h=400&fit=crop',
                    features: ['Ra down to 0.1μm', 'Mirror finish', 'Electropolishing available']
                },
                {
                    id: 'pvd',
                    title: 'PVD Coating',
                    description: 'Physical Vapor Deposition for ultra-hard coatings.',
                    image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&h=400&fit=crop',
                    features: ['Hardness up to 2500 HV', 'Decorative colors', 'Wear resistant']
                },
                {
                    id: 'electroplating',
                    title: 'Electroplating',
                    description: 'Electrochemical deposition of metal coatings.',
                    image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&h=400&fit=crop',
                    features: ['Nickel, Chrome, Zinc', '5-50μm thickness', 'RoHS compliant']
                },
                {
                    id: 'e-coating',
                    title: 'E-Coating (Electrophoretic)',
                    description: 'Immersion coating process for uniform coverage.',
                    image: 'https://images.unsplash.com/photo-1581092335397-9583eb92d232?w=600&h=400&fit=crop',
                    features: ['15-35μm thickness', 'Complete coverage', 'Excellent corrosion protection']
                }
            ]
        },

        // Materials Page
        materials: {
            hero: {
                title: 'CNC Machining Materials',
                description: 'Complete material guide for precision manufacturing.'
            },
            categories: [
                {
                    name: 'Aluminum',
                    materials: ['6061-T6', '7075-T6', '2024-T3', '5052', '6063']
                },
                {
                    name: 'Steel',
                    materials: ['1018', '1045', '4140', '4340', 'A36']
                },
                {
                    name: 'Stainless Steel',
                    materials: ['303', '304', '316', '17-4 PH', '420']
                },
                {
                    name: 'Titanium',
                    materials: ['Grade 2', 'Grade 5 (Ti-6Al-4V)']
                }
            ]
        },

        // Contact Page
        contact: {
            hero: {
                title: 'Contact Us',
                description: 'Get in touch with our team for quotes, technical support, or general inquiries.'
            },
            info: {
                address: '3 Fuxin West Road, QingXi Town, Dongguan City, Guangdong, China',
                phone: '+86 13431451998',
                email: 'lucindaz@wanfuxin.com',
                hours: 'Mon - Sat: 8:00 AM - 12:00 PM, 1:30 PM - 5:30 PM (China Time)'
            }
        },

        // Resources Page
        resources: {
            hero: {
                title: 'Resources & Guides',
                description: 'Expert knowledge and tools to help you design better parts.'
            },
            items: [
                {
                    id: 'design-guide',
                    title: 'Design Guidelines',
                    description: 'Comprehensive DFM guidelines to optimize your parts.',
                    icon: 'fas fa-drafting-compass',
                    link: 'design-guide.html'
                },
                {
                    id: 'blog',
                    title: 'Blog & News',
                    description: 'Latest trends in CNC machining and manufacturing.',
                    icon: 'fas fa-newspaper',
                    link: 'blog.html'
                },
                {
                    id: 'case-studies',
                    title: 'Case Studies',
                    description: 'Real-world examples of complex manufacturing challenges.',
                    icon: 'fas fa-lightbulb',
                    link: 'case-studies.html'
                },
                {
                    id: 'faq',
                    title: 'FAQ',
                    description: 'Quick answers to common questions.',
                    icon: 'fas fa-question-circle',
                    link: 'faq.html'
                },
                {
                    id: 'downloads',
                    title: 'Downloads',
                    description: 'Technical documents and CAD templates.',
                    icon: 'fas fa-download',
                    link: 'downloads.html'
                }
            ]
        }
    },

    // Initialize content
    init: function() {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.DEFAULT_CONTENT));
        }
    },

    // Get all content
    getAllContent: function() {
        this.init();
        return JSON.parse(localStorage.getItem(this.STORAGE_KEY));
    },

    // Get content for specific page
    getPageContent: function(pageName) {
        const content = this.getAllContent();
        return content[pageName] || null;
    },

    // Get specific section content
    getSectionContent: function(pageName, sectionName) {
        const pageContent = this.getPageContent(pageName);
        return pageContent ? pageContent[sectionName] : null;
    },

    // Update page content
    updatePageContent: function(pageName, content) {
        const allContent = this.getAllContent();
        allContent[pageName] = { ...allContent[pageName], ...content };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allContent));
        
        // Log the action if AdminCore is available
        if (typeof AdminCore !== 'undefined') {
            AdminCore.logAction('content_updated', `Updated content for page: ${pageName}`, { pageName });
        }
        
        return { success: true };
    },

    // Update specific section
    updateSectionContent: function(pageName, sectionName, content) {
        const allContent = this.getAllContent();
        if (!allContent[pageName]) {
            allContent[pageName] = {};
        }
        allContent[pageName][sectionName] = content;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allContent));
        
        if (typeof AdminCore !== 'undefined') {
            AdminCore.logAction('content_updated', `Updated ${sectionName} section on ${pageName}`, { pageName, sectionName });
        }
        
        return { success: true };
    },

    // Reset to default content
    resetToDefault: function(pageName = null) {
        if (pageName) {
            const allContent = this.getAllContent();
            allContent[pageName] = this.DEFAULT_CONTENT[pageName];
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allContent));
        } else {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.DEFAULT_CONTENT));
        }
        
        if (typeof AdminCore !== 'undefined') {
            AdminCore.logAction('content_reset', `Reset content to default${pageName ? ' for ' + pageName : ''}`, { pageName });
        }
        
        return { success: true };
    },

    // Export content as JSON
    exportContent: function() {
        return JSON.stringify(this.getAllContent(), null, 2);
    },

    // Import content from JSON
    importContent: function(jsonString) {
        try {
            const content = JSON.parse(jsonString);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(content));
            
            if (typeof AdminCore !== 'undefined') {
                AdminCore.logAction('content_imported', 'Imported content from JSON file', {});
            }
            
            return { success: true };
        } catch (e) {
            return { success: false, message: 'Invalid JSON format' };
        }
    },

    // Get list of all pages
    getPageList: function() {
        return Object.keys(this.DEFAULT_CONTENT);
    }
};

// Initialize on load
PageContentManager.init();
