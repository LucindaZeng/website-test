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

**Public form submissions:**
- `POST /api/quote`   — Quote form submission with CAD file upload
- `POST /api/contact` — Contact form submission

**Admin form management** (requires `X-Admin-Token` header):
- `GET /api/admin/quotes`   — List quotes
- `GET /api/admin/contacts` — List contacts

**CMS content (NEW — server-side persistence):**
- `GET  /api/cms/all` — Bundle of all CMS data (used by content-loader.js)
- `GET  /api/cms/content/<key>` — Read a key/value content blob
- `POST /api/cms/content/<key>` — Write a content blob (auth required)
- `GET  /api/cms/products[/<industry>]` — List industry products
- `POST /api/cms/products/<industry>` — Replace products for an industry (auth)
- `GET  /api/cms/news/<news|blog>` — List news or blog posts
- `POST /api/cms/news/<news|blog>` — Replace all posts of given type (auth)

CAD files attached to quotes are stored on disk under `uploads/quotes/` (UUID-prefixed names). Only metadata is saved in MySQL.

## CMS Architecture

The site uses a hybrid CMS:

1. **Admin panel** (`/admin/`) — User edits content in a browser-based UI. Data is saved to localStorage AND mirrored to the MySQL server in real time via `js/cms-sync.js`.

2. **Server-side injection** — When `server.py` serves an HTML page, it injects the latest CMS data from MySQL into a `<script>` tag inside `<head>` as `window.__WFX_CMS__`. This means **Google's crawler sees the latest content immediately** without running JavaScript.

3. **Public pages** — `content-loader.js` and inline page scripts read `window.__WFX_CMS__` first, falling back to localStorage for offline/legacy support.

This three-layer design provides:
- **SEO**: Content visible to crawlers without JS execution
- **Speed**: No extra HTTP requests on first load
- **Resilience**: Site works even if DB is down (uses last cached data)
- **Real-time admin UX**: Admin sees other admins' changes after refresh
