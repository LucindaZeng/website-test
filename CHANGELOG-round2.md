# WFX Website — Changelog (Round 2)

**Date:** 2026-04-01
**Fixes applied:** 7 issues

---

## Fix #1: Configurable video poster image

**Problem:** The "Explore Our Facility" video showed a Unsplash flower vase image as its initial preview instead of a relevant factory image, and the admin could not change it.

**Changes:**
- `index.html` — Video element now points to `company-video-poster.jpg` as default poster, with a fallback to a manufacturing-themed Unsplash image if the local file is missing. Added `id="company-video"` for JS targeting.
- `admin/videos.html` — Added a file upload area in the Video Manager so admins can upload a JPG/PNG/WebP poster directly. The image is converted to a data URL and saved via `PageContentManager`. Existing URL input still works for external images.
- `content-loader.js` — Updated selector to recognise the new `#company-video` ID so the admin-configured poster URL applies on page load.

**How to use:** Open Admin → Video Manager → Company Video card → click the new "Click to upload a poster image" upload area, choose a file, then click "Save All Settings".

---

## Fix #2: Quote form data persisted to MySQL

**Problem:** Customer quote submissions were only sent via mailto and never stored in a database.

**Changes:**
- `schema.sql` — New file. Creates the `wfx_website` database with three tables:
  - `quote_requests` — All quote form submissions (customer info, project specs, file metadata)
  - `contact_submissions` — Contact form submissions
  - `categories` — News and product category definitions (also used by Fix #7)
- `server.py` — Now exposes API endpoints:
  - `POST /api/quote` — Multipart upload; saves form fields to MySQL and CAD file to disk under `uploads/quotes/`
  - `POST /api/contact` — JSON submission saved to `contact_submissions`
  - `GET /api/admin/quotes` and `/api/admin/contacts` — Admin-only read endpoints (require `X-Admin-Token` header)
- `config.example.py` — New file. Template for DB credentials, upload directory, and admin API token. Copy to `config.py` and fill in values.
- `script.js` — Quote form now POSTs to `/api/quote` with `multipart/form-data` (file included). Contact form POSTs to `/api/contact`. Both fall back to mailto if the server returns 503 (database not configured) or the network fails — so leads are never lost.
- `index.html` — Added customer contact fields (Name, Email, Phone, Company) to the quote form. Email is now required.

**Setup steps:**
1. Install the MySQL Python driver: `pip install mysql-connector-python`
2. Create the database: `mysql -u root -p < schema.sql`
3. Copy `config.example.py` to `config.py` and fill in your MySQL credentials
4. Run `python server.py` — the startup banner will show "MySQL: Connected"

### About file attachments

**File attachments cannot reasonably be stored inside MySQL.** CAD files in this business range from a few KB up to 100MB. While MySQL's `LONGBLOB` technically supports up to 4GB per cell, storing files there causes:

1. **Backup/restore explosion** — `mysqldump` of 1,000 quotes × 50MB = 50GB SQL file. Restores take hours.
2. **Replication breakage** — Every binary blob is sent over the network to replicas.
3. **Memory pressure** — MySQL caches rows in the buffer pool; 50MB blobs evict useful query cache data.
4. **No streaming** — To serve a file, MySQL must load the entire blob into memory.

The industry standard (and what is implemented here) is to save the file to disk under `uploads/quotes/` with a UUID-prefixed filename, and save metadata (original name, stored name, size, mime type) to MySQL columns. This is exactly how AWS S3 + RDS, Google Cloud Storage + Cloud SQL, and every major CMS works.

**For backups:** rsync `uploads/` to a NAS or S3 bucket separately from your MySQL backup.

---

## Fix #3: Expanded supported file formats

**Problem:** The supported formats list was missing common formats customers need to submit.

**Changes:**
- `index.html` — Added `.STP`, `.IGS`, `.DWG`, `.DXF`, `.PDF`, `.ZIP` to the visible format tags. Updated the `<input>` `accept` attribute to match.
- `script.js` — Updated the `validExtensions` whitelist to accept the same extensions.
- `server.py` — Added the same extensions to `ALLOWED_UPLOAD_EXTS`.

**Recommended additional formats** (you may want to add these too):
- `.PRT` — Pro/E parts
- `.CATPART` — CATIA V5
- `.JT` — Siemens JT format
- `.3MF` — Newer additive manufacturing format

Currently I added only the formats you asked for plus DXF (the 2D drafting counterpart to DWG, very common for sheet metal) and ZIP/RAR (so customers can submit projects with multiple files).

---

## Fix #4: Surface Finish & Lead Time cleanup

**Surface Finish — Removed Chinese text, consolidated duplicates:**

Before (with Chinese & duplicates):
```
Anodize
Bead Blast + Anodize
Powder Coating
Painting
Electroplating
E-Coating
PVD Coating
Passivation
Black Oxide
Nickel Plating         ← duplicate of Electroplating
Chrome Plating         ← duplicate of Electroplating
Zinc Plating           ← duplicate of Electroplating
Polishing
Brushing
Other (Please specify in notes)
```

After (clean, no duplicates):
```
As Machined
Anodize (Type II / Type III)
Bead Blasting
Bead Blast + Anodize
Powder Coating
Painting
Electroplating (Nickel / Chrome / Zinc)   ← consolidated
E-Coating
PVD Coating
Passivation
Black Oxide
Polishing
Brushing
Other (Please specify in notes)
```

**Lead Time — Minimum 7 days, removed unrealistic rush options:**

Before:
```
Standard (5-7 days)
Expedited (3-4 days)
Rush (1-2 days)        ← unrealistic for custom CNC
```

After:
```
Standard (7-10 days)
Expedited (10-15 days)
Extended (15-25 days)
Flexible (Best price)
```

---

## Fix #5: Admin password restored

**Changes:**
- `admin/js/admin-core.js` — Default admin password is now `wfx6688` (was empty after the previous security fix).

**Login:** username `admin`, password `wfx6688`.

**Important:** This is still client-side authentication only. For real production use, please configure proper server-side authentication and change this password.

---

## Fix #6: Page loading speed improvements (Core Web Vitals)

**Changes applied across all 37 HTML pages:**

1. **Lazy loading** — Added `loading="lazy" decoding="async"` to all below-the-fold Unsplash images (28 images total). Browsers will defer loading these until they're near the viewport.

2. **Explicit width/height** — Added `width` and `height` attributes to lazy-loaded images so the browser reserves space and doesn't shift the layout when the image loads. This directly improves the **CLS** (Cumulative Layout Shift) Core Web Vital.

3. **Deferred scripts** — Added `defer` to `script.js` and `content-loader.js` on all 37 pages. Scripts now download in parallel with HTML parsing and execute in order *after* DOM is ready.

4. **Preconnect hints** — Added `<link rel="preconnect">` for `fonts.googleapis.com`, `fonts.gstatic.com`, `cdnjs.cloudflare.com`, and `images.unsplash.com`. Browsers establish TCP+TLS connections to these origins early, before they're actually needed.

5. **Server-level optimizations** (from previous round, still active):
   - **Gzip compression** — ~70% smaller responses for text assets
   - **Browser caching** — `Cache-Control` headers (30 days for images, 1 day for CSS/JS, no-cache for HTML)
   - **ETag** — `304 Not Modified` responses save bandwidth on repeat visits

These changes target the three Core Web Vitals metrics:
- **LCP** (Largest Contentful Paint) — Faster via preconnect, gzip, and image caching
- **CLS** (Cumulative Layout Shift) — Eliminated via explicit image dimensions
- **INP** (Interaction to Next Paint) — Better via deferred scripts not blocking the main thread

---

## Fix #7: Admin category management for News & Products

**New page:** `admin/categories.html`

Features:
- **Tabbed interface** — Switch between "News & Articles" and "Products" categories.
- **Add categories** — Name, auto-generated slug (URL-friendly), optional description.
- **Edit categories** — Inline edit name and description.
- **Delete with safety check** — Warns if articles/products are using the category before deletion.
- **Article/product counts** — Shows how many items are in each category.
- **Slug protection** — Slug can't be edited after creation (would orphan tagged content).
- **Default seed data** — Pre-populated with sensible defaults (5 news categories, 6 product categories).
- **Persistence** — Saves to `localStorage` under key `wfx_categories`.

**Integration with existing admin pages:**

- `admin/news.html` — Category dropdown in the article editor now loads from the Categories admin instead of being hardcoded. Includes a "Manage categories" link below the dropdown.
- `admin/blog.html` — Same dynamic loading from Categories admin.
- `admin/products.html` — Banner at the top explains that the industry tabs map to product categories, with a "Manage Categories" button linking to the new admin page.
- All 12 admin pages — Added "Categories" link to the sidebar navigation under "Content Management" → between "Industry Products" and "Media Library".

**Default categories seeded:**

News & Articles:
- Company News, Industry Insights, Technical Articles, Case Studies, Events & Exhibitions

Products:
- Aerospace, Medical, Electronics, Robotics, Industrial, Liquid Cooling

You can add, rename, or delete any of these in the Categories admin page.

---

## Files changed/added in this round

**Added (4 new files):**
- `schema.sql` — MySQL database schema
- `config.example.py` — Template for server configuration
- `admin/categories.html` — Category management UI
- (`uploads/quotes/` directory will be auto-created on first quote upload)

**Modified (HTML pages):**
- `index.html` — Video poster, formats, surface finish, lead time, contact fields, lazy loading, preconnects
- All 37 HTML pages — `defer` on scripts, lazy loading on images
- `admin/videos.html` — Poster image upload
- `admin/news.html` — Dynamic categories
- `admin/blog.html` — Dynamic categories
- `admin/products.html` — Banner linking to Categories
- All 12 admin pages — Categories nav link

**Modified (JS / config):**
- `script.js` — API POST for quote and contact forms
- `content-loader.js` — Updated video selector
- `admin/js/admin-core.js` — Restored password
- `server.py` — API endpoints for MySQL persistence
