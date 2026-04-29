"""
WFX Server Configuration

Copy this file to `config.py` and fill in your actual values.
DO NOT commit config.py to git — add it to .gitignore.
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

# ─── File upload directory ─────────────────────────────────────────────────────
# Where to save CAD files attached to quote requests.
# Should be OUTSIDE the website root so files aren't web-accessible.
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'quotes')

# ─── Admin API token ───────────────────────────────────────────────────────────
# Random secret used to authenticate admin GET /api/admin/* requests.
# Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
ADMIN_API_TOKEN = 'replace-with-long-random-string'
