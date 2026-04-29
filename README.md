# WFX Wanfuxin — CNC Machining Services Website

Professional CNC machining services website (English).

## Project Structure

```
.
├── index.html                # Homepage
├── about.html                # About page
├── contact.html              # Contact page
├── *.html                    # Service, industry, and resource pages
├── styles.css                # Main stylesheet
├── script.js                 # Main JavaScript
├── content-loader.js         # Dynamic content loader (admin → public)
├── server.py                 # Production server with API endpoints
├── schema.sql                # MySQL database schema
├── config.example.py         # Server configuration template
├── robots.txt                # Search engine directives
├── sitemap.xml               # XML sitemap
├── admin/                    # Admin CMS panel
│   ├── index.html            # Login
│   ├── dashboard.html        # Dashboard
│   ├── content-editor.html
│   ├── videos.html           # Video & poster manager
│   ├── pages.html
│   ├── page-images.html
│   ├── products.html         # Industry products
│   ├── categories.html       # News & product category management
│   ├── media.html
│   ├── blog.html
│   ├── news.html
│   ├── users.html
│   ├── activity-log.html
│   ├── settings.html
│   ├── css/admin.css
│   └── js/
│       ├── admin-core.js
│       └── content-manager.js
├── company-video.mp4         # Facility tour video
├── company-video-poster.jpg  # Default video poster
└── hero-video.mp4            # Hero background video
```

## Quick Start

### Local development

```bash
python server.py
```

Open `http://localhost:8000` in your browser.

### Production with MySQL

1. Install the MySQL Python driver:
   ```bash
   pip install mysql-connector-python
   ```
2. Create the database:
   ```bash
   mysql -u root -p < schema.sql
   ```
3. Copy `config.example.py` to `config.py` and edit your DB credentials and admin API token.
4. Run the server:
   ```bash
   python server.py
   ```

## Admin Access

URL: `http://localhost:8000/admin/`

Default credentials:
- Username: `admin`
- Password: `wfx6688`

Change this immediately in production by editing `admin/js/admin-core.js`.

## Server Features

- Multi-threaded request handling
- Gzip compression for text assets (~70% smaller)
- ETag and Cache-Control headers (Core Web Vitals friendly)
- Security headers (CSP, X-Frame-Options, HSTS, etc.)
- Directory traversal protection
- API endpoints for quote and contact forms
- File upload handling for CAD attachments

## API Endpoints

- `POST /api/quote`   — Quote form submission with CAD file upload
- `POST /api/contact` — Contact form submission
- `GET /api/admin/quotes`   — List quotes (requires `X-Admin-Token` header)
- `GET /api/admin/contacts` — List contacts (requires `X-Admin-Token` header)

CAD files attached to quotes are stored on disk under `uploads/quotes/` (UUID-prefixed names). Only metadata is saved in MySQL.
