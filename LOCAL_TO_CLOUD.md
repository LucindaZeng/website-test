# Local Development → Cloud Deployment Workflow

This guide walks you through preparing your website **content** (images,
videos, news articles, products, etc.) on your local machine, then
deploying it to your cloud server in one shot.

---

## Why prepare content locally first?

- **Save time** — bulk upload 50 images at home, not over a slow remote SSH session.
- **Iterate freely** — try different layouts/wording without affecting live users.
- **Backup baseline** — your local copy is a known-good starting state.
- **No public exposure** during the messy "still building" phase.

---

## Phase 1 — Run the website locally

### 1. Install dependencies

```bash
# macOS / Ubuntu
brew install python3 mysql           # or: apt install python3 mysql-server

# Set up Python venv (once)
cd /path/to/wfx-website
python3 -m venv venv
source venv/bin/activate
pip install mysql-connector-python
```

### 2. Set up local MySQL

```bash
# Start MySQL locally
brew services start mysql            # macOS
sudo systemctl start mysql           # Ubuntu

# Create the database
mysql -u root -p <<'SQL'
CREATE DATABASE wfx_website CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wfx_user'@'localhost' IDENTIFIED BY 'local-dev-password';
GRANT ALL PRIVILEGES ON wfx_website.* TO 'wfx_user'@'localhost';
FLUSH PRIVILEGES;
SQL

# Apply schema
mysql -u wfx_user -p wfx_website < schema.sql
```

### 3. Configure secrets

Create `.env` in the project root:

```bash
cp .env.example .env
nano .env
```

Set:
```
WFX_HOST=127.0.0.1
WFX_PORT=8000
WFX_DB_HOST=localhost
WFX_DB_USER=wfx_user
WFX_DB_PASSWORD=local-dev-password
WFX_DB_NAME=wfx_website
WFX_SESSION_SECRET=run-python-secrets-token_hex-32-here
WFX_ADMIN_TOKEN=any-random-string-for-now
```

### 4. Run the server

```bash
python server.py
```

Browser opens automatically at http://localhost:8000.

### 5. First admin login

1. Go to `http://localhost:8000/admin/`
2. Username: `admin`, Password: `wfx6688`
3. **Change password when prompted** (forced on first login)

---

## Phase 2 — Upload your content

### Images and videos

1. Navigate to **Media** in the admin sidebar
2. Click **Add Image** or **Add Video**
3. Either:
   - **Paste an external URL** (e.g. an Unsplash CDN image), OR
   - **Click Choose File → Upload** to upload a local file directly to the server
4. After upload, the URL field auto-fills with `/uploads/media/images/yourfile_abc123.jpg`
5. That URL can be referenced in any News article, Blog post, or Product entry

**Folders are auto-organized:** `images/`, `videos/`, `downloads/`. The picker fills the right folder based on file type.

**File size limits:**
- Images: 50 MB per file (browser warning), 200 MB hard limit
- Videos: 200 MB hard limit
- PDFs (NDA, datasheets): 50 MB

### News articles & blog posts

1. **News** or **Blog** in admin sidebar
2. Click **Add News Article** / **New Blog Post**
3. The TinyMCE editor opens — type or paste your content
4. To insert images: paste the URL from the Media library, or use the editor's Insert Image button
5. **Content is saved as Markdown** — clean, portable, easy to edit later
6. Set status: `draft` or `published`
7. Save → public News/Blog page updates immediately

### Products on industry pages

1. **Products** in admin sidebar
2. Add product with: name, description, image URL, industry tag
3. Industry pages (`aerospace.html`, `liquid-cooling.html`, etc.) will dynamically pull all products tagged with their industry
4. **Important fallback:** if no admin-managed products exist for an industry, the page shows the 6 hardcoded default products (visible to Google)

### Page-level content (homepage hero, etc.)

1. **Content Editor** in admin sidebar
2. Edit the JSON-like structure for each page section
3. Changes are pushed to the server immediately and visible site-wide

---

## Phase 3 — Test thoroughly

Before deploying:

```bash
# Stop the dev server (Ctrl+C) then:

# 1. Check what your homepage looks like to a crawler (no JS):
curl -s http://localhost:8000/ | grep -E "<h[1-3]|<title>" | head -20

# 2. Check liquid-cooling page has product names visible in raw HTML:
curl -s http://localhost:8000/liquid-cooling.html | grep "product-card" | head

# 3. Run Lighthouse on a few pages (in Chrome DevTools):
#    - Homepage (target: Performance > 80, SEO > 95, Accessibility > 95)
#    - 5-axis.html
#    - liquid-cooling.html

# 4. Check structured data:
#    Open https://search.google.com/test/rich-results
#    Paste http://localhost:8000/ (or use a tunnel like ngrok for public access)
```

---

## Phase 4 — Export content for cloud deployment

This is the magic step. The `migrate.py` tool packages **everything** into a single archive.

```bash
# Export everything (excluding sensitive customer data and admin users)
python migrate.py export wfx-content-2026-04-29.tar.gz

# Output:
#   ✓  cms_content: 12 rows
#   ✓  cms_industry_products: 36 rows
#   ✓  cms_news: 8 rows
#   ✓  categories: 14 rows
#   ✓  media files: 47 files (15234 KB)
#   ✓  Archive created: wfx-content-2026-04-29.tar.gz (15.3 MB)
```

### What's in the archive?

| Included by default | Included only with flag |
|---|---|
| All CMS content (`cms_content`) | Customer quotes (`--include-quotes`) |
| Industry products (`cms_industry_products`) | Customer contacts (`--include-quotes`) |
| News & blog posts (`cms_news`) | Admin user accounts (`--include-users`) |
| Categories (`categories`) | |
| All uploaded media files (`uploads/media/`) | |

**NOT included** (handle separately):
- Customer CAD files in `uploads/quotes/` (always keep these strictly local until you trust the cloud server)
- `config.py` / `.env` (set these manually on the cloud server)
- HTML/CSS/JS source code (deploy via git or scp the project ZIP)

---

## Phase 5 — Deploy to cloud server

### 1. First time: deploy the code

Follow `DEPLOYMENT.md` to:
- Set up the cloud VPS (Ubuntu 22.04, MySQL, Nginx, certbot)
- Create the `wfx` user
- Apply `schema.sql`
- Configure `config.py` or `.env` (with **production** secrets, not your local dev ones)
- Install systemd service + Nginx reverse proxy
- Get HTTPS via Let's Encrypt

After this, https://wanfuxin.com is live but with **empty content** (just the 6 hardcoded fallback products per industry, plus the static service/industry pages).

### 2. Transfer the content archive

```bash
# From your local machine:
scp wfx-content-2026-04-29.tar.gz wfx@your-cloud-server.com:/var/www/wanfuxin/
```

### 3. Import on the cloud server

```bash
# SSH in:
ssh wfx@your-cloud-server.com
cd /var/www/wanfuxin

# Import (replaces any existing content)
source venv/bin/activate
python migrate.py import wfx-content-2026-04-29.tar.gz

# Output:
#   📥  Importing from wfx-content-2026-04-29.tar.gz (mode=replace)...
#   ⚠   Import in 'replace' mode will DELETE all existing CMS content...
#       Type 'yes' to continue: yes
#   ✓  cms_content: 12 rows imported
#   ✓  cms_industry_products: 36 rows imported
#   ✓  cms_news: 8 rows imported
#   ✓  media files: 47 copied to /var/www/wanfuxin/uploads/media
#   ✓  Import complete. Visit /admin/ to verify content.

# Restart so server picks up any cached state:
sudo systemctl restart wfx-website
```

### 4. Verify

- Browse https://wanfuxin.com — homepage should look identical to local
- Check `liquid-cooling.html` etc. — your custom products show
- Check News and Blog pages — your articles are there
- Check `/admin/` — log in with the admin password (the production one, not your local dev one)
- Spot-check a few media URLs (e.g. https://wanfuxin.com/uploads/media/images/your-photo_abc.jpg) — should serve directly

---

## Update workflow (after launch)

### Option A: Add content via cloud admin (simplest, recommended)

Once live, your team logs into `/admin/` directly on the production site and adds new content there. No more local→cloud sync needed.

### Option B: Export from cloud → edit locally → re-import

If your team prefers offline editing:

```bash
# On cloud server: export current state
ssh wfx@cloud-server
python migrate.py export current-state.tar.gz
exit

# Pull to local
scp wfx@cloud-server:/var/www/wanfuxin/current-state.tar.gz .

# Import locally (REPLACES local DB)
python migrate.py import current-state.tar.gz

# Edit / preview locally
python server.py

# Re-export and push back
python migrate.py export new-state.tar.gz
scp new-state.tar.gz wfx@cloud-server:/var/www/wanfuxin/

# On cloud: import (--mode=replace deletes old, =upsert merges by primary key)
python migrate.py import new-state.tar.gz --mode=replace
```

⚠ **Caveat for option B:** if anyone added content via the cloud admin between your export and re-import, those changes are lost on re-import. Use this workflow only when your local copy is the single source of truth.

### Option C: Migrate.py with `--mode=upsert` (additive)

```bash
# Pushes only what's new in your local archive, keeps existing cloud content
python migrate.py import wfx-additions.tar.gz --mode=upsert
```

Useful if you've prepared just a batch of new news articles locally and want to add them without touching the existing site.

---

## Troubleshooting

### "MySQL connection failed" during export
- Check `WFX_DB_*` env vars are set, OR `config.py` exists locally
- Try connecting manually: `mysql -u wfx_user -p wfx_website -e "SELECT 1"`

### "Refusing dangerous archive entry" during import
- Archive contains paths like `../something` — corrupted or malicious archive
- Re-export from a clean source

### Archive is suspiciously large (>1 GB)
- Probably includes raw video files. That's fine for the archive itself but
  takes time to upload to the cloud. Consider compressing videos to 720p H.264
  before uploading them in admin (use HandBrake or ffmpeg).

### After import, images show "broken image" icon on the site
- Verify files exist: `ls /var/www/wanfuxin/uploads/media/images/`
- Check Nginx is configured to serve `/uploads/media/` (deploy/nginx-wanfuxin.conf already does this)
- Check file permissions: `chown -R wfx:wfx /var/www/wanfuxin/uploads/`

### Admin can log in but content doesn't appear in the public site
- Check `cms-sync.js` is sending data: open browser DevTools → Network → save a content item → look for `POST /api/cms/...` returning 200
- Check the admin's role has `content:write` permission (Sales/Viewer roles cannot save)

### "Permission denied" toast on every save
- Your role doesn't have write permission for that resource
- Ask a `super_admin` to either change your role or do the edit themselves

### CSRF token errors
- Session expired (default 8 hours) — log out and log back in
- Time on the cloud server is wrong — `sudo timedatectl set-ntp on`
