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
import re
import sys
import gzip
import hmac
import json
import time
import uuid
import base64
import secrets
import hashlib
import mimetypes
import threading
import webbrowser
import argparse
import warnings
# `cgi.FieldStorage` is the simplest stdlib way to parse multipart/form-data
# uploads. It's deprecated in Python 3.11+ but still works through 3.13. When
# upgrading to 3.14+, replace with `email.parser` or a 3rd-party multipart lib.
# The deprecation warning is filtered by message pattern (module='cgi' won't
# match because the warning fires during import, before cgi module is fully loaded).
warnings.filterwarnings('ignore', category=DeprecationWarning, message=".*cgi.*")
import cgi
from collections import defaultdict, deque
from io import BytesIO
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from datetime import datetime, timedelta
from urllib.parse import unquote, urlparse, parse_qs


# ─── Make console output robust on non-UTF-8 terminals (Windows / NSSM) ─────────
# This server prints status lines containing ✓ ⚠ ✗ ✉ and box-drawing characters.
# When run as a Windows service via NSSM the process has no UTF-8 console, so its
# stdout defaults to the system code page (e.g. GBK on Chinese Windows). The first
# such print would then raise UnicodeEncodeError and terminate the process during
# startup — the service appears to "fail to start" with no error returned.
# Reconfiguring to UTF-8 with errors='replace' makes every print safe everywhere.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass


# ─── Load .env file (if present) for cloud deployments ──────────────────────────
def _load_env_file(path='.env'):
    """Minimal .env parser. Lines: KEY=value or KEY="value".

    Always read as UTF-8 (with BOM tolerance). Without this, Chinese Windows
    defaults to GBK and crashes on any non-ASCII byte (e.g. UTF-8 comments).
    """
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), path)
    if not os.path.isfile(env_path):
        return
    with open(env_path, encoding='utf-8-sig', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            os.environ.setdefault(k, v)

_load_env_file()


# ─── Try to import config; fall back gracefully to env vars ─────────────────────
try:
    import config
    DB_CONFIG = config.DB_CONFIG
    UPLOAD_DIR = config.UPLOAD_DIR
    ADMIN_API_TOKEN = config.ADMIN_API_TOKEN
except ImportError:
    config = None
    # Fall back to environment variables (preferred for cloud deployments)
    if os.environ.get('WFX_DB_HOST'):
        DB_CONFIG = {
            'host':     os.environ.get('WFX_DB_HOST', 'localhost'),
            'port':     int(os.environ.get('WFX_DB_PORT', '3306')),
            'user':     os.environ.get('WFX_DB_USER', 'wfx_user'),
            'password': os.environ.get('WFX_DB_PASSWORD', ''),
            'database': os.environ.get('WFX_DB_NAME', 'wfx_website'),
            'charset':  'utf8mb4',
            'autocommit': False,
        }
        ADMIN_API_TOKEN = os.environ.get('WFX_ADMIN_TOKEN', 'change-me')
        UPLOAD_DIR = os.environ.get(
            'WFX_UPLOAD_DIR',
            os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'quotes')
        )
        # Synthesize a minimal `config` shim so other code can do `getattr(config, ...)`
        class _EnvConfig:
            DB_CONFIG = DB_CONFIG
            UPLOAD_DIR = UPLOAD_DIR
            ADMIN_API_TOKEN = ADMIN_API_TOKEN
            SESSION_SECRET = os.environ.get('WFX_SESSION_SECRET', '')
        config = _EnvConfig()
    else:
        print("⚠  No config.py and no WFX_* environment variables found.")
        print("   API endpoints requiring DB will return 503.")
        print("   To configure: copy config.example.py to config.py, OR set env vars (see .env.example).\n")
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
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    # HSTS: force HTTPS for 1 year, include subdomains, allow preload list submission
    # NOTE: only set this header in production with HTTPS configured!
    # For local dev (http://localhost), browsers ignore HSTS but we'll guard it below.
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    # Content-Security-Policy: defense-in-depth XSS mitigation
    # 'unsafe-inline' is needed for the existing inline event handlers and styles;
    # to remove it, all inline JS would need to be refactored into external files.
    'Content-Security-Policy': (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.tiny.cloud https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://cdn.tiny.cloud https://cdn.jsdelivr.net; "
        "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com https://cdn.tiny.cloud; "
        "img-src 'self' data: blob: https://images.unsplash.com https://randomuser.me https://cdn.tiny.cloud https://sp.tinymce.com; "
        "frame-src https://www.google.com https://maps.google.com https://www.openstreetmap.org https://www.720yun.com https://m.amap.com https://uri.amap.com https://www.amap.com https://www.youtube.com https://www.youtube-nocookie.com; "
        "frame-ancestors 'self'; "  # equivalent to X-Frame-Options for modern browsers
        "media-src 'self' blob:; "
        "connect-src 'self' https://cdn.tiny.cloud https://sp.tinymce.com; "
        "form-action 'self' mailto:; "
        "base-uri 'self'; "
        "object-src 'none';"  # Block <object>, <embed>, <applet> entirely
    ),
}

# Server fingerprint suppression: HTTP Server header is set per-response
# (Python http.server defaults to BaseHTTP/0.6 Python/X.Y.Z which exposes version)
SERVER_HEADER_VALUE = 'WFX'

# File upload (CAD files attached to quote requests)
MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100MB
ALLOWED_UPLOAD_EXTS = {
    '.step', '.stp', '.iges', '.igs', '.stl', '.sldprt',
    '.x_t', '.sat', '.dwg', '.dxf', '.pdf', '.zip', '.rar',
}

# Admin media library (images, videos, downloads admin uploads to use on the site)
MAX_MEDIA_BYTES = 200 * 1024 * 1024  # 200MB (for product videos)
ALLOWED_MEDIA_EXTS = {
    # Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico',
    # NOTE: .svg is intentionally EXCLUDED from uploads.
    # SVG files can contain <script> and on* event handlers that execute when
    # served as image/svg+xml. Without a full SVG sanitizer (e.g. DOMPurify
    # server-side), accepting SVG would be a stored XSS vector. CNC product
    # photos should be raster anyway (JPG/PNG/WebP).
    # If admins genuinely need SVG (e.g. logo), they upload via SSH instead.
    # Videos
    '.mp4', '.webm', '.mov', '.m4v',
    # Downloads (NDA, datasheets, brochures)
    '.pdf',
}
MEDIA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'media')


def sanitize_media_folder(folder):
    """Normalise a media folder into a safe, optionally-nested relative path.

    Supports page-organised paths like 'pages/cnc-milling/equipment' so files
    are stored by the page/module they belong to. Each segment must be
    alphanumeric + dash + underscore; '.', '..', empty segments, and absolute
    paths are rejected. Falls back to 'general'. Max depth 4.

    Returns a forward-slash path (used in URLs and, split, on disk).
    """
    folder = (folder or 'general').strip().strip('/')
    if not folder:
        return 'general'
    segs = [s for s in folder.split('/') if s != '']
    if not segs or len(segs) > 4:
        return 'general'
    clean = []
    for s in segs:
        if s in ('.', '..'):
            return 'general'
        if len(s) > 50 or not s.replace('-', '').replace('_', '').isalnum():
            return 'general'
        clean.append(s)
    return '/'.join(clean)


# Optional Pillow for converting uploaded images to WebP. If unavailable, uploads
# are stored in their original format (conversion is skipped gracefully — no crash).
try:
    from PIL import Image as _PILImage
    HAS_PILLOW = True
except Exception:
    HAS_PILLOW = False

# Raster formats we re-encode to WebP on upload (smaller + modern). SVG stays
# vector; GIF/WebP are left as-is to preserve animation / avoid re-encoding.
_WEBP_CONVERT_EXTS = {'.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff'}


def convert_image_to_webp(path, ext, quality=82):
    """Convert an image file to WebP (writes a new .webp, removes the original).
    Returns the new path on success, or the original path if Pillow is missing,
    the format isn't convertible, or anything goes wrong. Never raises."""
    if not HAS_PILLOW or ext.lower() not in _WEBP_CONVERT_EXTS:
        return path
    webp_path = os.path.splitext(path)[0] + '.webp'
    try:
        with _PILImage.open(path) as im:
            # Keep transparency where present; otherwise flatten to RGB
            im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
            im.save(webp_path, 'WEBP', quality=quality, method=6)
        if os.path.abspath(webp_path) != os.path.abspath(path):
            try: os.unlink(path)
            except OSError: pass
        return webp_path
    except Exception as e:
        print(f"  \u26a0  WebP conversion skipped ({os.path.basename(path)}): {e}")
        try:
            if os.path.exists(webp_path) and os.path.abspath(webp_path) != os.path.abspath(path):
                os.unlink(webp_path)
        except OSError:
            pass
        return path


# Magic-number prefixes for binary CAD/archive files we accept.
# Text-based formats (.step/.stp/.iges/.igs/.x_t/.sat) start with "ISO-10303-21"
# or human-readable headers — checked separately by content sniffing.
FILE_SIGNATURES = {
    # CAD / archives
    '.zip':    [b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'],
    '.rar':    [b'Rar!\x1a\x07\x00', b'Rar!\x1a\x07\x01\x00'],
    '.pdf':    [b'%PDF-'],
    '.dwg':    [b'AC10', b'AC1.', b'AC2.'],
    '.sldprt': [b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'],

    # Image formats (admin media library)
    '.jpg':    [b'\xff\xd8\xff'],
    '.jpeg':   [b'\xff\xd8\xff'],
    '.png':    [b'\x89PNG\r\n\x1a\n'],
    '.gif':    [b'GIF87a', b'GIF89a'],
    '.webp':   [b'RIFF'],   # Followed by 4-byte size, then 'WEBP' — coarse check
    '.ico':    [b'\x00\x00\x01\x00', b'\x00\x00\x02\x00'],

    # Video formats (admin media library)
    # Note: MP4/MOV/M4V have a "ftyp" box at offset 4, not at offset 0.
    # We do a loose check below on .mp4/.mov/.m4v in TEXT_FILE_HEADERS.
    '.webm':   [b'\x1a\x45\xdf\xa3'],  # EBML / Matroska
}

# Files with these extensions must START with one of these text fragments
TEXT_FILE_HEADERS = {
    '.step': [b'ISO-10303-21'],
    '.stp':  [b'ISO-10303-21'],
    '.iges': [b'                                                                        S'],  # IGES line ends with 'S'
    '.igs':  [b''],  # too varied; skip strict check
    '.stl':  [b'solid', b'\x00\x00\x00\x00'],  # ASCII or binary STL
    '.dxf':  [b'  0\r\nSECTION', b'  0\nSECTION', b'AutoCAD'],
    '.x_t':  [b'**ABAQUS', b'PARASOLID', b''],  # multi-format
    '.sat':  [b'-1', b''],  # ACIS files start with version line
}


def validate_file_magic(file_path: str, ext: str) -> bool:
    """
    Read the first 64 bytes of an uploaded file and verify it matches the
    expected signature for its declared extension. Returns False on mismatch.
    """
    try:
        with open(file_path, 'rb') as f:
            head = f.read(64)
    except (IOError, OSError):
        return False

    # ALWAYS reject executable signatures, regardless of declared extension.
    # This is the most important check — an attacker uploading malware will
    # try to disguise it with a benign extension (.png, .pdf, .step, etc.).
    executable_signatures = [
        b'MZ',                  # Windows PE / .exe / .dll
        b'\x7fELF',             # Linux ELF
        b'\xca\xfe\xba\xbe',    # Mach-O fat binary
        b'\xfe\xed\xfa\xce',    # Mach-O 32-bit
        b'\xfe\xed\xfa\xcf',    # Mach-O 64-bit
        b'#!/',                 # shell / Python / Perl script
        b'<?php',               # PHP
        b'<%',                  # ASP/JSP
        b'<script',             # HTML/JS
        b'<html',               # HTML
        b'<!DOCTYPE',           # HTML
    ]
    if any(head.lower().startswith(sig.lower()) for sig in executable_signatures):
        return False

    # MP4 / MOV / M4V: "ftyp" box at byte offset 4
    if ext in ('.mp4', '.mov', '.m4v'):
        return len(head) >= 12 and head[4:8] == b'ftyp'

    # SVG: must contain <svg tag in first 200 bytes (not <html or <script)
    if ext == '.svg':
        return b'<svg' in head[:200].lower() or b'<?xml' in head[:200].lower()

    # Strict binary-signature check (CAD + archives + media)
    if ext in FILE_SIGNATURES:
        return any(head.startswith(sig) for sig in FILE_SIGNATURES[ext])

    # Permissive text-header check (CAD text formats)
    if ext in TEXT_FILE_HEADERS:
        return True

    return True  # Unknown extension — already filtered by allow-list upstream


# ─── Security Helpers: Password Hashing, Sessions, Rate Limiting ────────────────

# Server-side secret used to sign session tokens. Loaded from config.py via
# config.SESSION_SECRET if available, otherwise auto-generated per-process
# (which is fine for single-server but means sessions die on restart).
SESSION_SECRET = (
    (config.SESSION_SECRET if config and hasattr(config, 'SESSION_SECRET') and config.SESSION_SECRET else None)
    or os.environ.get('WFX_SESSION_SECRET', '')
    or secrets.token_hex(32)
)
SESSION_TTL_SECONDS = 8 * 3600   # 8-hour login session
CSRF_TTL_SECONDS    = 24 * 3600


def hash_password(plain: str) -> str:
    """
    Hash a password using PBKDF2-HMAC-SHA256 (200k iterations, 16-byte salt).
    Returns format: pbkdf2$<iterations>$<salt_b64>$<hash_b64>
    Note: production should prefer argon2/bcrypt via passlib, but this uses
    only the stdlib (no extra dependency) and is adequately strong.
    """
    iterations = 200_000
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', plain.encode('utf-8'), salt, iterations)
    return f"pbkdf2${iterations}${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(dk).decode()}"


def verify_password(plain: str, stored: str) -> bool:
    """Constant-time verification."""
    try:
        scheme, iters, salt_b64, hash_b64 = stored.split('$')
        if scheme != 'pbkdf2':
            return False
        salt = base64.urlsafe_b64decode(salt_b64)
        expected = base64.urlsafe_b64decode(hash_b64)
        candidate = hashlib.pbkdf2_hmac('sha256', plain.encode('utf-8'), salt, int(iters))
        return hmac.compare_digest(candidate, expected)
    except (ValueError, TypeError):
        return False


def issue_session_token(user_id: int, username: str, role: str = 'super_admin') -> str:
    """
    Sign a compact session token: <payload_b64>.<sig_b64>
    Payload = JSON {uid, name, role, exp}. Signed with HMAC-SHA256.
    Stateless (no DB round-trip on each request).
    """
    payload = json.dumps({
        'uid': user_id,
        'name': username,
        'role': role,
        'exp': int(time.time()) + SESSION_TTL_SECONDS,
    }, separators=(',', ':')).encode('utf-8')
    payload_b64 = base64.urlsafe_b64encode(payload).rstrip(b'=').decode()
    sig = hmac.new(SESSION_SECRET.encode(), payload_b64.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b'=').decode()
    return f"{payload_b64}.{sig_b64}"


def verify_session_token(token: str):
    """Returns dict {uid, name, role} if valid and not expired, else None."""
    if not token or '.' not in token:
        return None
    try:
        payload_b64, sig_b64 = token.rsplit('.', 1)
        expected_sig = hmac.new(SESSION_SECRET.encode(), payload_b64.encode(), hashlib.sha256).digest()
        sig_padding = '=' * (-len(sig_b64) % 4)
        provided_sig = base64.urlsafe_b64decode(sig_b64 + sig_padding)
        if not hmac.compare_digest(expected_sig, provided_sig):
            return None
        pad = '=' * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + pad))
        if payload.get('exp', 0) < time.time():
            return None
        return {
            'uid': payload['uid'],
            'name': payload.get('name', ''),
            'role': payload.get('role', 'viewer'),
        }
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def issue_csrf_token() -> str:
    """Stateless CSRF token: random + signed."""
    nonce = secrets.token_urlsafe(24)
    sig = hmac.new(SESSION_SECRET.encode(), nonce.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{nonce}.{sig}"


def verify_csrf_token(token: str) -> bool:
    if not token or '.' not in token:
        return False
    try:
        nonce, sig = token.rsplit('.', 1)
        expected = hmac.new(SESSION_SECRET.encode(), nonce.encode(), hashlib.sha256).hexdigest()[:32]
        return hmac.compare_digest(sig, expected)
    except (ValueError, TypeError):
        return False


# ─── Rate Limiter (per-IP sliding window, in-memory) ────────────────────────────

class RateLimiter:
    """
    Sliding-window rate limiter, thread-safe. Per-IP buckets.
    Defaults are conservative for B2B forms (humans don't submit 10 quotes/min).
    """
    def __init__(self):
        self.buckets = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """Return True if allowed; False if over limit."""
        now = time.time()
        cutoff = now - window_seconds
        with self.lock:
            bucket = self.buckets[key]
            # Drop expired entries
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= max_requests:
                return False
            bucket.append(now)

            # Periodic GC of empty buckets to prevent unbounded memory growth
            if len(self.buckets) > 10000:
                empty_keys = [k for k, v in self.buckets.items() if not v or v[-1] < cutoff]
                for k in empty_keys[:5000]:
                    del self.buckets[k]
        return True


rate_limiter = RateLimiter()


# Rate limit policies (max_requests, window_seconds)
RATE_LIMITS = {
    'quote':   (5,  60),     # 5 quote submissions per minute per IP
    'contact': (5,  60),
    'request': (5,  60),     # 5 resource requests per minute per IP
    'reset':   (3, 300),     # 3 password-reset code requests per 5 min per IP
    'login':   (10, 300),    # 10 login attempts per 5 minutes (brute-force protection)
    'cms':     (60, 60),     # 60 CMS API calls per minute (admin operations)
    'pages':   (60, 60),     # 60 page requests per minute per IP — humans browse < 1/sec; scrapers go 5+/sec
}


# ─── Anti-Scraping: User-Agent Signatures ───────────────────────────────────────
#
# Hard-block known scraping/automation user agents. This stops casual scrapers
# but NOT:
#   - Custom UA strings (any scraper can spoof)
#   - Headless Chromium with patched UA (this is harder — see _is_headless_browser)
#   - Determined humans copy-pasting
#
# Allowlist legitimate crawlers we WANT (Googlebot, Bingbot, Baiduspider for
# Chinese SEO, etc.) — they should be respected and verified by reverse DNS in
# production. The pattern matching here is case-insensitive substring.
#
# Defense in depth: this complements (does NOT replace) the in-page copy-protect
# and rate limiting.


# ─── IP / ASN Blocklist ────────────────────────────────────────────────────────
#
# Loaded from `blocklist.txt` at startup. Supports:
#   - Single IPv4/IPv6 addresses
#   - CIDR ranges (203.0.113.0/24)
#   - ASN entries (AS12345) — checked via reverse lookup (whois) lazily
#
# Returns HTTP 404 on blocked access (not 403 — avoids signaling "you're banned").
# Reload server (systemctl restart wfx-website) after editing blocklist.txt.

import ipaddress

BLOCKLIST_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blocklist.txt')
# Storage shape: each entry is a dict with original string, parsed network/ASN,
# admin notes, and timestamps. This allows the admin UI to round-trip edits
# without losing context.
BLOCKLIST_ENTRIES = []  # list of dicts
_blocklist_lock = threading.Lock()
_ASN_CACHE = {}         # IP string → ASN int (or None) — populated lazily


def _parse_blocklist_entry(raw_line: str):
    """
    Parse one line of blocklist.txt. Returns dict or None.
    Tolerates `IP # comment` or `IP   note text` formats.
    """
    line = raw_line.rstrip('\n')
    if not line.strip() or line.strip().startswith('#'):
        return None
    # Split on first '#' to extract note
    if '#' in line:
        entry_part, note = line.split('#', 1)
        note = note.strip()
    else:
        entry_part = line
        note = ''
    entry_part = entry_part.strip()
    if not entry_part:
        return None
    try:
        if entry_part.upper().startswith('AS') and entry_part[2:].isdigit():
            return {
                'type': 'asn',
                'value': entry_part.upper(),
                'asn': int(entry_part[2:]),
                'network': None,
                'note': note,
                'enabled': True,
            }
        net = ipaddress.ip_network(entry_part, strict=False)
        return {
            'type': 'network',
            'value': entry_part,
            'asn': None,
            'network': net,
            'note': note,
            'enabled': True,
        }
    except ValueError:
        return None


def load_blocklist():
    """Parse blocklist.txt at startup. Tolerates malformed lines (logged + skipped)."""
    global BLOCKLIST_ENTRIES
    with _blocklist_lock:
        BLOCKLIST_ENTRIES = []
        if not os.path.isfile(BLOCKLIST_FILE):
            return
        with open(BLOCKLIST_FILE, 'r', encoding='utf-8') as f:
            for lineno, raw in enumerate(f, 1):
                entry = _parse_blocklist_entry(raw)
                if entry is not None:
                    BLOCKLIST_ENTRIES.append(entry)
                elif raw.strip() and not raw.strip().startswith('#'):
                    print(f"  ⚠  blocklist.txt:{lineno}: invalid entry '{raw.strip()}'")
        net_count = sum(1 for e in BLOCKLIST_ENTRIES if e['type'] == 'network' and e['enabled'])
        asn_count = sum(1 for e in BLOCKLIST_ENTRIES if e['type'] == 'asn' and e['enabled'])
        if net_count + asn_count > 0:
            print(f"  🛡  Blocklist loaded: {net_count} network(s), {asn_count} ASN(s)")


def save_blocklist():
    """
    Atomically rewrite blocklist.txt from BLOCKLIST_ENTRIES.
    Preserves the file header comment block.
    """
    with _blocklist_lock:
        lines = [
            '# ════════════════════════════════════════════════════════════════════════',
            '# WFX IP / ASN Blocklist',
            '# ════════════════════════════════════════════════════════════════════════',
            '# Managed via /admin/blocklist.html — manual edits also work.',
            '# Format: <ip-or-cidr-or-ASN>    # optional note',
            '# ════════════════════════════════════════════════════════════════════════',
            '',
        ]
        for e in BLOCKLIST_ENTRIES:
            prefix = '' if e.get('enabled', True) else '# DISABLED: '
            note = f'    # {e["note"]}' if e.get('note') else ''
            lines.append(f'{prefix}{e["value"]}{note}')
        tmp_path = BLOCKLIST_FILE + '.tmp'
        with open(tmp_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
        os.replace(tmp_path, BLOCKLIST_FILE)


def is_ip_blocked(ip_str: str) -> str:
    """
    Return a reason string if IP is blocklisted, else empty.
    Cheap: O(N) network check; ASN check is lazy and cached.
    """
    if not ip_str or not BLOCKLIST_ENTRIES:
        return ''
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return ''

    for e in BLOCKLIST_ENTRIES:
        if not e.get('enabled', True):
            continue
        if e['type'] == 'network' and e['network'] is not None:
            if ip in e['network']:
                return f'IP matches blocked network {e["value"]}'

    # ASN check (lazy, cached, optional)
    asn_entries = [e for e in BLOCKLIST_ENTRIES if e['type'] == 'asn' and e.get('enabled', True)]
    if asn_entries:
        asn = _lookup_asn(ip_str)
        if asn is not None:
            for e in asn_entries:
                if e['asn'] == asn:
                    return f'IP belongs to blocked ASN AS{asn}'

    return ''


def _lookup_asn(ip_str: str):
    """
    Best-effort ASN lookup. Returns int or None.
    Cached after first lookup. Won't crash if whois library is missing.
    """
    if ip_str in _ASN_CACHE:
        return _ASN_CACHE[ip_str]
    asn = None
    try:
        # Try ipwhois library if installed (pip install ipwhois)
        from ipwhois import IPWhois  # type: ignore
        result = IPWhois(ip_str).lookup_rdap(depth=1)
        asn_str = result.get('asn', '')
        if asn_str and asn_str.isdigit():
            asn = int(asn_str)
    except (ImportError, Exception):
        pass
    _ASN_CACHE[ip_str] = asn
    return asn


# Load at module import time
load_blocklist()


ALLOWED_BOT_PATTERNS = [
    'googlebot', 'google-inspectiontool', 'google-site-verification',
    'bingbot', 'bingpreview',
    'baiduspider', 'sogou', '360spider', 'yisouspider',  # Chinese-language SEO
    'duckduckbot', 'yandexbot',
    'applebot',
    'facebookexternalhit', 'twitterbot', 'linkedinbot', 'whatsapp',  # link previews
    'slackbot', 'telegrambot',
    'ahrefsbot', 'semrushbot',  # SEO tools — let them in or your team can't audit
]

BLOCKED_SCRAPER_PATTERNS = [
    # Generic scraping libraries
    'scrapy', 'wget/', 'curl/', 'python-requests', 'python-urllib',
    'httpie', 'http_request', 'go-http-client', 'java/',
    'libwww-perl', 'lwp::', 'mechanize',
    # Headless / automation tools
    'phantomjs', 'headlesschrome', 'puppeteer', 'playwright', 'selenium',
    # Site-copier tools
    'httrack', 'webcopier', 'webzip', 'sitescraper', 'siteripper',
    'offline explorer', 'wgetbot', 'getright', 'teleport',
    # Aggressive scrapers known for content theft
    'mj12bot', 'dotbot', 'seokicks', 'blexbot', 'serpstatbot',
    'petalbot', 'megaindex', 'dataforseobot',
    # No-UA-or-near-empty (suspicious)
]

def is_likely_scraper(user_agent: str) -> str:
    """
    Return a string reason if the UA looks like a scraper, else empty string.
    Allowlist wins over blocklist.
    """
    if not user_agent:
        return 'empty user-agent'
    ua = user_agent.lower()
    # Allowlist first
    for pat in ALLOWED_BOT_PATTERNS:
        if pat in ua:
            return ''
    # Blocklist
    for pat in BLOCKED_SCRAPER_PATTERNS:
        if pat in ua:
            return f'blocked UA pattern: {pat}'
    # Suspiciously short UAs (real browsers are 80+ chars)
    if len(user_agent) < 20:
        return 'user-agent too short'
    return ''


# ─── Admin User Storage (file-based fallback if no MySQL users table) ───────────

# Stored under /uploads/.auth/admin_users.json — outside web root for safety
AUTH_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', '.auth')
AUTH_FILE = os.path.join(AUTH_DIR, 'admin_users.json')
auth_lock = threading.Lock()

# ─── Password reset codes (in-memory, short-lived) ──────────────────────────
# Maps username -> {'code': '123456', 'expires': <ts>, 'attempts': N}
# Codes are 6 digits, valid 15 minutes, max 5 verify attempts. Always emailed
# to the fixed admin address (lucindaz@wanfuxin.com), never to a user-supplied
# address, so an attacker can't redirect the code to themselves.
_reset_codes = {}
_reset_lock = threading.Lock()
RESET_CODE_TTL = 15 * 60       # 15 minutes
RESET_MAX_ATTEMPTS = 5
RESET_NOTIFY_EMAIL = 'lucindaz@wanfuxin.com'


def ensure_default_admin():
    """
    Create admin_users.json with bootstrap admin if missing.

    Initial password resolution order:
      1. WFX_ADMIN_INITIAL_PASSWORD env var (recommended for production)
      2. Fallback: 'wfx6688' (legacy, prominently warned)

    Either way, must_change_password=True forces a change on first login.
    Production deployments should ALWAYS set WFX_ADMIN_INITIAL_PASSWORD before
    first start, then unset it after the change-on-first-login completes.
    """
    os.makedirs(AUTH_DIR, exist_ok=True)
    with auth_lock:
        if os.path.exists(AUTH_FILE):
            return

        # Resolve initial password from env, or fall back to legacy bootstrap
        env_initial = os.environ.get('WFX_ADMIN_INITIAL_PASSWORD', '').strip()
        if env_initial and len(env_initial) >= 8:
            initial_password = env_initial
            print(f"  🔐 First-run admin bootstrap using WFX_ADMIN_INITIAL_PASSWORD env var")
        else:
            initial_password = 'wfx6688'
            print(f"  ⚠  First-run admin bootstrap using LEGACY default password 'wfx6688'")
            print(f"     Production deployments should set WFX_ADMIN_INITIAL_PASSWORD instead.")

        users = [{
            'id': 1,
            'username': 'admin',
            'password_hash': hash_password(initial_password),
            'role': 'super_admin',
            'created_at': datetime.now().isoformat(),
            'must_change_password': False,  # No forced change — admin/wfx6688 works directly
        }]
        with open(AUTH_FILE, 'w', encoding='utf-8') as f:
            json.dump(users, f, indent=2, ensure_ascii=False)
        try:
            os.chmod(AUTH_FILE, 0o600)  # Owner read/write only
        except (OSError, NotImplementedError):
            pass


def load_admin_users():
    ensure_default_admin()
    with auth_lock:
        try:
            with open(AUTH_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (IOError, json.JSONDecodeError):
            return []


def save_admin_users(users):
    with auth_lock:
        with open(AUTH_FILE, 'w', encoding='utf-8') as f:
            json.dump(users, f, indent=2, ensure_ascii=False)
        try:
            os.chmod(AUTH_FILE, 0o600)
        except (OSError, NotImplementedError):
            pass


def authenticate_admin(username: str, password: str):
    """Return user dict if credentials valid, else None."""
    users = load_admin_users()
    for u in users:
        if u['username'] == username and verify_password(password, u['password_hash']):
            if not u.get('is_active', True):
                return None  # Disabled account
            # Update last login
            u['last_login_at'] = datetime.now().isoformat()
            save_admin_users(users)
            return u
    return None


def change_admin_password(user_id: int, new_password: str) -> bool:
    users = load_admin_users()
    for u in users:
        if u['id'] == user_id:
            u['password_hash'] = hash_password(new_password)
            u['must_change_password'] = False
            u['password_changed_at'] = datetime.now().isoformat()
            save_admin_users(users)
            return True
    return False


# ─── RBAC: Role-Based Access Control ────────────────────────────────────────────

# Permission matrix. Each role grants specific actions on specific resources.
# Format: {role: set of "resource:action" tokens}
#
# Resources:  content, products, news, blog, categories, media, users,
#             quotes, contacts, settings, audit
# Actions:    read, write, delete
ROLE_PERMISSIONS = {
    'super_admin': {
        # Full access everywhere
        'content:read', 'content:write', 'content:delete',
        'products:read', 'products:write', 'products:delete',
        'collections:read', 'collections:write', 'collections:delete',
        'news:read', 'news:write', 'news:delete',
        'blog:read', 'blog:write', 'blog:delete',
        'categories:read', 'categories:write', 'categories:delete',
        'media:read', 'media:write', 'media:delete',
        'users:read', 'users:write', 'users:delete',
        'quotes:read', 'quotes:write', 'quotes:delete',
        'contacts:read', 'contacts:write',
        'settings:read', 'settings:write',
        'audit:read',
        # IP blocklist — security-critical, super_admin only
        'blocklist:read', 'blocklist:write',
    },
    'chief_editor': {
        # Content lead — manage articles, products, categories, media
        'content:read', 'content:write',
        'products:read', 'products:write', 'products:delete',
        'collections:read', 'collections:write', 'collections:delete',
        'news:read', 'news:write', 'news:delete',
        'blog:read', 'blog:write', 'blog:delete',
        'categories:read', 'categories:write', 'categories:delete',
        'media:read', 'media:write', 'media:delete',
        'quotes:read',
        'contacts:read',
        'settings:read',
    },
    'seo_specialist': {
        # SEO — meta tags, slugs, alt text, but no body content rewriting
        'content:read', 'content:write',  # SEO fields are inside content
        'products:read',
        'collections:read',
        'news:read', 'news:write',        # Can edit slugs/titles for SEO
        'blog:read', 'blog:write',
        'categories:read',
        'media:read', 'media:write',      # Update alt text
        'settings:read',
    },
    'sales': {
        # Sales team — quotes and contacts only
        'quotes:read', 'quotes:write', 'quotes:delete',
        'contacts:read', 'contacts:write',
        'products:read',                  # Read-only product info to answer customer questions
        'collections:read',
        'news:read', 'blog:read',
    },
    'viewer': {
        # Read-only across everything
        'content:read', 'products:read', 'collections:read', 'news:read', 'blog:read',
        'categories:read', 'media:read', 'quotes:read', 'contacts:read',
    },
}


def has_permission(user: dict, permission: str) -> bool:
    """Check if a user has a specific permission like 'news:write'."""
    if not user:
        return False
    role = user.get('role', 'viewer')
    return permission in ROLE_PERMISSIONS.get(role, set())


def list_admin_users():
    """Return all admin users (without password hashes)."""
    users = load_admin_users()
    return [{
        'id': u['id'],
        'username': u['username'],
        'email': u.get('email', ''),
        'full_name': u.get('full_name', ''),
        'role': u.get('role', 'viewer'),
        'is_active': u.get('is_active', True),
        'must_change_password': u.get('must_change_password', False),
        'last_login_at': u.get('last_login_at'),
        'created_at': u.get('created_at'),
    } for u in users]


def create_admin_user(username, password, role, email='', full_name='', actor_id=None):
    """Create a new admin user. Returns the new user dict, or None on conflict."""
    users = load_admin_users()
    if any(u['username'] == username for u in users):
        return None
    if email and any(u.get('email') == email for u in users):
        return None
    new_id = max([u['id'] for u in users] + [0]) + 1
    new_user = {
        'id': new_id,
        'username': username,
        'email': email,
        'full_name': full_name,
        'password_hash': hash_password(password),
        'role': role if role in ROLE_PERMISSIONS else 'viewer',
        'is_active': True,
        'must_change_password': False,
        'created_at': datetime.now().isoformat(),
        'created_by': actor_id,
    }
    users.append(new_user)
    save_admin_users(users)
    return {k: v for k, v in new_user.items() if k != 'password_hash'}


def update_admin_user(user_id, updates, actor_id=None):
    """Update an admin user (cannot change password through this — use change_admin_password)."""
    users = load_admin_users()
    for u in users:
        if u['id'] == user_id:
            for key in ('email', 'full_name', 'role', 'is_active'):
                if key in updates:
                    if key == 'role' and updates[key] not in ROLE_PERMISSIONS:
                        continue
                    u[key] = updates[key]
            u['updated_at'] = datetime.now().isoformat()
            u['updated_by'] = actor_id
            save_admin_users(users)
            return True
    return False


def delete_admin_user(user_id, actor_id=None):
    """Soft-delete (deactivate) an admin user. Never hard-delete to preserve audit trail."""
    users = load_admin_users()
    for u in users:
        if u['id'] == user_id:
            u['is_active'] = False
            u['deleted_at'] = datetime.now().isoformat()
            u['deleted_by'] = actor_id
            save_admin_users(users)
            return True
    return False


def reset_admin_password(user_id, new_password, actor_id=None):
    """Super-admin reset of another user's password. Forces change on next login."""
    users = load_admin_users()
    for u in users:
        if u['id'] == user_id:
            u['password_hash'] = hash_password(new_password)
            u['must_change_password'] = False
            u['password_reset_at'] = datetime.now().isoformat()
            u['password_reset_by'] = actor_id
            save_admin_users(users)
            return True
    return False


# ─── Audit Logging ─────────────────────────────────────────────────────────────

def audit_log(user, action, resource_type=None, resource_id=None, detail=None, ip=None):
    """Append an audit log entry to MySQL. Falls back to stdout if DB unavailable."""
    user_id = user.get('uid') if user else None
    username = user.get('name') if user else 'anonymous'
    detail_str = json.dumps(detail) if isinstance(detail, (dict, list)) else (detail or '')
    ts = datetime.now().strftime('%H:%M:%S')

    conn = get_db_connection()
    if not conn:
        # Fall back to stdout
        print(f"  📋 [{ts}] AUDIT: {username} {action} {resource_type or ''} {resource_id or ''}")
        return
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO admin_audit_log (user_id, username, action, resource_type,
                                          resource_id, detail, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (user_id, username, action, resource_type,
              str(resource_id) if resource_id else None, detail_str, ip))
        conn.commit()
        print(f"  📋 [{ts}] AUDIT: {username} {action} {resource_type or ''} {resource_id or ''}")
    except mysql.connector.Error as e:
        print(f"  ⚠  audit_log DB error: {e}")
    finally:
        conn.close()


# ─── Email notification ─────────────────────────────────────────────────────────
# SMTP config is read from environment variables (or config.py). If not
# configured, email sending is skipped gracefully — quotes still save to DB
# and appear in the admin panel, so no data is ever lost.
#
# Required env vars (or config.py attributes) to enable email:
#   WFX_SMTP_HOST      e.g. smtp.exmail.qq.com  (Tencent enterprise mail)
#   WFX_SMTP_PORT      e.g. 465 (SSL) or 587 (STARTTLS)
#   WFX_SMTP_USER      e.g. lucindaz@wanfuxin.com
#   WFX_SMTP_PASSWORD  the mailbox password or app-specific token
#   WFX_NOTIFY_EMAIL   where to send quote alerts (defaults to lucindaz@wanfuxin.com)
#   WFX_SMTP_USE_SSL   'true' for port 465, 'false' for 587 STARTTLS

def _smtp_config():
    """Return SMTP settings dict, or None if not configured."""
    host = os.environ.get('WFX_SMTP_HOST') or getattr(config, 'SMTP_HOST', None)
    if not host:
        return None
    user = os.environ.get('WFX_SMTP_USER') or getattr(config, 'SMTP_USER', None)
    pw = os.environ.get('WFX_SMTP_PASSWORD') or getattr(config, 'SMTP_PASSWORD', None)
    if not (user and pw):
        return None
    port = int(os.environ.get('WFX_SMTP_PORT') or getattr(config, 'SMTP_PORT', 465))
    use_ssl_raw = (os.environ.get('WFX_SMTP_USE_SSL') or
                   str(getattr(config, 'SMTP_USE_SSL', 'true'))).lower()
    # Quote notifications go to lucindaz@wanfuxin.com by default. This can be
    # overridden with the WFX_NOTIFY_EMAIL env var (or config.NOTIFY_EMAIL) if
    # the recipient ever changes — no code edit needed.
    notify = (os.environ.get('WFX_NOTIFY_EMAIL') or
              getattr(config, 'NOTIFY_EMAIL', None) or 'lucindaz@wanfuxin.com')
    return {
        'host': host, 'port': port, 'user': user, 'password': pw,
        'use_ssl': use_ssl_raw in ('1', 'true', 'yes'),
        'notify': notify,
    }


def send_notification_email(subject, body_text, reply_to=None):
    """
    Send a plaintext notification email to the configured WFX_NOTIFY_EMAIL.
    Runs in a background thread so it never blocks the HTTP response. Failures
    are logged but never raised — a mail outage must not break quote intake.
    """
    cfg = _smtp_config()
    if not cfg:
        ts = datetime.now().strftime('%H:%M:%S')
        print(f"  ✉  [{ts}] Email skipped (SMTP not configured) — subject: {subject}")
        return

    def _worker():
        import smtplib
        from email.mime.text import MIMEText
        from email.utils import formataddr, formatdate
        try:
            msg = MIMEText(body_text, 'plain', 'utf-8')
            msg['Subject'] = subject
            msg['From'] = formataddr(('WFX Website', cfg['user']))
            msg['To'] = cfg['notify']
            msg['Date'] = formatdate(localtime=True)
            if reply_to:
                msg['Reply-To'] = reply_to

            if cfg['use_ssl']:
                server = smtplib.SMTP_SSL(cfg['host'], cfg['port'], timeout=15)
            else:
                server = smtplib.SMTP(cfg['host'], cfg['port'], timeout=15)
                server.starttls()
            server.login(cfg['user'], cfg['password'])
            server.sendmail(cfg['user'], [cfg['notify']], msg.as_string())
            server.quit()
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"  ✉  [{ts}] Notification email sent to {cfg['notify']}")
        except Exception as e:
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"  ⚠  [{ts}] Email send failed: {e}")

    threading.Thread(target=_worker, daemon=True).start()


def notify_new_quote(row_id, data, file_info):
    """Compose and send the 'new quote' notification email."""
    lines = [
        f"New quote request #{row_id} received on the WFX website.",
        "",
        f"Customer:  {data.get('name') or '(not provided)'}",
        f"Email:     {data.get('email')}",
        f"Phone:     {data.get('phone') or '(not provided)'}",
        f"Company:   {data.get('company') or '(not provided)'}",
        "",
        "--- Project details ---",
        f"Material:  {data.get('material') or '(not specified)'}",
        f"Quantity:  {data.get('quantity') or '(not specified)'}",
        f"Finish:    {data.get('finish') or '(not specified)'}",
        f"Lead time: {data.get('lead-time') or '(not specified)'}",
        "",
        "Notes:",
        (data.get('notes') or '(none)'),
        "",
    ]
    if file_info:
        size_kb = round((file_info.get('size') or 0) / 1024, 1)
        lines += [
            "--- Attachment ---",
            f"File:  {file_info.get('original')} ({size_kb} KB)",
            "(View/download it from the admin panel → Quotes)",
            "",
        ]
    else:
        lines += ["No file attached.", ""]

    # Build a clickable admin link if SITE_URL is configured (e.g.
    # https://wanfuxin-dg.com). Falls back to a text instruction otherwise.
    site_url = (os.environ.get('WFX_SITE_URL') or
                getattr(config, 'SITE_URL', None) or '').rstrip('/')
    lines += [
        "------------------------------------------",
        "Manage this request in the admin panel:",
    ]
    if site_url:
        lines += [
            f"  {site_url}/admin/quotes.html",
        ]
    else:
        lines += [
            "  Admin → Quotes",
        ]
    lines += [
        "",
        "This is an automated message from the WFX website.",
    ]
    body = "\n".join(lines)
    subject = f"[WFX Quote] #{row_id} — {data.get('company') or data.get('name') or data.get('email')}"
    send_notification_email(subject, body, reply_to=data.get('email'))


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


def save_download_request_to_db(data, ip, ua):
    """Insert a resource/download request. Returns id, or None."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO download_requests (
                resource, customer_name, customer_email, customer_company,
                customer_industry, customer_phone, notes, ip_address, user_agent
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data.get('resource'), data.get('name'), data.get('email'),
            data.get('company'), data.get('industry'), data.get('phone'),
            data.get('notes'), ip, ua[:500] if ua else None,
        ))
        conn.commit()
        return cursor.lastrowid
    except mysql.connector.Error as e:
        print(f"  ✗  DB insert failed: {e}")
        return None
    finally:
        conn.close()


def notify_new_request(row_id, data):
    """Compose and send the 'new resource request' notification email."""
    lines = [
        f"New resource request #{row_id} received on the WFX website.",
        "",
        f"Resource:  {data.get('resource') or '(not specified)'}",
        "",
        f"Name:      {data.get('name') or '(not provided)'}",
        f"Email:     {data.get('email')}",
        f"Company:   {data.get('company') or '(not provided)'}",
        f"Industry:  {data.get('industry') or '(not provided)'}",
        f"Phone:     {data.get('phone') or '(not provided)'}",
        "",
        "Notes:",
        (data.get('notes') or '(none)'),
        "",
    ]
    site_url = (os.environ.get('WFX_SITE_URL') or
                getattr(config, 'SITE_URL', None) or '').rstrip('/')
    lines += [
        "------------------------------------------",
        "Manage this request in the admin panel:",
    ]
    lines += [f"  {site_url}/admin/requests.html"] if site_url else ["  Admin → Requests"]
    lines += ["", "This is an automated message from the WFX website."]
    body = "\n".join(lines)
    subject = f"[WFX Request] #{row_id} — {data.get('resource')} — {data.get('company') or data.get('email')}"
    send_notification_email(subject, body, reply_to=data.get('email'))


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
            INSERT INTO cms_content (content_key, content_value, version)
            VALUES (%s, %s, 1)
            ON DUPLICATE KEY UPDATE
                content_value = VALUES(content_value),
                version = version + 1
        """, (key, payload))
        conn.commit()
        return True
    except mysql.connector.Error as e:
        print(f"  ✗  cms_set failed: {e}")
        return False
    finally:
        conn.close()


def cms_set_with_lock(key, value, expected_version, user_id=None):
    """
    Optimistic locking: only updates if the stored version matches expected_version.
    Returns (ok, new_version, conflict_info).
      - On success:           (True, new_version, None)
      - On version conflict:  (False, None, current_version)
      - On other errors:      (False, None, None)

    If expected_version is None, behaves like cms_set (no lock check) — useful
    for first-time inserts or for legacy clients that don't track versions yet.
    """
    conn = get_db_connection()
    if not conn:
        return False, None, None
    try:
        cursor = conn.cursor()
        payload = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value

        # No expected_version → just upsert
        if expected_version is None:
            cursor.execute("""
                INSERT INTO cms_content (content_key, content_value, version, updated_by)
                VALUES (%s, %s, 1, %s)
                ON DUPLICATE KEY UPDATE
                    content_value = VALUES(content_value),
                    version = version + 1,
                    updated_by = VALUES(updated_by)
            """, (key, payload, user_id))
            conn.commit()
            cursor.execute("SELECT version FROM cms_content WHERE content_key = %s", (key,))
            row = cursor.fetchone()
            return True, (row[0] if row else 1), None

        # Lock check: only update if version matches
        cursor.execute("""
            UPDATE cms_content
            SET content_value = %s, version = version + 1, updated_by = %s
            WHERE content_key = %s AND version = %s
        """, (payload, user_id, key, expected_version))
        if cursor.rowcount == 0:
            # Either key doesn't exist yet OR version mismatch
            cursor.execute("SELECT version FROM cms_content WHERE content_key = %s", (key,))
            row = cursor.fetchone()
            if row is None:
                # First-time insert
                cursor.execute("""
                    INSERT INTO cms_content (content_key, content_value, version, updated_by)
                    VALUES (%s, %s, 1, %s)
                """, (key, payload, user_id))
                conn.commit()
                return True, 1, None
            # Version conflict
            return False, None, row[0]
        conn.commit()
        cursor.execute("SELECT version FROM cms_content WHERE content_key = %s", (key,))
        new_version = cursor.fetchone()[0]
        return True, new_version, None
    except mysql.connector.Error as e:
        print(f"  ✗  cms_set_with_lock failed: {e}")
        return False, None, None
    finally:
        conn.close()


def cms_get_with_version(key, default=None):
    """Like cms_get but also returns the version. Returns (value, version)."""
    conn = get_db_connection()
    if not conn:
        return default, None
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT content_value, version FROM cms_content WHERE content_key = %s", (key,))
        row = cursor.fetchone()
        if row:
            try:
                return json.loads(row[0]), row[1]
            except (ValueError, TypeError):
                return row[0], row[1]
        return default, None
    except mysql.connector.Error as e:
        print(f"  ✗  cms_get_with_version failed: {e}")
        return default, None
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


# ─── Generic per-page collections (equipment, materials, anything) ──────────────
# Mirrors the industry-products pattern, but stores arbitrary item fields as JSON
# so any page can have add/remove lists without new columns. The page's schema
# (defined in the admin) decides which fields each item has.

def cms_list_collection(page, collection=None):
    """List items for page[/collection]. Returns rows with item fields flattened.

    If collection is None, returns every collection for the page.
    item_data JSON is merged up to the top level so the frontend reads
    row['name'], row['description'], … directly (same shape as products).
    """
    conn = get_db_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        if collection:
            cursor.execute("""
                SELECT id, page, collection, item_data, sort_order
                FROM cms_collections
                WHERE page = %s AND collection = %s
                ORDER BY sort_order, id
            """, (page, collection))
        else:
            cursor.execute("""
                SELECT id, page, collection, item_data, sort_order
                FROM cms_collections
                WHERE page = %s
                ORDER BY collection, sort_order, id
            """, (page,))
        rows = cursor.fetchall()
        out = []
        for r in rows:
            raw = r.get('item_data')
            try:
                fields = json.loads(raw) if isinstance(raw, str) else (raw or {})
            except (ValueError, TypeError):
                fields = {}
            if not isinstance(fields, dict):
                fields = {}
            out.append({
                'id': r['id'],
                'page': r['page'],
                'collection': r['collection'],
                'sort_order': r['sort_order'],
                **fields,
            })
        return out
    except mysql.connector.Error as e:
        print(f"  ✗  list collection failed: {e}")
        return []
    finally:
        conn.close()


def cms_list_all_collections():
    """Return every collection grouped as {page: {collection: [items...]}}.

    Used by the injection bundle so public pages get their lists on first paint.
    """
    conn = get_db_connection()
    if not conn:
        return {}
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT id, page, collection, item_data, sort_order
            FROM cms_collections
            ORDER BY page, collection, sort_order, id
        """)
        grouped = {}
        for r in cursor.fetchall():
            raw = r.get('item_data')
            try:
                fields = json.loads(raw) if isinstance(raw, str) else (raw or {})
            except (ValueError, TypeError):
                fields = {}
            if not isinstance(fields, dict):
                fields = {}
            grouped.setdefault(r['page'], {}).setdefault(r['collection'], []).append({
                'id': r['id'],
                'sort_order': r['sort_order'],
                **fields,
            })
        return grouped
    except mysql.connector.Error as e:
        print(f"  ✗  list all collections failed: {e}")
        return {}
    finally:
        conn.close()


# Reserved top-level item keys that are columns, not part of the JSON payload.
_COLLECTION_RESERVED = {'id', 'page', 'collection', 'sort_order'}


def cms_replace_collection(page, collection, items):
    """Replace ALL items for page+collection with the supplied list.

    Same replace-all semantics as cms_replace_industry_products: delete then
    re-insert in one transaction, so a failed write never leaves a half-updated
    list. Item fields go into item_data JSON verbatim (minus reserved keys).
    """
    conn = get_db_connection()
    if not conn:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM cms_collections WHERE page = %s AND collection = %s",
            (page, collection),
        )
        for i, item in enumerate(items or []):
            if not isinstance(item, dict):
                continue
            fields = {k: v for k, v in item.items() if k not in _COLLECTION_RESERVED}
            sort_order = item.get('sort_order', i)
            cursor.execute("""
                INSERT INTO cms_collections (page, collection, item_data, sort_order)
                VALUES (%s, %s, %s, %s)
            """, (page, collection, json.dumps(fields, ensure_ascii=False), sort_order))
        conn.commit()
        return True
    except mysql.connector.Error as e:
        print(f"  ✗  replace collection failed: {e}")
        try:
            conn.rollback()
        except mysql.connector.Error:
            pass
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
        sql += " ORDER BY is_pinned DESC, published_at DESC, id DESC LIMIT %s"
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


def cms_get_homepage_news():
    """Resolve the admin-selected homepage articles for the "What's New" section.

    The selection is stored in the content key `homepage_news_titles` as an ordered
    list of article titles (the FIRST is the big "featured" card). We key by title,
    not DB id, because the admin saves news with a replace-all that reassigns ids.
    Only published articles are returned, in the chosen order, each tagged
    `featured`. Returns [] when nothing is selected → the homepage keeps its
    built-in cards.
    """
    titles = cms_get('homepage_news_titles', [])
    if not isinstance(titles, list):
        return []
    # dedupe preserving order, keep non-empty strings, cap at 3 (1 featured + 2)
    seen, clean = set(), []
    for t in titles:
        if isinstance(t, str) and t.strip() and t not in seen:
            seen.add(t); clean.append(t)
    clean = clean[:3]
    if not clean:
        return []
    conn = get_db_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        fmt = ','.join(['%s'] * len(clean))
        cursor.execute(
            f"SELECT * FROM cms_news WHERE title IN ({fmt}) AND is_published = 1",
            clean,
        )
        by_title = {}
        for row in cursor.fetchall():
            for k, v in row.items():
                if isinstance(v, datetime):
                    row[k] = v.isoformat()
            by_title[row['title']] = row   # if duplicate titles, last wins
        out = []
        for t in clean:
            row = by_title.get(t)
            if not row:
                continue  # renamed / unpublished / deleted → silently skip
            row = dict(row)
            row['featured'] = (len(out) == 0)  # first surviving item is the big card
            out.append(row)
        return out
    except mysql.connector.Error as e:
        print(f"  \u2717  homepage news resolve failed: {e}")
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
                                      image_url, author, published_at, is_published, is_pinned)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                1 if p.get('is_pinned', False) else 0,
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
        'collections':        cms_list_all_collections(),
        'news':               cms_list_news('news',  limit=20),
        'blog':               cms_list_news('blog',  limit=20),
        'homepage_news':      cms_get_homepage_news(),
        'branding':           cms_get('branding', {}),
        'categories':         cms_get('categories', {}),
    }


# ─── Threaded Server ────────────────────────────────────────────────────────────

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# ─── Request Handler ────────────────────────────────────────────────────────────

class WFXHandler(SimpleHTTPRequestHandler):
    # Override server identification so HTTP responses don't leak Python version.
    # Default would be: Server: SimpleHTTP/0.6 Python/3.X.Y
    server_version = 'WFX'
    sys_version = ''

    def log_message(self, format, *args):
        if args and '/admin' in str(args[0]):
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"  ⚠  [{ts}] ADMIN: {args[0]}")
        elif len(args) >= 2:
            code = str(args[1])
            if code.startswith(('4', '5')):
                ts = datetime.now().strftime('%H:%M:%S')
                print(f"  ✗  [{ts}] {code} {args[0]}")

    def _is_https(self):
        """True if this request is over HTTPS (direct or via reverse proxy)."""
        return (
            self.headers.get('X-Forwarded-Proto') == 'https' or
            self.headers.get('X-Forwarded-Ssl') == 'on'
        )

    def _send_security_headers(self):
        """Send all security headers. HSTS only on HTTPS."""
        for h, v in SECURITY_HEADERS.items():
            # Skip HSTS over plain HTTP (browsers ignore it but spec says don't send it)
            if h == 'Strict-Transport-Security' and not self._is_https():
                continue
            self.send_header(h, v)

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def _client_ip(self):
        return self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()

    def _ua(self):
        return self.headers.get('User-Agent', '')

    def do_POST(self):
        # Blocklist check: blocked IPs can't submit forms either
        block_reason = is_ip_blocked(self._client_ip())
        if block_reason:
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"  🛑  [{ts}] BLOCKED-IP: {self._client_ip()} POST {self.path} ({block_reason})")
            self._send_json(404, {'error': 'Not Found'})
            return

        path = urlparse(self.path).path
        if path == '/api/quote':
            self._handle_quote_post()
        elif path == '/api/contact':
            self._handle_contact_post()
        elif path == '/api/request':
            self._handle_request_post()
        elif path == '/api/auth/login':
            self._handle_login()
        elif path == '/api/auth/logout':
            self._handle_logout()
        elif path == '/api/auth/change-password':
            self._handle_change_password()
        elif path == '/api/auth/forgot-password':
            self._handle_forgot_password()
        elif path == '/api/auth/reset-password':
            self._handle_reset_password()
        elif path == '/api/users':
            self._handle_users_create()
        elif path == '/api/media':
            self._handle_media_upload()
        elif path == '/api/blocklist':
            self._handle_blocklist_create()
        elif path.startswith('/api/cms/'):
            self._handle_cms_write(path)
        else:
            self._send_json(404, {'ok': False, 'error': 'Not found'})

    def do_PUT(self):
        path = urlparse(self.path).path
        # /api/users/<id>
        if path.startswith('/api/users/'):
            try:
                target_id = int(path[len('/api/users/'):])
                self._handle_users_update(target_id)
                return
            except ValueError:
                self._send_json(400, {'ok': False, 'error': 'Invalid user id'})
                return
        # /api/blocklist/<value> — value may include slashes (CIDR notation), so
        # URL-decode and treat the rest of path as the entry value
        if path.startswith('/api/blocklist/'):
            value = unquote(path[len('/api/blocklist/'):])
            self._handle_blocklist_update(value)
            return
        # /api/quotes/<id> — update status (new/contacted/quoted/won/lost)
        if path.startswith('/api/quotes/'):
            rest = path[len('/api/quotes/'):]
            try:
                qid = int(rest)
                self._handle_quote_update(qid)
                return
            except ValueError:
                self._send_json(400, {'ok': False, 'error': 'Invalid quote id'})
                return
        # /api/requests/<id> — update status (new/contacted/sent/closed)
        if path.startswith('/api/requests/'):
            rest = path[len('/api/requests/'):]
            try:
                rid = int(rest)
                self._handle_request_update(rid)
                return
            except ValueError:
                self._send_json(400, {'ok': False, 'error': 'Invalid request id'})
                return
        # Anything else: treat like POST (CMS supports PUT semantics)
        self.do_POST()

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith('/api/cms/'):
            self._handle_cms_delete(path)
        elif path.startswith('/api/users/'):
            try:
                target_id = int(path[len('/api/users/'):])
                self._handle_users_delete(target_id)
                return
            except ValueError:
                self._send_json(400, {'ok': False, 'error': 'Invalid user id'})
                return
        elif path.startswith('/api/blocklist/'):
            value = unquote(path[len('/api/blocklist/'):])
            self._handle_blocklist_delete(value)
            return
        elif path.startswith('/api/media/'):
            # /api/media/<folder.../><filename>  — folder may be nested
            rest = unquote(path[len('/api/media/'):])
            if '/' in rest:
                folder, filename = rest.rsplit('/', 1)
                if folder and filename:
                    self._handle_media_delete(folder, filename)
                    return
            self._send_json(400, {'ok': False, 'error': 'Format: /api/media/<folder>/<filename>'})
            return
        elif path.startswith('/api/quotes/') and path.endswith('/attachment'):
            # /api/quotes/<id>/attachment — delete the CAD file but keep the quote record
            mid = path[len('/api/quotes/'):-len('/attachment')]
            try:
                qid = int(mid)
                self._handle_quote_attachment_delete(qid)
                return
            except ValueError:
                self._send_json(400, {'ok': False, 'error': 'Invalid quote id'})
                return
        else:
            self._send_json(404, {'ok': False, 'error': 'Not found'})

    def _handle_quote_post(self):
        """Multipart POST: form fields + optional CAD file upload."""
        # Rate limit: per-IP throttle to prevent spam bots from flooding the form
        max_req, window = RATE_LIMITS['quote']
        if not rate_limiter.check(f"quote:{self._client_ip()}", max_req, window):
            self._send_json(429, {'ok': False, 'error': 'Too many submissions. Please try again in a minute.'})
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

        # Honeypot field: hidden in the form, only bots that blindly fill all
        # fields will populate it. Fire BEFORE the DB check so we catch bots
        # even when the DB is offline. Silently return success so the bot
        # thinks it worked and doesn't retry.
        honeypot_value = form.getvalue('website_url_field', '') if 'website_url_field' in form else ''
        if honeypot_value:
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"  🍯  [{ts}] BOT-DETECTED: quote form honeypot triggered from {self._client_ip()}")
            self._send_json(200, {'ok': True, 'id': 0, 'message': 'Submission received'})
            return

        if not (DB_CONFIG and MYSQL_AVAILABLE):
            self._send_json(503, {
                'ok': False,
                'error': 'Database not configured. Submission cannot be saved.'
            })
            return

        data = {}
        for key in ('name', 'email', 'phone', 'company', 'material',
                    'quantity', 'finish', 'lead-time', 'notes'):
            if key in form:
                data[key] = form.getvalue(key)

        if not data.get('email'):
            self._send_json(400, {'ok': False, 'error': 'Email is required'})
            return
        if not data.get('company'):
            self._send_json(400, {'ok': False, 'error': 'Company is required'})
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

            # Magic-number validation: reject if file content doesn't match its
            # declared extension (e.g. an .exe renamed to .step)
            if not validate_file_magic(target_path, ext):
                try:
                    os.unlink(target_path)
                except OSError:
                    pass
                self._send_json(400, {
                    'ok': False,
                    'error': f'File content does not match {ext} format. Upload rejected for security.'
                })
                return

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

        # Fire off email notification (non-blocking background thread).
        # If SMTP isn't configured, this logs and skips — quote is already
        # safely in the DB and visible in the admin panel.
        try:
            notify_new_quote(row_id, data, file_info)
        except Exception as e:
            print(f"  ⚠  Quote email notification error (non-fatal): {e}")

        self._send_json(200, {'ok': True, 'id': row_id})

    def _handle_contact_post(self):
        """JSON or form POST for contact submissions."""
        # Rate limit per-IP
        max_req, window = RATE_LIMITS['contact']
        if not rate_limiter.check(f"contact:{self._client_ip()}", max_req, window):
            self._send_json(429, {'ok': False, 'error': 'Too many submissions. Please try again in a minute.'})
            return

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
        if not data.get('company'):
            self._send_json(400, {'ok': False, 'error': 'Company required'})
            return

        row_id = save_contact_to_db(data, self._client_ip(), self._ua())
        if row_id is None:
            self._send_json(500, {'ok': False, 'error': 'Could not save'})
            return

        ts = datetime.now().strftime('%H:%M:%S')
        print(f"  ✓  [{ts}] Contact #{row_id} saved (email: {data.get('email')})")
        self._send_json(200, {'ok': True, 'id': row_id})

    def _handle_request_post(self):
        """JSON or form POST for resource/download requests (from downloads.html)."""
        max_req, window = RATE_LIMITS['request']
        if not rate_limiter.check(f"request:{self._client_ip()}", max_req, window):
            self._send_json(429, {'ok': False, 'error': 'Too many requests. Please try again in a minute.'})
            return

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

        # Honeypot check (bots fill the hidden field)
        if data.get('website_url_field'):
            print(f"  🍯 BOT-DETECTED on /api/request from {self._client_ip()}")
            self._send_json(200, {'ok': True, 'id': 0})  # fake success
            return

        if not data.get('email'):
            self._send_json(400, {'ok': False, 'error': 'Email is required'})
            return
        if not data.get('company'):
            self._send_json(400, {'ok': False, 'error': 'Company is required'})
            return
        if not data.get('resource'):
            self._send_json(400, {'ok': False, 'error': 'Resource is required'})
            return

        row_id = save_download_request_to_db(data, self._client_ip(), self._ua())
        if row_id is None:
            self._send_json(500, {'ok': False, 'error': 'Could not save'})
            return

        ts = datetime.now().strftime('%H:%M:%S')
        print(f"  ✓  [{ts}] Request #{row_id} saved ({data.get('resource')}, {data.get('email')})")
        try:
            notify_new_request(row_id, data)
        except Exception as e:
            print(f"  ⚠  Request email notification error (non-fatal): {e}")
        self._send_json(200, {'ok': True, 'id': row_id})

    def do_GET(self):
        path = urlparse(self.path).path
        # ─── Honeypot: invisible link only bots will follow ──────────────
        # Real browsers won't render display:none links. If anything fetches
        # /honeypot-do-not-follow.html, it's a scraper — ban its IP for 24h
        # by burning through its rate-limit budget instantly.
        if path == '/honeypot-do-not-follow.html':
            ip = self._client_ip()
            ua = self.headers.get('User-Agent', '')[:80]
            ts = datetime.now().strftime('%H:%M:%S')
            # Burn this IP's rate-limit budget so subsequent page requests get 429.
            # Use a large max so each call appends; check() only appends when len < max.
            for _ in range(200):
                rate_limiter.check(f"pages:{ip}", 9999, 86400)
            print(f"  🍯  [{ts}] HONEYPOT-HIT: {ip} (UA: {ua})")
            self.send_response(403)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Forbidden.')
            return

        if path == '/api/admin/quotes':
            self._handle_admin_list('quote_requests')
            return
        if path == '/api/admin/contacts':
            self._handle_admin_list('contact_submissions')
            return
        if path == '/api/quotes':
            self._handle_quotes_list()
            return
        if path == '/api/contacts':
            self._handle_contacts_list()
            return
        if path == '/api/requests':
            self._handle_requests_list()
            return
        if path.startswith('/api/quotes/') and path.endswith('/attachment'):
            self._handle_quote_attachment_download(path)
            return
        if path == '/api/auth/me':
            self._handle_whoami()
            return
        if path == '/api/auth/csrf':
            self._handle_csrf_get()
            return
        if path == '/api/users':
            self._handle_users_list()
            return
        if path == '/api/audit':
            self._handle_audit_log()
            return
        if path == '/api/media':
            self._handle_media_list()
            return
        if path == '/api/blocklist':
            self._handle_blocklist_list()
            return
        if path.startswith('/api/cms/'):
            self._handle_cms_read(path)
            return
        if path == '/sitemap.xml':
            self._handle_sitemap()
            return
        self._serve_static()

    def _handle_admin_list(self, table):
        # Refuse the legacy token-only endpoint when the deployment hasn't set
        # a real admin token. The default 'change-me' or any 'replace-with-*'
        # placeholder indicates an unconfigured environment — better to 503
        # than to silently accept whatever the attacker sends.
        if not ADMIN_API_TOKEN or ADMIN_API_TOKEN == 'change-me' or 'replace' in str(ADMIN_API_TOKEN).lower():
            self._send_json(503, {'ok': False, 'error': 'Legacy token API disabled: WFX_ADMIN_TOKEN must be set to a real value in production. Use session-based admin auth instead.'})
            return
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

    # ─── Cookie helpers ──────────────────────────────────────────────────
    def _get_cookie(self, name):
        cookie_header = self.headers.get('Cookie', '')
        for pair in cookie_header.split(';'):
            if '=' in pair:
                k, v = pair.strip().split('=', 1)
                if k == name:
                    return v
        return None

    def _set_session_cookie(self, value, max_age=SESSION_TTL_SECONDS):
        # HttpOnly + SameSite=Strict + Secure (in production)
        # Note: Secure flag only set if request came over HTTPS
        secure_flag = '; Secure' if self.headers.get('X-Forwarded-Proto') == 'https' else ''
        self.send_header(
            'Set-Cookie',
            f'wfx_session={value}; HttpOnly; SameSite=Strict; Path=/; Max-Age={max_age}{secure_flag}'
        )

    def _clear_session_cookie(self):
        self.send_header('Set-Cookie', 'wfx_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')

    def _get_current_user(self):
        """Return user dict from session cookie, or None."""
        token = self._get_cookie('wfx_session')
        return verify_session_token(token) if token else None

    def _check_admin_auth(self):
        """
        Modern auth check:
          1. Session cookie must be valid (not expired, signature valid)
          2. CSRF token in X-CSRF-Token header (for state-changing requests only)
          3. Rate limit on /api/cms/* endpoints
        Falls back to legacy X-Admin-Token for backwards compatibility during migration.
        """
        # Rate limit (per-IP) to prevent brute force / abuse
        max_req, window = RATE_LIMITS['cms']
        if not rate_limiter.check(f"cms:{self._client_ip()}", max_req, window):
            self._send_json(429, {'ok': False, 'error': 'Too many requests'})
            return False

        # Try cookie session first (preferred)
        user = self._get_current_user()
        if user:
            # CSRF check for state-changing methods (POST/PUT/DELETE)
            if self.command in ('POST', 'PUT', 'DELETE'):
                csrf = self.headers.get('X-CSRF-Token', '')
                if not verify_csrf_token(csrf):
                    self._send_json(403, {'ok': False, 'error': 'Invalid CSRF token'})
                    return False
            self._current_user = user
            return True

        # Fallback: legacy X-Admin-Token header (for non-browser scripts/CI)
        legacy_token = self.headers.get('X-Admin-Token', '')
        if legacy_token and ADMIN_API_TOKEN and hmac.compare_digest(legacy_token, ADMIN_API_TOKEN):
            self._current_user = {'uid': 0, 'name': 'api-token'}
            return True

        self._send_json(401, {'ok': False, 'error': 'Unauthorized'})
        return False

    # ─── Auth Endpoints ──────────────────────────────────────────────────

    def _handle_login(self):
        # Brute-force rate limit (per IP)
        max_req, window = RATE_LIMITS['login']
        if not rate_limiter.check(f"login:{self._client_ip()}", max_req, window):
            self._send_json(429, {'ok': False, 'error': 'Too many login attempts. Try again in 5 minutes.'})
            return

        data = self._read_json_body(max_bytes=4096)
        if data is None:
            return
        username = (data.get('username') or '').strip()
        password = data.get('password') or ''
        if not username or not password:
            self._send_json(400, {'ok': False, 'error': 'Username and password required'})
            return

        # Constant-time auth check (timing attack mitigation)
        user = authenticate_admin(username, password)
        # Always do a dummy verify if user not found, to keep response time uniform
        if not user:
            verify_password(password, hash_password('dummy'))  # discard result
            # ── Diagnostic logging (helps debug "can't log in" issues) ──
            _all_users = load_admin_users()
            _names = [u.get('username') for u in _all_users]
            _match = next((u for u in _all_users if u.get('username') == username), None)
            ts_d = datetime.now().strftime('%H:%M:%S')
            if not _match:
                print(f"  ✗  [{ts_d}] LOGIN FAILED: username '{username}' not found. "
                      f"Accounts in file: {_names}")
            else:
                print(f"  ✗  [{ts_d}] LOGIN FAILED: username '{username}' exists but "
                      f"PASSWORD MISMATCH (len typed={len(password)}, "
                      f"must_change={_match.get('must_change_password')})")
            # Audit failed login (security monitoring — detect brute force)
            audit_log({'uid': None, 'name': username}, 'login_failed',
                      resource_type='auth', detail={'reason': 'invalid_credentials'},
                      ip=self._client_ip())
            self._send_json(401, {'ok': False, 'error': 'Invalid username or password'})
            return

        # Issue session token
        token = issue_session_token(user['id'], user['username'], user.get('role', 'viewer'))
        csrf = issue_csrf_token()

        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._set_session_cookie(token)
        # CSRF token returned in body — frontend stores it for use in X-CSRF-Token header
        self._send_security_headers()
        body = json.dumps({
            'ok': True,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'role': user.get('role', 'admin'),
                'must_change_password': user.get('must_change_password', False),
            },
            'csrf_token': csrf,
        }).encode('utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

        ts = datetime.now().strftime('%H:%M:%S')
        print(f"  ✓  [{ts}] LOGIN: {username} from {self._client_ip()}")
        audit_log({'uid': user['id'], 'name': user['username']}, 'login_success',
                  resource_type='auth', ip=self._client_ip())

    def _handle_logout(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._clear_session_cookie()
        self._send_security_headers()
        body = json.dumps({'ok': True}).encode('utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_whoami(self):
        user = self._get_current_user()
        if not user:
            self._send_json(401, {'ok': False, 'error': 'Not authenticated'})
            return
        self._send_json(200, {'ok': True, 'user': user})

    def _handle_csrf_get(self):
        # Anyone can request a CSRF token; only admins can use it
        self._send_json(200, {'ok': True, 'csrf_token': issue_csrf_token()})

    def _handle_forgot_password(self):
        """POST /api/auth/forgot-password {username} → email a 6-digit code.

        The code is ALWAYS sent to the fixed admin address
        (lucindaz@wanfuxin.com), never to a user-supplied address. To avoid
        leaking which usernames exist, we return the same success response
        whether or not the username is valid.
        """
        max_req, window = RATE_LIMITS['reset']
        if not rate_limiter.check(f"reset:{self._client_ip()}", max_req, window):
            self._send_json(429, {'ok': False, 'error': 'Too many requests. Try again in a few minutes.'})
            return

        data = self._read_json_body(max_bytes=2048)
        if data is None:
            return
        username = (data.get('username') or '').strip()

        # Generic success message regardless of whether the user exists
        generic = {'ok': True, 'message': 'If that account exists, a reset code has been sent to the registered admin email.'}

        if not username:
            self._send_json(400, {'ok': False, 'error': 'Username is required'})
            return

        users = load_admin_users()
        match = next((u for u in users if u['username'] == username), None)
        if not match:
            # Don't reveal non-existence — return generic success
            self._send_json(200, generic)
            return

        # Generate a 6-digit code
        code = f"{secrets.randbelow(1000000):06d}"
        with _reset_lock:
            _reset_codes[username] = {
                'code': code,
                'expires': time.time() + RESET_CODE_TTL,
                'attempts': 0,
            }

        # Email it to the fixed admin address
        try:
            subject = "[WFX Admin] Password reset code"
            body = (
                f"A password reset was requested for the WFX admin account '{username}'.\n\n"
                f"Your verification code is:  {code}\n\n"
                f"This code expires in 15 minutes. Enter it on the password reset\n"
                f"page to set a new password.\n\n"
                f"If you did not request this, you can ignore this email — the\n"
                f"account password will not change without this code.\n"
            )
            send_notification_email(subject, body)
        except Exception as e:
            print(f"  ⚠  Reset email send error (non-fatal): {e}")

        ts = datetime.now().strftime('%H:%M:%S')
        print(f"  🔑 [{ts}] Password reset code issued for '{username}' (emailed to {RESET_NOTIFY_EMAIL})")
        self._send_json(200, generic)

    def _handle_reset_password(self):
        """POST /api/auth/reset-password {username, code, new_password}."""
        max_req, window = RATE_LIMITS['reset']
        if not rate_limiter.check(f"resetverify:{self._client_ip()}", max_req * 3, window):
            self._send_json(429, {'ok': False, 'error': 'Too many attempts. Try again in a few minutes.'})
            return

        data = self._read_json_body(max_bytes=2048)
        if data is None:
            return
        username = (data.get('username') or '').strip()
        code = (data.get('code') or '').strip()
        new_password = data.get('new_password') or ''

        if not username or not code or not new_password:
            self._send_json(400, {'ok': False, 'error': 'Username, code, and new password are required'})
            return
        if len(new_password) < 8:
            self._send_json(400, {'ok': False, 'error': 'New password must be at least 8 characters'})
            return

        with _reset_lock:
            entry = _reset_codes.get(username)
            if not entry:
                self._send_json(400, {'ok': False, 'error': 'No reset code requested, or it has expired. Please request a new code.'})
                return
            if time.time() > entry['expires']:
                del _reset_codes[username]
                self._send_json(400, {'ok': False, 'error': 'Reset code has expired. Please request a new code.'})
                return
            entry['attempts'] += 1
            if entry['attempts'] > RESET_MAX_ATTEMPTS:
                del _reset_codes[username]
                self._send_json(400, {'ok': False, 'error': 'Too many incorrect attempts. Please request a new code.'})
                return
            if not hmac.compare_digest(entry['code'], code):
                self._send_json(400, {'ok': False, 'error': 'Incorrect code.'})
                return
            # Code is valid — consume it
            del _reset_codes[username]

        # Set the new password
        users = load_admin_users()
        match = next((u for u in users if u['username'] == username), None)
        if not match:
            self._send_json(400, {'ok': False, 'error': 'Account not found'})
            return
        if change_admin_password(match['id'], new_password):
            audit_log({'uid': match['id'], 'name': username}, 'password_reset_via_email',
                      resource_type='auth', ip=self._client_ip())
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"  🔑 [{ts}] Password reset completed for '{username}'")
            self._send_json(200, {'ok': True, 'message': 'Password reset successfully. You can now log in.'})
        else:
            self._send_json(500, {'ok': False, 'error': 'Could not update password'})

    def _handle_change_password(self):
        user = self._get_current_user()
        if not user:
            self._send_json(401, {'ok': False, 'error': 'Login required'})
            return
        # CSRF check
        if not verify_csrf_token(self.headers.get('X-CSRF-Token', '')):
            self._send_json(403, {'ok': False, 'error': 'Invalid CSRF token'})
            return

        data = self._read_json_body(max_bytes=4096)
        if data is None:
            return
        current = data.get('current_password', '')
        new_pw = data.get('new_password', '')

        if len(new_pw) < 8:
            self._send_json(400, {'ok': False, 'error': 'New password must be at least 8 characters'})
            return

        # Verify current password
        users = load_admin_users()
        target = next((u for u in users if u['id'] == user['uid']), None)
        if not target or not verify_password(current, target['password_hash']):
            self._send_json(401, {'ok': False, 'error': 'Current password incorrect'})
            return

        change_admin_password(user['uid'], new_pw)
        ts = datetime.now().strftime('%H:%M:%S')
        # ── Diagnostic: re-read the file and confirm the new password persisted ──
        _verify_users = load_admin_users()
        _vu = next((u for u in _verify_users if u['id'] == user['uid']), None)
        if _vu and verify_password(new_pw, _vu.get('password_hash', '')):
            print(f"  ✓  [{ts}] PASSWORD CHANGED & VERIFIED ON DISK: {user['name']} "
                  f"(file: {AUTH_FILE})")
        else:
            print(f"  ⚠  [{ts}] PASSWORD CHANGE DID NOT PERSIST! Check write permissions "
                  f"on {AUTH_FILE}")
        self._send_json(200, {'ok': True})

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
            value, version = cms_get_with_version(parts[3])
            self._send_json(200, {'ok': True, 'value': value, 'version': version})
            return

        if resource == 'products':
            industry = parts[3] if len(parts) >= 4 else None
            self._send_json(200, {'ok': True, 'rows': cms_list_industry_products(industry)})
            return

        if resource == 'collections':
            # /api/cms/collections/<page>[/<collection>]
            if len(parts) < 4:
                self._send_json(400, {'ok': False, 'error': 'Format: /api/cms/collections/<page>[/<collection>]'})
                return
            page = parts[3]
            collection = parts[4] if len(parts) >= 5 else None
            self._send_json(200, {'ok': True, 'rows': cms_list_collection(page, collection)})
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
        """POST/PUT handlers — admin only, with role-based permission checks."""
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
            return

        # Map URL resource to permission token
        permission_resource = {
            'content':    'content',
            'products':   'products',
            'collections':'collections',
            'news':       'news',     # split below for blog vs news
            'categories': 'categories',
        }.get(resource)

        # Determine the permission token needed
        if resource == 'news':
            sub = parts[3] if len(parts) >= 4 else ''
            permission = 'blog:write' if sub == 'blog' else 'news:write'
        elif permission_resource:
            permission = f"{permission_resource}:write"
        else:
            self._send_json(404, {'ok': False, 'error': 'Not found'})
            return

        # RBAC enforcement
        user = getattr(self, '_current_user', None)
        if user and not has_permission(user, permission):
            self._send_json(403, {
                'ok': False,
                'error': f'Your role ({user.get("role", "unknown")}) does not have permission: {permission}'
            })
            audit_log(user, 'permission_denied', resource_type=resource,
                      detail=f'Required: {permission}', ip=self._client_ip())
            return

        if resource == 'content' and len(parts) == 4:
            # Optimistic locking: client sends expected version; server rejects on mismatch
            expected_version = body.get('expected_version')
            ok, new_version, conflict = cms_set_with_lock(
                parts[3], body.get('value'), expected_version,
                user.get('uid') if user else None
            )
            if conflict:
                self._send_json(409, {
                    'ok': False, 'error': 'Conflict',
                    'message': 'This content was modified by another user. Please refresh and try again.',
                    'current_version': conflict
                })
                return
            audit_log(user, 'content_update', resource_type='content', resource_id=parts[3],
                      ip=self._client_ip())
            self._send_json(200 if ok else 500, {'ok': ok, 'version': new_version})
            return

        if resource == 'products' and len(parts) == 4:
            industry = parts[3]
            products = body.get('products', [])
            ok = cms_replace_industry_products(industry, products)
            audit_log(user, 'products_update', resource_type='products', resource_id=industry,
                      ip=self._client_ip())
            self._send_json(200 if ok else 500, {'ok': ok})
            return

        if resource == 'collections' and len(parts) == 5:
            page, collection = parts[3], parts[4]
            items = body.get('items', [])
            if not isinstance(items, list):
                self._send_json(400, {'ok': False, 'error': 'items must be a list'})
                return
            ok = cms_replace_collection(page, collection, items)
            audit_log(user, 'collection_update', resource_type='collections',
                      resource_id=f'{page}/{collection}',
                      detail=f'{len(items)} items', ip=self._client_ip())
            self._send_json(200 if ok else 500, {'ok': ok})
            return

        if resource == 'news' and len(parts) == 4:
            news_type = parts[3]
            if news_type not in ('news', 'blog'):
                self._send_json(400, {'ok': False, 'error': 'type must be news or blog'})
                return
            posts = body.get('posts', [])
            ok = cms_replace_news(news_type, posts)
            audit_log(user, f'{news_type}_update', resource_type=news_type,
                      detail=f'{len(posts)} posts', ip=self._client_ip())
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

    # ─── User Management Handlers (RBAC) ─────────────────────────────────

    def _handle_users_list(self):
        """GET /api/users — super_admin only."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'users:read'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires users:read'})
            return
        self._send_json(200, {'ok': True, 'users': list_admin_users(), 'roles': list(ROLE_PERMISSIONS.keys())})

    def _handle_users_create(self):
        """POST /api/users — super_admin only."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'users:write'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires users:write'})
            return
        data = self._read_json_body()
        if data is None:
            return
        username = (data.get('username') or '').strip()
        password = data.get('password') or ''
        role = data.get('role', 'viewer')
        if not username or not password or len(password) < 8:
            self._send_json(400, {'ok': False, 'error': 'Username and 8+ char password required'})
            return
        if role not in ROLE_PERMISSIONS:
            self._send_json(400, {'ok': False, 'error': f'Invalid role. Must be one of: {list(ROLE_PERMISSIONS.keys())}'})
            return
        new_user = create_admin_user(
            username, password, role,
            email=data.get('email', ''), full_name=data.get('full_name', ''),
            actor_id=user.get('uid')
        )
        if not new_user:
            self._send_json(409, {'ok': False, 'error': 'Username or email already exists'})
            return
        audit_log(user, 'user_created', resource_type='user', resource_id=new_user['id'],
                  detail={'username': username, 'role': role}, ip=self._client_ip())
        self._send_json(201, {'ok': True, 'user': new_user})

    def _handle_users_update(self, target_id):
        """PUT /api/users/<id> — super_admin only."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'users:write'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires users:write'})
            return
        data = self._read_json_body()
        if data is None:
            return
        # Special action: reset password
        if 'new_password' in data:
            if len(data['new_password']) < 8:
                self._send_json(400, {'ok': False, 'error': 'Password must be 8+ characters'})
                return
            if not reset_admin_password(target_id, data['new_password'], actor_id=user.get('uid')):
                self._send_json(404, {'ok': False, 'error': 'User not found'})
                return
            audit_log(user, 'user_password_reset', resource_type='user', resource_id=target_id,
                      ip=self._client_ip())
            self._send_json(200, {'ok': True})
            return
        # General field updates
        if not update_admin_user(target_id, data, actor_id=user.get('uid')):
            self._send_json(404, {'ok': False, 'error': 'User not found'})
            return
        audit_log(user, 'user_updated', resource_type='user', resource_id=target_id,
                  detail=data, ip=self._client_ip())
        self._send_json(200, {'ok': True})

    def _handle_users_delete(self, target_id):
        """DELETE /api/users/<id> — super_admin only. Soft-delete (deactivate)."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'users:delete'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires users:delete'})
            return
        # Prevent self-deletion (would lock out the only admin)
        if user.get('uid') == target_id:
            self._send_json(400, {'ok': False, 'error': 'Cannot delete your own account'})
            return
        if not delete_admin_user(target_id, actor_id=user.get('uid')):
            self._send_json(404, {'ok': False, 'error': 'User not found'})
            return
        audit_log(user, 'user_deleted', resource_type='user', resource_id=target_id,
                  ip=self._client_ip())
        self._send_json(200, {'ok': True})

    # ─── Media Library Handlers ──────────────────────────────────────────

    def _handle_media_upload(self):
        """
        POST /api/media — upload an image/video/PDF to the admin media library.
        Requires media:write permission. Returns the public URL.
        """
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'media:write'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires media:write'})
            return

        ctype = self.headers.get('Content-Type', '')
        if not ctype.startswith('multipart/form-data'):
            self._send_json(400, {'ok': False, 'error': 'Expected multipart/form-data'})
            return

        try:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': ctype},
                keep_blank_values=True,
            )
        except (ValueError, OSError) as e:
            self._send_json(400, {'ok': False, 'error': f'Bad multipart data: {e}'})
            return

        if 'file' not in form:
            self._send_json(400, {'ok': False, 'error': 'No file uploaded (field name: file)'})
            return

        file_field = form['file']
        if not getattr(file_field, 'filename', None):
            self._send_json(400, {'ok': False, 'error': 'Empty filename'})
            return

        original_name = os.path.basename(file_field.filename)
        ext = os.path.splitext(original_name)[1].lower()
        if ext not in ALLOWED_MEDIA_EXTS:
            self._send_json(400, {
                'ok': False,
                'error': f'Extension {ext} not allowed. Allowed: {sorted(ALLOWED_MEDIA_EXTS)}'
            })
            return

        # Optional folder from form. Page-organised paths like
        # "pages/cnc-milling/equipment" keep files grouped by module.
        folder = sanitize_media_folder(form.getvalue('folder'))

        # Build target path (folder may be nested)
        os.makedirs(os.path.join(MEDIA_DIR, *folder.split('/')), exist_ok=True)
        safe_base = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.splitext(original_name)[0])[:80] or 'file'
        stored_name = f"{safe_base}_{uuid.uuid4().hex[:8]}{ext}"
        target_path = os.path.join(MEDIA_DIR, *folder.split('/'), stored_name)

        # Stream-write the uploaded file with size limit enforcement
        size = 0
        with open(target_path, 'wb') as f:
            while True:
                chunk = file_field.file.read(1024 * 64)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_MEDIA_BYTES:
                    f.close()
                    try: os.unlink(target_path)
                    except OSError: pass
                    self._send_json(413, {'ok': False, 'error': f'File too large (max {MAX_MEDIA_BYTES // 1024 // 1024}MB)'})
                    return
                f.write(chunk)

        # Magic-number sanity check (reject executables disguised as images)
        if not validate_file_magic(target_path, ext):
            try: os.unlink(target_path)
            except OSError: pass
            self._send_json(400, {
                'ok': False,
                'error': f'File content does not match {ext} format. Upload rejected.'
            })
            return

        # Convert raster images to WebP (smaller, modern format). Falls back to the
        # original file automatically if Pillow is unavailable or conversion fails.
        converted_path = convert_image_to_webp(target_path, ext)
        if converted_path != target_path:
            target_path = converted_path
            stored_name = os.path.basename(target_path)
            size = os.path.getsize(target_path)

        # Public URL the admin can paste into product/page fields
        public_url = f"/uploads/media/{folder}/{stored_name}"

        audit_log(user, 'media_upload', resource_type='media', resource_id=stored_name,
                  detail={'folder': folder, 'size': size, 'original': original_name},
                  ip=self._client_ip())

        self._send_json(200, {
            'ok': True,
            'url': public_url,
            'filename': stored_name,
            'original_filename': original_name,
            'size': size,
            'folder': folder,
        })

    def _handle_media_list(self):
        """GET /api/media — list all media files (with sizes, URLs, folders)."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'media:read'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires media:read'})
            return

        items = []
        if os.path.isdir(MEDIA_DIR):
            for dirpath, _dirs, files in os.walk(MEDIA_DIR):
                rel = os.path.relpath(dirpath, MEDIA_DIR)
                folder_name = '' if rel == '.' else rel.replace(os.sep, '/')
                if not folder_name:
                    continue  # files directly under media root are not expected
                for fname in sorted(files):
                    fpath = os.path.join(dirpath, fname)
                    if not os.path.isfile(fpath):
                        continue
                    try:
                        stat = os.stat(fpath)
                        items.append({
                            'filename': fname,
                            'folder': folder_name,
                            'url': f"/uploads/media/{folder_name}/{fname}",
                            'size': stat.st_size,
                            'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        })
                    except OSError:
                        continue
        items.sort(key=lambda x: (x['folder'], x['filename']))

        self._send_json(200, {'ok': True, 'items': items, 'total': len(items)})

    def _handle_media_delete(self, folder, filename):
        """DELETE /api/media/<folder>/<filename> — delete a media file."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'media:delete'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires media:delete'})
            return

        # Prevent path traversal. Folder may be nested (e.g. pages/cnc-milling/equipment);
        # sanitize_media_folder rejects '..', absolute paths and bad segments.
        if '..' in filename or '/' in filename or '\\' in filename:
            self._send_json(400, {'ok': False, 'error': 'Invalid filename'})
            return
        clean_folder = sanitize_media_folder(folder)
        if clean_folder != folder.strip().strip('/'):
            self._send_json(400, {'ok': False, 'error': 'Invalid folder name'})
            return

        target = os.path.join(MEDIA_DIR, *clean_folder.split('/'), filename)
        # Defence in depth: ensure the resolved path is still inside MEDIA_DIR
        if os.path.commonpath([os.path.abspath(target), os.path.abspath(MEDIA_DIR)]) != os.path.abspath(MEDIA_DIR):
            self._send_json(400, {'ok': False, 'error': 'Invalid path'})
            return
        if not os.path.isfile(target):
            self._send_json(404, {'ok': False, 'error': 'File not found'})
            return

        try:
            os.unlink(target)
        except OSError as e:
            self._send_json(500, {'ok': False, 'error': str(e)})
            return

        audit_log(user, 'media_delete', resource_type='media', resource_id=filename,
                  detail={'folder': folder}, ip=self._client_ip())
        self._send_json(200, {'ok': True})

    # ─── Blocklist Handlers (super_admin only) ─────────────────────────

    def _handle_blocklist_list(self):
        """GET /api/blocklist — list all blocklist entries with metadata."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'blocklist:read'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires blocklist:read'})
            return
        entries = []
        for e in BLOCKLIST_ENTRIES:
            entries.append({
                'value': e['value'],
                'type': e['type'],
                'note': e.get('note', ''),
                'enabled': e.get('enabled', True),
            })
        # Also report the current request's own IP so admin can sanity-check
        # they're not about to ban themselves
        self._send_json(200, {
            'ok': True,
            'entries': entries,
            'your_ip': self._client_ip(),
            'total': len(entries),
        })

    def _handle_blocklist_create(self):
        """POST /api/blocklist — add a new entry."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'blocklist:write'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires blocklist:write'})
            return
        data = self._read_json_body()
        if data is None:
            return
        value = (data.get('value') or '').strip()
        note = (data.get('note') or '').strip()
        if not value:
            self._send_json(400, {'ok': False, 'error': 'IP/CIDR/ASN is required'})
            return

        # Parse and validate
        fake_line = f"{value}    # {note}" if note else value
        entry = _parse_blocklist_entry(fake_line)
        if entry is None:
            self._send_json(400, {
                'ok': False,
                'error': f'Invalid entry "{value}". Use IP (203.0.113.45), CIDR (203.0.113.0/24), or AS<number>.'
            })
            return

        # Safety check: don't let admin lock themselves out
        client_ip = self._client_ip()
        try:
            if entry['type'] == 'network' and ipaddress.ip_address(client_ip) in entry['network']:
                self._send_json(400, {
                    'ok': False,
                    'error': f'Refusing: this rule would block YOUR OWN IP ({client_ip}). '
                             f'If intended, edit blocklist.txt directly via SSH.'
                })
                return
        except ValueError:
            pass

        # Check duplicate
        for existing in BLOCKLIST_ENTRIES:
            if existing['value'] == entry['value']:
                self._send_json(409, {'ok': False, 'error': f'Entry "{value}" already exists'})
                return

        with _blocklist_lock:
            BLOCKLIST_ENTRIES.append(entry)
        try:
            save_blocklist()
        except OSError as e:
            with _blocklist_lock:
                BLOCKLIST_ENTRIES.remove(entry)
            self._send_json(500, {'ok': False, 'error': f'Could not write blocklist.txt: {e}'})
            return

        audit_log(user, 'blocklist_add', resource_type='blocklist', resource_id=value,
                  detail={'note': note, 'type': entry['type']}, ip=self._client_ip())
        self._send_json(201, {
            'ok': True,
            'entry': {
                'value': entry['value'],
                'type': entry['type'],
                'note': entry.get('note', ''),
                'enabled': True,
            }
        })

    def _handle_blocklist_update(self, value):
        """PUT /api/blocklist/<value> — toggle enabled or edit note."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'blocklist:write'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires blocklist:write'})
            return
        data = self._read_json_body()
        if data is None:
            return

        target = None
        with _blocklist_lock:
            for e in BLOCKLIST_ENTRIES:
                if e['value'] == value:
                    target = e
                    break
        if target is None:
            self._send_json(404, {'ok': False, 'error': f'Entry "{value}" not found'})
            return

        if 'enabled' in data:
            target['enabled'] = bool(data['enabled'])
        if 'note' in data:
            target['note'] = str(data['note']).strip()

        try:
            save_blocklist()
        except OSError as e:
            self._send_json(500, {'ok': False, 'error': f'Could not write blocklist.txt: {e}'})
            return

        audit_log(user, 'blocklist_update', resource_type='blocklist', resource_id=value,
                  detail=data, ip=self._client_ip())
        self._send_json(200, {'ok': True})

    def _handle_blocklist_delete(self, value):
        """DELETE /api/blocklist/<value> — remove an entry permanently."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'blocklist:write'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires blocklist:write'})
            return

        removed = None
        with _blocklist_lock:
            for i, e in enumerate(BLOCKLIST_ENTRIES):
                if e['value'] == value:
                    removed = BLOCKLIST_ENTRIES.pop(i)
                    break

        if removed is None:
            self._send_json(404, {'ok': False, 'error': f'Entry "{value}" not found'})
            return

        try:
            save_blocklist()
        except OSError as e:
            # Restore on failure
            with _blocklist_lock:
                BLOCKLIST_ENTRIES.append(removed)
            self._send_json(500, {'ok': False, 'error': f'Could not write blocklist.txt: {e}'})
            return

        audit_log(user, 'blocklist_delete', resource_type='blocklist', resource_id=value,
                  ip=self._client_ip())
        self._send_json(200, {'ok': True})

    def _handle_audit_log(self):
        """GET /api/audit — read audit log. super_admin only."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'audit:read'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires audit:read'})
            return
        if not (DB_CONFIG and MYSQL_AVAILABLE):
            self._send_json(503, {'ok': False, 'error': 'Database not configured'})
            return
        conn = get_db_connection()
        if not conn:
            self._send_json(503, {'ok': False, 'error': 'Database unavailable'})
            return
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT id, user_id, username, action, resource_type, resource_id,
                       detail, ip_address, created_at
                FROM admin_audit_log
                ORDER BY created_at DESC
                LIMIT 200
            """)
            rows = cursor.fetchall()
            for row in rows:
                for k, v in row.items():
                    if isinstance(v, datetime):
                        row[k] = v.isoformat()
            self._send_json(200, {'ok': True, 'rows': rows})
        except mysql.connector.Error as e:
            self._send_json(500, {'ok': False, 'error': str(e)})
        finally:
            conn.close()

    def _handle_quotes_list(self):
        """GET /api/quotes — session-authed list of quote requests."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'quotes:read'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires quotes:read'})
            return
        if not (DB_CONFIG and MYSQL_AVAILABLE):
            self._send_json(503, {'ok': False, 'error': 'Database not configured'})
            return
        self._send_json(200, {'ok': True, 'rows': list_submissions('quote_requests', limit=500)})

    def _handle_contacts_list(self):
        """GET /api/contacts — session-authed list of contact submissions."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'contacts:read'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires contacts:read'})
            return
        if not (DB_CONFIG and MYSQL_AVAILABLE):
            self._send_json(503, {'ok': False, 'error': 'Database not configured'})
            return
        self._send_json(200, {'ok': True, 'rows': list_submissions('contact_submissions', limit=500)})

    def _handle_requests_list(self):
        """GET /api/requests — session-authed list of resource/download requests."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        # Resource requests are sales-relevant leads — gate behind quotes:read
        if not has_permission(user, 'quotes:read'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires quotes:read'})
            return
        if not (DB_CONFIG and MYSQL_AVAILABLE):
            self._send_json(503, {'ok': False, 'error': 'Database not configured'})
            return
        self._send_json(200, {'ok': True, 'rows': list_submissions('download_requests', limit=500)})

    def _handle_request_update(self, rid):
        """PUT /api/requests/<id> — update status. Requires quotes:write."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'quotes:write'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires quotes:write'})
            return
        data = self._read_json_body()
        if data is None:
            return
        new_status = data.get('status')
        valid = ('new', 'contacted', 'sent', 'closed')
        if new_status not in valid:
            self._send_json(400, {'ok': False, 'error': f'status must be one of {valid}'})
            return
        conn = get_db_connection()
        if not conn:
            self._send_json(503, {'ok': False, 'error': 'Database unavailable'})
            return
        try:
            cursor = conn.cursor()
            cursor.execute("UPDATE download_requests SET status=%s WHERE id=%s", (new_status, rid))
            conn.commit()
            if cursor.rowcount == 0:
                self._send_json(404, {'ok': False, 'error': 'Request not found'})
                return
            audit_log(user, 'request_status_update', resource_type='download_request',
                      resource_id=rid, detail={'status': new_status}, ip=self._client_ip())
            self._send_json(200, {'ok': True, 'id': rid, 'status': new_status})
        except mysql.connector.Error as e:
            self._send_json(500, {'ok': False, 'error': str(e)})
        finally:
            conn.close()

    def _handle_quote_update(self, qid):
        """PUT /api/quotes/<id> — update status. Requires quotes:write."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'quotes:write'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires quotes:write'})
            return
        data = self._read_json_body()
        if data is None:
            return
        new_status = data.get('status')
        valid_statuses = ('new', 'contacted', 'quoted', 'won', 'lost')
        if new_status not in valid_statuses:
            self._send_json(400, {'ok': False, 'error': f'status must be one of {valid_statuses}'})
            return
        conn = get_db_connection()
        if not conn:
            self._send_json(503, {'ok': False, 'error': 'Database unavailable'})
            return
        try:
            cursor = conn.cursor()
            cursor.execute("UPDATE quote_requests SET status=%s WHERE id=%s", (new_status, qid))
            conn.commit()
            if cursor.rowcount == 0:
                self._send_json(404, {'ok': False, 'error': 'Quote not found'})
                return
            audit_log(user, 'quote_status_update', resource_type='quote',
                      resource_id=qid, detail={'status': new_status}, ip=self._client_ip())
            self._send_json(200, {'ok': True, 'id': qid, 'status': new_status})
        except mysql.connector.Error as e:
            self._send_json(500, {'ok': False, 'error': str(e)})
        finally:
            conn.close()

    def _quote_file_lookup(self, qid):
        """Return (stored_name, original_name) for a quote, or (None, None)."""
        conn = get_db_connection()
        if not conn:
            return None, None
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                "SELECT file_stored_name, file_original_name FROM quote_requests WHERE id=%s",
                (qid,)
            )
            row = cursor.fetchone()
            if not row:
                return None, None
            return row.get('file_stored_name'), row.get('file_original_name')
        except mysql.connector.Error:
            return None, None
        finally:
            conn.close()

    def _handle_quote_attachment_download(self, path):
        """GET /api/quotes/<id>/attachment — stream the CAD file to an authed admin."""
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'quotes:read'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires quotes:read'})
            return
        mid = path[len('/api/quotes/'):-len('/attachment')]
        try:
            qid = int(mid)
        except ValueError:
            self._send_json(400, {'ok': False, 'error': 'Invalid quote id'})
            return

        stored, original = self._quote_file_lookup(qid)
        if not stored:
            self._send_json(404, {'ok': False, 'error': 'No attachment for this quote'})
            return

        safe_name = os.path.basename(stored)
        file_path = os.path.join(UPLOAD_DIR, safe_name)
        if not os.path.isfile(file_path):
            self._send_json(404, {'ok': False, 'error': 'File missing on disk (may have been deleted)'})
            return

        audit_log(user, 'quote_attachment_download', resource_type='quote',
                  resource_id=qid, detail={'file': original}, ip=self._client_ip())

        try:
            file_size = os.path.getsize(file_path)
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            dl_name = original or safe_name
            self.send_header('Content-Disposition', f'attachment; filename="{dl_name}"')
            self.send_header('Content-Length', str(file_size))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(64 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (OSError, BrokenPipeError) as e:
            print(f"  ⚠  Attachment download error for quote #{qid}: {e}")

    def _handle_quote_attachment_delete(self, qid):
        """DELETE /api/quotes/<id>/attachment — remove CAD file, keep the record.

        Deletes the file from disk AND clears the file_* columns. The quote
        itself (customer info, project details) is preserved. Requires
        quotes:delete.
        """
        if not self._check_admin_auth():
            return
        user = getattr(self, '_current_user', None)
        if not has_permission(user, 'quotes:delete'):
            self._send_json(403, {'ok': False, 'error': 'Forbidden: requires quotes:delete'})
            return

        stored, original = self._quote_file_lookup(qid)
        if stored is None and original is None:
            self._send_json(404, {'ok': False, 'error': 'Quote not found'})
            return
        if not stored:
            self._send_json(404, {'ok': False, 'error': 'This quote has no attachment'})
            return

        safe_name = os.path.basename(stored)
        file_path = os.path.join(UPLOAD_DIR, safe_name)
        file_deleted = False
        if os.path.isfile(file_path):
            try:
                os.unlink(file_path)
                file_deleted = True
            except OSError as e:
                print(f"  ⚠  Could not delete attachment file for quote #{qid}: {e}")

        conn = get_db_connection()
        if not conn:
            self._send_json(503, {'ok': False, 'error': 'Database unavailable'})
            return
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE quote_requests
                SET file_original_name=NULL, file_stored_name=NULL,
                    file_size_bytes=NULL, file_mime_type=NULL
                WHERE id=%s
            """, (qid,))
            conn.commit()
            audit_log(user, 'quote_attachment_delete', resource_type='quote',
                      resource_id=qid,
                      detail={'file': original, 'disk_deleted': file_deleted},
                      ip=self._client_ip())
            self._send_json(200, {'ok': True, 'id': qid, 'file_deleted': file_deleted})
        except mysql.connector.Error as e:
            self._send_json(500, {'ok': False, 'error': str(e)})
        finally:
            conn.close()

    def _handle_sitemap(self):
        """Generate sitemap.xml dynamically: static pages + published articles.

        Static pages come from the bundled sitemap.xml (so the curated priority
        values are preserved). Published blog/news articles are appended live
        from the cms_news table, so new articles appear in the sitemap the
        moment they're published — no manual sitemap edits needed.
        """
        base = (os.environ.get('WFX_SITE_URL') or
                getattr(config, 'SITE_URL', None) or 'https://wanfuxin-dg.com').rstrip('/')

        urls = []  # list of (loc, priority, changefreq, lastmod)

        # 1. Static pages — read the curated entries from the bundled file
        static_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sitemap.xml')
        if os.path.isfile(static_path):
            try:
                with open(static_path, encoding='utf-8') as f:
                    raw = f.read()
                for m in re.finditer(r'<loc>(.*?)</loc>', raw):
                    loc = m.group(1).strip()
                    # Pull priority/changefreq from the same <url> block if present
                    block_match = re.search(
                        re.escape(m.group(0)) + r'.*?(?=<url>|</urlset>)', raw, re.DOTALL)
                    block = block_match.group(0) if block_match else ''
                    pr = re.search(r'<priority>(.*?)</priority>', block)
                    cf = re.search(r'<changefreq>(.*?)</changefreq>', block)
                    urls.append((loc, pr.group(1) if pr else '0.5',
                                 cf.group(1) if cf else 'monthly', None))
            except OSError:
                pass

        # 2. Published articles from the database (blog + news)
        seen = {u[0] for u in urls}
        if DB_CONFIG and MYSQL_AVAILABLE:
            conn = get_db_connection()
            if conn:
                try:
                    cursor = conn.cursor(dictionary=True)
                    cursor.execute("""
                        SELECT type, slug, updated_at
                        FROM cms_news
                        WHERE is_published = 1 AND slug IS NOT NULL AND slug <> ''
                        ORDER BY published_at DESC
                        LIMIT 5000
                    """)
                    for row in cursor.fetchall():
                        # blog → /blog/<slug>, news → /news/<slug>
                        prefix = 'blog' if row['type'] == 'blog' else 'news'
                        loc = f"{base}/{prefix}/{row['slug']}"
                        if loc in seen:
                            continue
                        seen.add(loc)
                        lastmod = None
                        if row.get('updated_at'):
                            try:
                                lastmod = row['updated_at'].strftime('%Y-%m-%d')
                            except Exception:
                                lastmod = None
                        urls.append((loc, '0.6', 'weekly', lastmod))
                except mysql.connector.Error as e:
                    print(f"  ⚠  Sitemap DB query failed (serving static only): {e}")
                finally:
                    conn.close()

        # 3. Build XML
        lines = ['<?xml version="1.0" encoding="UTF-8"?>',
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for loc, pr, cf, lastmod in urls:
            entry = f'  <url><loc>{loc}</loc>'
            if lastmod:
                entry += f'<lastmod>{lastmod}</lastmod>'
            entry += f'<priority>{pr}</priority><changefreq>{cf}</changefreq></url>'
            lines.append(entry)
        lines.append('</urlset>')
        body = '\n'.join(lines).encode('utf-8')

        self.send_response(200)
        self.send_header('Content-Type', 'application/xml; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'public, max-age=3600')
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self):
        decoded_path = unquote(self.path)
        if '..' in decoded_path or '\x00' in decoded_path:
            self.send_error(403, "Forbidden")
            return

        # ─── IP / ASN Blocklist check ────────────────────────────────────
        # Runs FIRST so blocked IPs never reach anything else (saves CPU).
        # Returns 404 (not 403) to avoid confirming "you're banned" — looks
        # like a broken site to the blocked party.
        client_ip = self._client_ip()
        block_reason = is_ip_blocked(client_ip)
        if block_reason:
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"  🛑  [{ts}] BLOCKED-IP: {client_ip} {decoded_path} ({block_reason})")
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'<!DOCTYPE html><html><head><title>Not Found</title></head>'
                             b'<body><h1>404 Not Found</h1></body></html>')
            return

        # Block direct HTTP access to confidential upload folders.
        # uploads/.auth/  → admin user database (must never be served)
        # uploads/quotes/ → customer CAD files (confidential)
        # uploads/media/  → public (admin's marketing assets are meant to be served)
        lower = decoded_path.lower()
        if ('/uploads/.auth' in lower or '/uploads/quotes' in lower or
            lower.startswith('/uploads/.auth') or lower.startswith('/uploads/quotes')):
            self.send_error(403, "Forbidden")
            return

        # ─── Anti-Scraping Defenses (HTML pages only) ─────────────────────
        # Apply to HTML page requests — let assets (CSS/JS/images/fonts) flow
        # freely so legitimate users aren't broken by overzealous filtering.
        is_html_request = (
            decoded_path.endswith('.html') or
            decoded_path == '/' or
            decoded_path.endswith('/') or
            ('.' not in os.path.basename(decoded_path) and decoded_path != '/')
        )
        # Skip enforcement for admin pages — admins go through auth anyway,
        # and they may need to access from atypical environments
        is_admin = decoded_path.startswith('/admin')

        if is_html_request and not is_admin:
            # 1. Per-IP page rate limit. Humans browse < 1 page/sec; scrapers
            #    typically request 5+/sec. 60 pages/min still allows aggressive
            #    legit browsing (e.g., comparison shopping across all 37 pages).
            max_req, window = RATE_LIMITS['pages']
            if not rate_limiter.check(f"pages:{self._client_ip()}", max_req, window):
                self.send_response(429)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Retry-After', str(window))
                self._send_security_headers()
                self.end_headers()
                self.wfile.write(b'<!DOCTYPE html><html><head><title>Slow Down</title></head>'
                                 b'<body><h1>429 Too Many Requests</h1>'
                                 b'<p>You are browsing too fast. Please wait a minute.</p>'
                                 b'<p>Real browsing? <a href="mailto:lucindaz@wanfuxin.com">Contact us</a>.</p>'
                                 b'</body></html>')
                ts = datetime.now().strftime('%H:%M:%S')
                print(f"  🚫  [{ts}] RATE-LIMIT: {self._client_ip()} {decoded_path}")
                return

            # 2. User-Agent scraper signature check
            ua = self.headers.get('User-Agent', '')
            block_reason = is_likely_scraper(ua)
            if block_reason:
                self.send_response(403)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self._send_security_headers()
                self.end_headers()
                self.wfile.write(b'<!DOCTYPE html><html><head><title>Forbidden</title></head>'
                                 b'<body><h1>403 Forbidden</h1>'
                                 b'<p>Automated access is not permitted. '
                                 b'For licensing inquiries, contact '
                                 b'<a href="mailto:lucindaz@wanfuxin.com">lucindaz@wanfuxin.com</a>.</p>'
                                 b'</body></html>')
                ts = datetime.now().strftime('%H:%M:%S')
                print(f"  🚫  [{ts}] BLOCKED-UA: {self._client_ip()} ({block_reason}): {ua[:80]}")
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

        self._send_security_headers()
        self.end_headers()

        if self.command != 'HEAD':
            self.wfile.write(content)

    def do_HEAD(self):
        self._serve_static()


# ─── Startup ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='WFX Website Server')
    parser.add_argument('--port', type=int,
                        default=int(os.environ.get('WFX_PORT', DEFAULT_PORT)),
                        help='Port to bind (env: WFX_PORT)')
    parser.add_argument('--host', type=str,
                        default=os.environ.get('WFX_HOST', '127.0.0.1'),
                        help='Host to bind. Use 0.0.0.0 for cloud deployment behind a reverse proxy. (env: WFX_HOST)')
    parser.add_argument('--production', action='store_true',
                        default=os.environ.get('WFX_ENV', '') == 'production',
                        help='Production mode: stricter logging, no auto-browser, security checks (env: WFX_ENV=production)')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # Production safety checks
    if args.production:
        prod_warnings = []
        prod_fatal = []
        if not (DB_CONFIG and MYSQL_AVAILABLE):
            prod_warnings.append("MySQL not configured — quote/contact submissions will fail")
        # Check SESSION_SECRET: from config.py, env var, or auto-generated
        secret = (getattr(config, 'SESSION_SECRET', None) if config else None) or os.environ.get('WFX_SESSION_SECRET', '')
        if not secret or 'replace' in str(secret).lower():
            prod_fatal.append("SESSION_SECRET is not set or is the default placeholder — sessions would be forgeable. Set WFX_SESSION_SECRET to a 32+ char random string.")
        token = (getattr(config, 'ADMIN_API_TOKEN', None) if config else None) or os.environ.get('WFX_ADMIN_TOKEN', '')
        if not token or 'replace' in str(token).lower() or token == 'change-me':
            prod_warnings.append("ADMIN_API_TOKEN is not set or is the default placeholder — legacy /api/admin/* endpoints will return 503 (this is safe but means those endpoints are disabled)")
        if args.host == '0.0.0.0':
            prod_warnings.append("Binding to 0.0.0.0 — make sure you're behind a reverse proxy (Nginx) with HTTPS")
        if prod_fatal:
            print("\n🛑  PRODUCTION FATAL ERRORS — refusing to start:")
            for w in prod_fatal:
                print(f"   - {w}")
            print("\nFix these by setting environment variables (see .env.example) or editing config.py, then retry.")
            sys.exit(1)
        if prod_warnings:
            print("\n⚠  PRODUCTION WARNINGS:")
            for w in prod_warnings:
                print(f"   - {w}")
            print()

    mimetypes.add_type('application/javascript', '.js')
    mimetypes.add_type('image/svg+xml', '.svg')
    mimetypes.add_type('font/woff', '.woff')
    mimetypes.add_type('font/woff2', '.woff2')
    mimetypes.add_type('video/mp4', '.mp4')

    server = ThreadedHTTPServer((args.host, args.port), WFXHandler)

    db_status = "Connected" if (DB_CONFIG and MYSQL_AVAILABLE) else "Disabled (no config)"
    bind_display = f"{args.host}:{args.port}" if args.host != '127.0.0.1' else f"localhost:{args.port}"
    mode = "PRODUCTION" if args.production else "DEVELOPMENT"

    print(f"""
╔═══════════════════════════════════════════════════════════════╗
║          WFX Wanfuxin — {mode:<11} Server                   ║
╠═══════════════════════════════════════════════════════════════╣
║   Listening:   http://{bind_display}
║   Admin:       http://{bind_display}/admin/
╠═══════════════════════════════════════════════════════════════╣
║   Multi-threaded | Gzip | ETag | Security headers
║   MySQL: {db_status}
║
║   API: POST /api/quote, POST /api/contact, /api/auth/*
║        GET /api/admin/quotes, GET /api/admin/contacts
║        /api/cms/* (CMS), /api/users/* (RBAC)
╚═══════════════════════════════════════════════════════════════╝
""")
    # Don't auto-open browser in production or when binding to non-loopback
    if not args.no_browser and not args.production and args.host in ('127.0.0.1', 'localhost'):
        webbrowser.open(f'http://localhost:{args.port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.\n")
        server.server_close()
        sys.exit(0)


if __name__ == '__main__':
    main()
