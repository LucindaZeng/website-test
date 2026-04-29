#!/usr/bin/env python3
"""
WFX Wanfuxin Website — Production-Ready Server with API Endpoints

Features:
  ─ Static file serving with multi-threading, Gzip, ETag, security headers
  ─ POST /api/quote   — Save quote requests to MySQL + upload CAD file
  ─ POST /api/contact — Save contact submissions to MySQL
  ─ GET  /api/admin/quotes   — List submissions (requires X-Admin-Token)
  ─ GET  /api/admin/contacts — List submissions (requires X-Admin-Token)

Setup:
  1. Install MySQL connector:    pip install mysql-connector-python
  2. Create database:            mysql -u root -p < schema.sql
  3. Configure DB:               cp config.example.py config.py  (edit credentials)
  4. Run server:                 python server.py
"""

import os
import sys
import gzip
import json
import uuid
import hashlib
import mimetypes
import webbrowser
import argparse
import cgi
from io import BytesIO
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from datetime import datetime
from urllib.parse import unquote, urlparse


# ─── Try to import config; fall back gracefully ─────────────────────────────────
try:
    import config
    DB_CONFIG = config.DB_CONFIG
    UPLOAD_DIR = config.UPLOAD_DIR
    ADMIN_API_TOKEN = config.ADMIN_API_TOKEN
except ImportError:
    print("⚠  config.py not found — API endpoints will be disabled.")
    print("   Copy config.example.py to config.py and set your DB credentials.\n")
    DB_CONFIG = None
    UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'quotes')
    ADMIN_API_TOKEN = 'change-me'

try:
    import mysql.connector
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    if DB_CONFIG:
        print("⚠  mysql-connector-python not installed.")
        print("   Run: pip install mysql-connector-python\n")


# ─── Configuration ──────────────────────────────────────────────────────────────

DEFAULT_PORT = 8000

COMPRESSIBLE_TYPES = {
    '.html', '.css', '.js', '.json', '.xml', '.svg', '.txt',
    '.md', '.csv', '.ico', '.map',
}

CACHE_LONG = 60 * 60 * 24 * 30
CACHE_SHORT = 60 * 60 * 24
CACHE_NONE = 0

CACHE_RULES = {
    '.png': CACHE_LONG, '.jpg': CACHE_LONG, '.jpeg': CACHE_LONG,
    '.gif': CACHE_LONG, '.webp': CACHE_LONG, '.ico': CACHE_LONG,
    '.woff': CACHE_LONG, '.woff2': CACHE_LONG, '.ttf': CACHE_LONG,
    '.mp4': CACHE_LONG, '.webm': CACHE_LONG,
    '.css': CACHE_SHORT, '.js': CACHE_SHORT,
    '.json': CACHE_SHORT, '.svg': CACHE_SHORT,
    '.html': CACHE_NONE,
}

GZIP_MIN_SIZE = 256

SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
        "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; "
        "img-src 'self' data: https://images.unsplash.com https://randomuser.me; "
        "frame-src https://www.google.com https://www.720yun.com; "
        "media-src 'self' blob:; "
        "connect-src 'self';"
    ),
}

# File upload
MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100MB
ALLOWED_UPLOAD_EXTS = {
    '.step', '.stp', '.iges', '.igs', '.stl', '.sldprt',
    '.x_t', '.sat', '.dwg', '.dxf', '.pdf', '.zip', '.rar',
}


# ─── Database helpers ───────────────────────────────────────────────────────────

def get_db_connection():
    """Open a fresh MySQL connection. Returns None if MySQL unavailable."""
    if not (DB_CONFIG and MYSQL_AVAILABLE):
        return None
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as e:
        print(f"  ✗  DB connection failed: {e}")
        return None


def save_quote_to_db(data, file_info, ip, ua):
    """Insert a quote request into MySQL. Returns inserted id, or None on failure."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO quote_requests (
                customer_name, customer_email, customer_phone, customer_company,
                material, quantity, finish, lead_time, notes,
                file_original_name, file_stored_name, file_size_bytes, file_mime_type,
                ip_address, user_agent
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data.get('name'), data.get('email'), data.get('phone'), data.get('company'),
            data.get('material'), data.get('quantity'), data.get('finish'),
            data.get('lead-time'), data.get('notes'),
            file_info.get('original') if file_info else None,
            file_info.get('stored')   if file_info else None,
            file_info.get('size')     if file_info else None,
            file_info.get('mime')     if file_info else None,
            ip, ua[:500] if ua else None,
        ))
        conn.commit()
        return cursor.lastrowid
    except mysql.connector.Error as e:
        print(f"  ✗  DB insert failed: {e}")
        return None
    finally:
        conn.close()


def save_contact_to_db(data, ip, ua):
    """Insert a contact form submission. Returns id, or None."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO contact_submissions (
                first_name, last_name, email, phone, company,
                inquiry_type, message, ip_address, user_agent
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data.get('first-name'), data.get('last-name'), data.get('email'),
            data.get('phone'), data.get('company'), data.get('inquiry-type'),
            data.get('message'), ip, ua[:500] if ua else None,
        ))
        conn.commit()
        return cursor.lastrowid
    except mysql.connector.Error as e:
        print(f"  ✗  DB insert failed: {e}")
        return None
    finally:
        conn.close()


def list_submissions(table, limit=100):
    """Return recent submissions from a given table for the admin panel."""
    conn = get_db_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            f"SELECT * FROM {table} ORDER BY created_at DESC LIMIT %s",
            (limit,)
        )
        rows = cursor.fetchall()
        for row in rows:
            for k, v in row.items():
                if isinstance(v, datetime):
                    row[k] = v.isoformat()
        return rows
    except mysql.connector.Error as e:
        print(f"  ✗  DB query failed: {e}")
        return []
    finally:
        conn.close()


# ─── CMS Content Helpers ────────────────────────────────────────────────────────

def cms_get(key, default=None):
    """Fetch a JSON value from cms_content. Returns parsed Python object or default."""
    conn = get_db_connection()
    if not conn:
        return default
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT content_value FROM cms_content WHERE content_key = %s", (key,))
        row = cursor.fetchone()
        if row:
            try:
                return json.loads(row[0])
            except (ValueError, TypeError):
                return row[0]
        return default
    except mysql.connector.Error as e:
        print(f"  ✗  cms_get failed: {e}")
        return default
    finally:
        conn.close()


def cms_set(key, value):
    """Store a JSON-serializable value into cms_content."""
    conn = get_db_connection()
    if not conn:
        return False
    try:
        cursor = conn.cursor()
        payload = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
        cursor.execute("""
            INSERT INTO cms_content (content_key, content_value)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE content_value = VALUES(content_value)
        """, (key, payload))
        conn.commit()
        return True
    except mysql.connector.Error as e:
        print(f"  ✗  cms_set failed: {e}")
        return False
    finally:
        conn.close()


def cms_delete(key):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM cms_content WHERE content_key = %s", (key,))
        conn.commit()
        return True
    except mysql.connector.Error as e:
        print(f"  ✗  cms_delete failed: {e}")
        return False
    finally:
        conn.close()


def cms_list_industry_products(industry=None):
    """Get industry products. If industry is None, returns all grouped by industry."""
    conn = get_db_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        if industry:
            cursor.execute("""
                SELECT id, industry, name, description, image_url, sort_order
                FROM cms_industry_products
                WHERE industry = %s
                ORDER BY sort_order, id
            """, (industry,))
        else:
            cursor.execute("""
                SELECT id, industry, name, description, image_url, sort_order
                FROM cms_industry_products
                ORDER BY industry, sort_order, id
            """)
        return cursor.fetchall()
    except mysql.connector.Error as e:
        print(f"  ✗  list products failed: {e}")
        return []
    finally:
        conn.close()


def cms_replace_industry_products(industry, products):
    """Replace all products for a given industry with the supplied list."""
    conn = get_db_connection()
    if not conn:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM cms_industry_products WHERE industry = %s", (industry,))
        for i, p in enumerate(products or []):
            cursor.execute("""
                INSERT INTO cms_industry_products (industry, name, description, image_url, sort_order)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                industry,
                p.get('name', ''),
                p.get('description', ''),
                p.get('image', '') or p.get('image_url', ''),
                p.get('sort_order', i),
            ))
        conn.commit()
        return True
    except mysql.connector.Error as e:
        print(f"  ✗  replace products failed: {e}")
        return False
    finally:
        conn.close()


def cms_list_news(news_type='news', published_only=True, limit=100):
    """Fetch news/blog posts."""
    conn = get_db_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        sql = "SELECT * FROM cms_news WHERE type = %s"
        params = [news_type]
        if published_only:
            sql += " AND is_published = 1"
        sql += " ORDER BY published_at DESC, id DESC LIMIT %s"
        params.append(limit)
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        for row in rows:
            for k, v in row.items():
                if isinstance(v, datetime):
                    row[k] = v.isoformat()
        return rows
    except mysql.connector.Error as e:
        print(f"  ✗  list news failed: {e}")
        return []
    finally:
        conn.close()


def cms_replace_news(news_type, posts):
    """Replace all news of a given type. Used by admin Save All operations."""
    conn = get_db_connection()
    if not conn:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM cms_news WHERE type = %s", (news_type,))
        for p in posts or []:
            slug = p.get('slug') or (p.get('title') or '').lower().replace(' ', '-')[:300] or f"post-{p.get('id', '')}"
            published_at = p.get('published_at') or p.get('date') or p.get('created_at')
            cursor.execute("""
                INSERT INTO cms_news (type, title, slug, category, excerpt, content,
                                      image_url, author, published_at, is_published)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                news_type,
                p.get('title', '')[:300],
                slug[:300],
                (p.get('category') or '')[:100],
                p.get('excerpt', ''),
                p.get('content', ''),
                p.get('image', '') or p.get('image_url', ''),
                (p.get('author') or '')[:100],
                published_at,
                1 if p.get('is_published', True) else 0,
            ))
        conn.commit()
        return True
    except mysql.connector.Error as e:
        print(f"  ✗  replace news failed: {e}")
        return False
    finally:
        conn.close()


def cms_load_all_for_injection():
    """
    Load every CMS dataset that public pages need into HTML on first paint.
    Returns a dict that gets serialized to JSON and injected into <script> tags.
    """
    return {
        'page_content':       cms_get('page_content', {}),
        'homepage_media':     cms_get('homepage_media', {}),
        'site_settings':      cms_get('site_settings', {}),
        'industry_products':  cms_list_industry_products(),
        'news':               cms_list_news('news',  limit=20),
        'blog':               cms_list_news('blog',  limit=20),
        'categories':         cms_get('categories', {}),
    }


# ─── Threaded Server ────────────────────────────────────────────────────────────

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# ─── Request Handler ────────────────────────────────────────────────────────────

class WFXHandler(SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        if args and '/admin' in str(args[0]):
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"  ⚠  [{ts}] ADMIN: {args[0]}")
        elif len(args) >= 2:
            code = str(args[1])
            if code.startswith(('4', '5')):
                ts = datetime.now().strftime('%H:%M:%S')
                print(f"  ✗  [{ts}] {code} {args[0]}")

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        for h, v in SECURITY_HEADERS.items():
            self.send_header(h, v)
        self.end_headers()
        self.wfile.write(body)

    def _client_ip(self):
        return self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()

    def _ua(self):
        return self.headers.get('User-Agent', '')

    def do_POST(self):
        path = urlparse(self.path).path
        if path == '/api/quote':
            self._handle_quote_post()
        elif path == '/api/contact':
            self._handle_contact_post()
        elif path.startswith('/api/cms/'):
            self._handle_cms_write(path)
        else:
            self._send_json(404, {'ok': False, 'error': 'Not found'})

    def do_PUT(self):
        # Treat PUT same as POST for CMS
        self.do_POST()

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith('/api/cms/'):
            self._handle_cms_delete(path)
        else:
            self._send_json(404, {'ok': False, 'error': 'Not found'})

    def _handle_quote_post(self):
        """Multipart POST: form fields + optional CAD file upload."""
        if not (DB_CONFIG and MYSQL_AVAILABLE):
            self._send_json(503, {
                'ok': False,
                'error': 'Database not configured. Submission cannot be saved.'
            })
            return

        ctype = self.headers.get('Content-Type', '')
        if not ctype.startswith('multipart/form-data'):
            self._send_json(400, {'ok': False, 'error': 'Use multipart/form-data'})
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': ctype},
            keep_blank_values=True,
        )

        data = {}
        for key in ('name', 'email', 'phone', 'company', 'material',
                    'quantity', 'finish', 'lead-time', 'notes'):
            if key in form:
                data[key] = form.getvalue(key)

        if not data.get('email'):
            self._send_json(400, {'ok': False, 'error': 'Email is required'})
            return

        file_info = None
        if 'cad-file' in form and form['cad-file'].filename:
            field = form['cad-file']
            original_name = os.path.basename(field.filename)
            ext = os.path.splitext(original_name)[1].lower()

            if ext not in ALLOWED_UPLOAD_EXTS:
                self._send_json(400, {
                    'ok': False,
                    'error': f'File type {ext} not allowed.'
                })
                return

            os.makedirs(UPLOAD_DIR, exist_ok=True)
            stored_name = f"{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:12]}{ext}"
            target_path = os.path.join(UPLOAD_DIR, stored_name)

            size = 0
            with open(target_path, 'wb') as f:
                while True:
                    chunk = field.file.read(64 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        f.close()
                        os.unlink(target_path)
                        self._send_json(413, {'ok': False, 'error': 'File too large (max 100MB)'})
                        return
                    f.write(chunk)

            file_info = {
                'original': original_name,
                'stored':   stored_name,
                'size':     size,
                'mime':     mimetypes.guess_type(original_name)[0] or 'application/octet-stream',
            }

        row_id = save_quote_to_db(data, file_info, self._client_ip(), self._ua())
        if row_id is None:
            self._send_json(500, {'ok': False, 'error': 'Could not save to database'})
            return

        ts = datetime.now().strftime('%H:%M:%S')
        print(f"  ✓  [{ts}] Quote #{row_id} saved (email: {data.get('email')})")
        self._send_json(200, {'ok': True, 'id': row_id})

    def _handle_contact_post(self):
        """JSON or form POST for contact submissions."""
        if not (DB_CONFIG and MYSQL_AVAILABLE):
            self._send_json(503, {'ok': False, 'error': 'Database not configured.'})
            return

        length = int(self.headers.get('Content-Length', 0))
        if length > 1024 * 100:
            self._send_json(413, {'ok': False, 'error': 'Payload too large'})
            return

        raw = self.rfile.read(length)
        ctype = self.headers.get('Content-Type', '')
        try:
            if 'application/json' in ctype:
                data = json.loads(raw.decode('utf-8'))
            else:
                from urllib.parse import parse_qs
                parsed = parse_qs(raw.decode('utf-8'))
                data = {k: v[0] for k, v in parsed.items()}
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {'ok': False, 'error': 'Invalid request body'})
            return

        if not data.get('email'):
            self._send_json(400, {'ok': False, 'error': 'Email required'})
            return

        row_id = save_contact_to_db(data, self._client_ip(), self._ua())
        if row_id is None:
            self._send_json(500, {'ok': False, 'error': 'Could not save'})
            return

        ts = datetime.now().strftime('%H:%M:%S')
        print(f"  ✓  [{ts}] Contact #{row_id} saved (email: {data.get('email')})")
        self._send_json(200, {'ok': True, 'id': row_id})

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/admin/quotes':
            self._handle_admin_list('quote_requests')
            return
        if path == '/api/admin/contacts':
            self._handle_admin_list('contact_submissions')
            return
        if path.startswith('/api/cms/'):
            self._handle_cms_read(path)
            return
        self._serve_static()

    def _handle_admin_list(self, table):
        token = self.headers.get('X-Admin-Token', '')
        if token != ADMIN_API_TOKEN:
            self._send_json(401, {'ok': False, 'error': 'Unauthorized'})
            return
        self._send_json(200, {'ok': True, 'rows': list_submissions(table)})

    # ─── CMS Handlers ────────────────────────────────────────────────────────
    # GET  /api/cms/content/<key>     → read JSON value
    # POST /api/cms/content/<key>     → write JSON value (auth required)
    # GET  /api/cms/products/<industry?> → list products
    # POST /api/cms/products/<industry> → replace products for industry (auth)
    # GET  /api/cms/news/<type>       → list news/blog
    # POST /api/cms/news/<type>       → replace all of given type (auth)
    # GET  /api/cms/all               → bundle all CMS data (used by content-loader.js)

    def _check_admin_auth(self):
        token = self.headers.get('X-Admin-Token', '')
        if token != ADMIN_API_TOKEN:
            self._send_json(401, {'ok': False, 'error': 'Unauthorized'})
            return False
        return True

    def _read_json_body(self, max_bytes=5 * 1024 * 1024):
        length = int(self.headers.get('Content-Length', 0))
        if length > max_bytes:
            self._send_json(413, {'ok': False, 'error': 'Payload too large'})
            return None
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {'ok': False, 'error': 'Invalid JSON'})
            return None

    def _handle_cms_read(self, path):
        """GET handlers — public read access (anyone can see content)."""
        if not (DB_CONFIG and MYSQL_AVAILABLE):
            self._send_json(503, {'ok': False, 'error': 'Database not configured'})
            return

        parts = path.strip('/').split('/')
        # ['api', 'cms', resource, ...id]
        if len(parts) < 3:
            self._send_json(404, {'ok': False, 'error': 'Not found'})
            return
        resource = parts[2]

        if resource == 'all':
            self._send_json(200, {'ok': True, 'data': cms_load_all_for_injection()})
            return

        if resource == 'content' and len(parts) == 4:
            value = cms_get(parts[3])
            self._send_json(200, {'ok': True, 'value': value})
            return

        if resource == 'products':
            industry = parts[3] if len(parts) >= 4 else None
            self._send_json(200, {'ok': True, 'rows': cms_list_industry_products(industry)})
            return

        if resource == 'news' and len(parts) >= 4:
            news_type = parts[3]  # 'news' or 'blog'
            if news_type not in ('news', 'blog'):
                self._send_json(400, {'ok': False, 'error': 'type must be news or blog'})
                return
            self._send_json(200, {'ok': True, 'rows': cms_list_news(news_type)})
            return

        self._send_json(404, {'ok': False, 'error': 'Not found'})

    def _handle_cms_write(self, path):
        """POST/PUT handlers — admin only."""
        if not (DB_CONFIG and MYSQL_AVAILABLE):
            self._send_json(503, {'ok': False, 'error': 'Database not configured'})
            return
        if not self._check_admin_auth():
            return

        parts = path.strip('/').split('/')
        if len(parts) < 3:
            self._send_json(404, {'ok': False, 'error': 'Not found'})
            return
        resource = parts[2]

        body = self._read_json_body()
        if body is None:
            return  # already sent error

        if resource == 'content' and len(parts) == 4:
            ok = cms_set(parts[3], body.get('value'))
            self._send_json(200 if ok else 500, {'ok': ok})
            return

        if resource == 'products' and len(parts) == 4:
            industry = parts[3]
            products = body.get('products', [])
            ok = cms_replace_industry_products(industry, products)
            self._send_json(200 if ok else 500, {'ok': ok})
            return

        if resource == 'news' and len(parts) == 4:
            news_type = parts[3]
            if news_type not in ('news', 'blog'):
                self._send_json(400, {'ok': False, 'error': 'type must be news or blog'})
                return
            posts = body.get('posts', [])
            ok = cms_replace_news(news_type, posts)
            self._send_json(200 if ok else 500, {'ok': ok})
            return

        self._send_json(404, {'ok': False, 'error': 'Not found'})

    def _handle_cms_delete(self, path):
        if not self._check_admin_auth():
            return
        parts = path.strip('/').split('/')
        if len(parts) == 4 and parts[2] == 'content':
            ok = cms_delete(parts[3])
            self._send_json(200 if ok else 500, {'ok': ok})
            return
        self._send_json(404, {'ok': False, 'error': 'Not found'})

    def _serve_static(self):
        decoded_path = unquote(self.path)
        if '..' in decoded_path or '\x00' in decoded_path:
            self.send_error(403, "Forbidden")
            return

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
            if not os.path.exists(path):
                self.send_error(404, "Not Found")
                return
        if not os.path.isfile(path):
            self.send_error(404, "Not Found")
            return

        try:
            with open(path, 'rb') as f:
                content = f.read()
        except (IOError, PermissionError):
            self.send_error(500, "Internal Server Error")
            return

        _, ext = os.path.splitext(path)
        ext = ext.lower()
        content_type = mimetypes.guess_type(path)[0] or 'application/octet-stream'

        # ── Server-side CMS data injection (the core SEO fix) ──
        # For HTML pages, inject DB content into a <script> tag before </head>.
        # This means Googlebot sees the latest content WITHOUT running JavaScript.
        # Public pages then read window.__WFX_CMS__ instead of localStorage.
        if ext == '.html' and DB_CONFIG and MYSQL_AVAILABLE and '/admin/' not in self.path:
            try:
                cms_bundle = cms_load_all_for_injection()
                # JSON-encode safely (escape </script> sequences)
                cms_json = json.dumps(cms_bundle, ensure_ascii=False, default=str)
                cms_json = cms_json.replace('</', '<\\/')
                injection = (
                    '<script id="wfx-cms-data">'
                    'window.__WFX_CMS__=' + cms_json + ';'
                    '</script></head>'
                ).encode('utf-8')
                # Replace the first </head> only
                if b'</head>' in content:
                    content = content.replace(b'</head>', injection, 1)
                    # Etag must change because content changed
                    etag = hashlib.md5(content).hexdigest()
            except Exception as e:
                # Never let DB issues break static serving
                print(f"  ⚠  CMS injection skipped: {e}")

        etag = hashlib.md5(content).hexdigest()
        if self.headers.get('If-None-Match', '').strip('"') == etag:
            self.send_response(304)
            self.end_headers()
            return

        use_gzip = (
            ext in COMPRESSIBLE_TYPES
            and len(content) > GZIP_MIN_SIZE
            and 'gzip' in self.headers.get('Accept-Encoding', '')
        )
        if use_gzip:
            buf = BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6) as gz:
                gz.write(content)
            compressed = buf.getvalue()
            if len(compressed) < len(content):
                content = compressed
            else:
                use_gzip = False

        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))

        max_age = CACHE_RULES.get(ext, CACHE_NONE)
        if max_age > 0:
            self.send_header('Cache-Control', f'public, max-age={max_age}')
        else:
            self.send_header('Cache-Control', 'no-cache, must-revalidate')

        self.send_header('ETag', f'"{etag}"')
        if use_gzip:
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')

        for h, v in SECURITY_HEADERS.items():
            self.send_header(h, v)
        self.end_headers()

        if self.command != 'HEAD':
            self.wfile.write(content)

    def do_HEAD(self):
        self._serve_static()


# ─── Startup ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='WFX Website Server')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    mimetypes.add_type('application/javascript', '.js')
    mimetypes.add_type('image/svg+xml', '.svg')
    mimetypes.add_type('font/woff', '.woff')
    mimetypes.add_type('font/woff2', '.woff2')
    mimetypes.add_type('video/mp4', '.mp4')

    server = ThreadedHTTPServer(('', args.port), WFXHandler)

    db_status = "Connected" if (DB_CONFIG and MYSQL_AVAILABLE) else "Disabled (no config)"

    print(f"""
╔═══════════════════════════════════════════════════════════════╗
║            WFX Wanfuxin — Production Server                   ║
╠═══════════════════════════════════════════════════════════════╣
║   Website:     http://localhost:{args.port}
║   Admin:       http://localhost:{args.port}/admin/
╠═══════════════════════════════════════════════════════════════╣
║   Multi-threaded | Gzip | ETag | Security headers
║   MySQL: {db_status}
║
║   API: POST /api/quote, POST /api/contact
║        GET /api/admin/quotes, GET /api/admin/contacts
╚═══════════════════════════════════════════════════════════════╝
""")
    if not args.no_browser:
        webbrowser.open(f'http://localhost:{args.port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.\n")
        server.server_close()
        sys.exit(0)


if __name__ == '__main__':
    main()
