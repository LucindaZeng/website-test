"""
WFX Server Configuration

Copy this file to `config.py` and fill in your actual values.
DO NOT commit config.py to git — add it to .gitignore.

Generate secrets with:
    python -c "import secrets; print(secrets.token_hex(32))"
"""

import os

# ─── MySQL Database ────────────────────────────────────────────────────────────
DB_CONFIG = {
    'host':     'localhost',
    'port':     3306,
    'user':     'wfx_user',
    'password': 'change-this-password',
    'database': 'wfx_website',
    'charset':  'utf8mb4',
    'autocommit': False,
}

# ─── Session secret (REQUIRED for production) ──────────────────────────────────
# Used to HMAC-sign session cookies and CSRF tokens. Without this, sessions die
# every time the server restarts. Use 64+ random hex characters.
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
SESSION_SECRET = 'replace-with-64-character-random-hex-string'

# ─── File upload directory ─────────────────────────────────────────────────────
# Where to save CAD files attached to quote requests.
# Should be OUTSIDE the website root so files aren't web-accessible.
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'quotes')

# ─── Legacy API token (for non-browser scripts/CI) ─────────────────────────────
# Browser-based admin uses cookie sessions + CSRF (see /api/auth/login).
# This X-Admin-Token is only used by automated scripts that can't handle cookies.
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
ADMIN_API_TOKEN = 'replace-with-long-random-string'

# ─── Email notifications (SMTP) ────────────────────────────────────────────────
# When a customer submits a quote, the server emails an alert to NOTIFY_EMAIL.
# Leave SMTP_HOST as None (or delete this whole block) to disable email — quotes
# still save to the database and show in the admin panel, so nothing is lost.
#
# Tencent Enterprise Mail (腾讯企业邮箱) — recommended for wanfuxin.com:
#   SMTP_HOST = 'smtp.exmail.qq.com'
#   SMTP_PORT = 465 (SSL)
#   SMTP_USER = full mailbox address
#   SMTP_PASSWORD = CLIENT AUTHORIZATION CODE (客户端授权码), NOT the login password.
#                   Generate in mailbox: 设置 → 客户端专用密码 → 生成.
SMTP_HOST = 'smtp.exmail.qq.com'
SMTP_PORT = 465
SMTP_USE_SSL = True
SMTP_USER = 'lucindaz@wanfuxin.com'
SMTP_PASSWORD = 'replace-with-client-authorization-code'

# Where quote alerts are delivered (defaults to lucindaz@wanfuxin.com if unset).
NOTIFY_EMAIL = 'lucindaz@wanfuxin.com'

# ─── Site URL (for links inside notification emails) ───────────────────────────
# Your public site URL, no trailing slash. Used to build clickable admin links
# in quote-notification emails.
SITE_URL = 'https://wanfuxin.com'
