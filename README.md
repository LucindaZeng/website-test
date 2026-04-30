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

## Security Architecture

This server implements production-grade security:

### Authentication
- **Server-side login** at `POST /api/auth/login` — no client-side password checking
- **PBKDF2-HMAC-SHA256** password hashing (200,000 iterations, random 16-byte salt)
- **HMAC-signed session tokens** stored in `HttpOnly` + `SameSite=Strict` cookies (immune to JS-based XSS theft)
- **Forced password change** on first login (default password `wfx6688` must be changed)
- Admin users stored in `uploads/.auth/admin_users.json` (mode 0600, outside web root)

### CSRF Protection
- All state-changing requests (POST/PUT/DELETE) require valid `X-CSRF-Token` header
- CSRF token issued on login, refreshable via `GET /api/auth/csrf`

### Rate Limiting (per-IP, sliding window)
- Login: 10 attempts / 5 minutes (brute-force protection)
- Quote form: 5 submissions / minute
- Contact form: 5 submissions / minute
- CMS API: 60 requests / minute

### File Upload Defense
- Whitelist of allowed extensions (`.step`, `.stp`, `.pdf`, `.dwg`, etc.)
- Magic-number validation: file content must match declared type
- Auto-rejects executables disguised as CAD files (MZ, ELF, Mach-O signatures)
- UUID-based stored filenames (no user-controlled paths)
- 100 MB hard size limit
- Stored under `uploads/quotes/` (separate from web root)

### HTTP Security Headers
- `Strict-Transport-Security` (HSTS) — only on HTTPS
- `Content-Security-Policy` with `frame-ancestors`, `object-src 'none'`, `base-uri 'self'`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, microphone, geolocation, payment all denied)
- `Server: WFX` (Python version hidden)

### Auth Endpoints
- `POST /api/auth/login` — `{username, password}` → sets cookie + returns CSRF
- `POST /api/auth/logout` — clears session cookie
- `POST /api/auth/change-password` — requires current + new password (CSRF protected)
- `GET /api/auth/me` — return current user info
- `GET /api/auth/csrf` — fetch a fresh CSRF token

### Setup Notes for Production

1. **Set SESSION_SECRET** in `config.py`:
   ```python
   SESSION_SECRET = '<run: python -c "import secrets; print(secrets.token_hex(32))">'
   ```
   Without this, sessions die when the server restarts.

2. **Run behind HTTPS** (Nginx + Let's Encrypt). HSTS only activates on HTTPS.

3. **Change default admin password** on first login. The system enforces this via `must_change_password` flag.

4. **Restrict admin path** further at the web server level (Nginx `auth_basic` or IP allowlist on `/admin/`).

## Round 4: Cloud Deployment + RBAC + Markdown Editor

### Cloud Deployment
- **Production-ready server.py** with `--host`, `--port`, `--production` flags
- **`.env` file support** as alternative to `config.py` (cloud-friendly)
- **Nginx config** at `deploy/nginx-wanfuxin.conf` (TLS, HSTS, gzip, security headers)
- **systemd unit** at `deploy/wfx-website.service` (auto-restart, hardened)
- **Step-by-step guide** in `DEPLOYMENT.md` (~45 minutes from VPS to live)

### TinyMCE Cloud + Markdown
- News and Blog editors now use **TinyMCE Cloud** (free tier: 5,000 loads/month)
- Content stored as **Markdown** (clean, portable, version-control friendly)
- Round-trip via marked.js (MD → HTML) and Turndown.js (HTML → MD)
- Setup: sign up at https://tiny.cloud, set API key in `admin/js/markdown-editor.js`

### RBAC (5 roles)
- **super_admin** — full access (1-2 people max)
- **chief_editor** — content, products, categories, media (no users/settings)
- **seo_specialist** — meta tags, slugs, alt text only
- **sales** — quotes & contacts only
- **viewer** — read-only across the board
- Permissions enforced server-side (`has_permission()` matrix)
- Role embedded in signed session token (no DB roundtrip per request)
- Nav items hidden client-side based on role for cleaner UX

### Optimistic Locking
- All CMS resources have a `version` column (BIGINT, auto-increments on update)
- Client sends `expected_version` on save; server returns 409 Conflict on mismatch
- UI shows toast: "Another user has modified this content — reload to see changes"
- Prevents 10 admins from silently overwriting each other's work

### Audit Trail
- Every admin action logged to `admin_audit_log` table
- Endpoint: `GET /api/audit` (super_admin only)
- Captures: user, action, resource, IP, timestamp, optional detail

## Round 5: Local Development + Media Library + Migration

### Local-First Workflow
You can fully prepare your website on your local machine — upload images,
record videos, write all news articles, configure homepage content — then
deploy everything to your cloud server in one shot.

See **`LOCAL_TO_CLOUD.md`** for the complete walkthrough.

### Media Library API (NEW)
- **`POST /api/media`** — upload images/videos/PDFs (multipart, requires media:write)
- **`GET /api/media`** — list all uploaded media files
- **`DELETE /api/media/<folder>/<filename>`** — remove a file
- Files stored at `uploads/media/<folder>/`, served publicly at `/uploads/media/...`
- Strict magic-number validation rejects executables disguised as images
- Folder organization: `images/`, `videos/`, `downloads/`

### Admin UI (NEW)
- `admin/media.html` now has direct file upload buttons next to URL fields
- Pick any file from your computer → click Upload → URL auto-fills
- Status indicator shows progress + result

### Migration Tool (NEW: `migrate.py`)
Pack everything into a single archive for cloud deployment:

```bash
# Local: prepare content, then export
python migrate.py export wfx-content-2026-04-29.tar.gz

# Transfer
scp wfx-content-2026-04-29.tar.gz wfx@cloud-server:/var/www/wanfuxin/

# Cloud: import
python migrate.py import wfx-content-2026-04-29.tar.gz
```

Three import modes:
- **`replace`** (default) — wipe existing CMS, restore from archive
- **`upsert`** — merge by primary key (additive)
- **`skip`** — only import if target table is empty

### Confidential Path Protection
Server now actively blocks public HTTP access to:
- `/uploads/.auth/` (admin user database)
- `/uploads/quotes/` (customer CAD files)

While keeping `/uploads/media/` publicly accessible for site assets.
