#!/bin/bash

# Function to create a service page
create_page() {
    local filename="$1"
    local title="$2"
    local description="$3"
    local h1="$4"
    local intro="$5"
    local content="$6"
    
    cat > "$filename" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="$description">
    <title>$title | WFX - Professional CNC Machining</title>
    <link rel="canonical" href="https://www.wanfuxin.com/$filename">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="header" id="header">
        <div class="container">
            <nav class="navbar">
                <a href="index.html" class="logo"><img src="logo.png" alt="WFX" class="logo-img"></a>
                <ul class="nav-menu" id="nav-menu">
                    <li class="nav-item"><a href="index.html#services" class="nav-link">Services</a></li>
                    <li class="nav-item"><a href="index.html#industries" class="nav-link">Industries</a></li>
                    <li class="nav-item"><a href="about.html" class="nav-link">About Us</a></li>
                    <li class="nav-item"><a href="contact.html" class="nav-link">Contact</a></li>
                </ul>
                <div class="nav-actions">
                    <a href="index.html#quote" class="btn btn-primary">Get Quote</a>
                    <button class="mobile-toggle" id="mobile-toggle"><span></span><span></span><span></span></button>
                </div>
            </nav>
        </div>
    </header>
    <section class="page-hero" style="background: var(--gradient-dark); padding: 180px 0 100px;">
        <div class="container">
            <div style="max-width: 800px;">
                <h1 style="font-size: 3rem; color: var(--white); margin-bottom: 20px;">$h1</h1>
                <p style="font-size: 1.2rem; color: rgba(255,255,255,0.8); margin-bottom: 30px;">$intro</p>
                <a href="index.html#quote" class="btn btn-primary btn-large"><i class="fas fa-upload"></i> Get Instant Quote</a>
            </div>
        </div>
    </section>
    <section style="padding: 100px 0;">
        <div class="container">
            $content
        </div>
    </section>
    <section class="cta-section">
        <div class="cta-background"></div>
        <div class="container">
            <div class="cta-content">
                <h2>Ready to Get Started?</h2>
                <p>Contact us today for a free quote on your next project.</p>
                <div class="cta-actions">
                    <a href="index.html#quote" class="btn btn-primary btn-large"><i class="fas fa-upload"></i> Get Instant Quote</a>
                    <a href="contact.html" class="btn btn-outline-light btn-large"><i class="fas fa-phone"></i> Contact Us</a>
                </div>
            </div>
        </div>
    </section>
    <footer class="footer">
        <div class="container">
            <div class="footer-main">
                <div class="footer-brand">
                    <a href="index.html" class="footer-logo"><img src="logo.png" alt="WFX" class="logo-img footer-logo-visible"></a>
                    <p>Industry-leading CNC machining services.</p>
                </div>
                <div class="footer-links">
                    <div class="footer-column"><h4>Services</h4><ul><li><a href="cnc-milling.html">CNC Milling</a></li><li><a href="cnc-turning.html">CNC Turning</a></li><li><a href="5-axis.html">5-Axis</a></li></ul></div>
                    <div class="footer-column"><h4>Company</h4><ul><li><a href="about.html">About</a></li><li><a href="contact.html">Contact</a></li></ul></div>
                </div>
                <div class="footer-contact"><h4>Contact</h4><p><i class="fas fa-phone"></i> +86 13431451998</p><p><i class="fas fa-envelope"></i> yw1@wanfuxin.com</p></div>
            </div>
            <div class="footer-bottom"><p>&copy; 2024 WFX Wanfuxin. All rights reserved.</p></div>
        </div>
    </footer>
    <button class="back-to-top" id="back-to-top"><i class="fas fa-chevron-up"></i></button>
    <script src="script.js"></script>
</body>
</html>
EOF
    echo "Created: $filename"
}

echo "Generating pages..."
