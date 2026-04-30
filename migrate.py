#!/usr/bin/env python3
"""
WFX Content Migration Tool
==========================

Exports or imports the entire CMS content + uploaded media as a single
archive, so you can prepare everything locally and deploy to your cloud
server in one step.

What's included in an archive:
  - All MySQL CMS data (cms_content, cms_industry_products, cms_news)
  - All admin-uploaded media files (uploads/media/)
  - Quote/contact submissions (cms_quote_requests, cms_contact_submissions) [optional]
  - Admin user accounts (uploads/.auth/admin_users.json) [optional]

What's NOT included:
  - Customer CAD files in uploads/quotes/ (confidential — handle separately)
  - Server config (config.py / .env — set those manually on the cloud server)
  - HTML/CSS/JS source code (already in your git repo / zip)

Usage:
    # On your local machine, after preparing all content:
    python migrate.py export wfx-content-2026-04-29.tar.gz

    # On your cloud server, after deploying code + setting up MySQL:
    python migrate.py import wfx-content-2026-04-29.tar.gz

    # Dry-run (show what would be exported, change nothing):
    python migrate.py export --dry-run

    # Include sensitive data (quotes, admin users):
    python migrate.py export archive.tar.gz --include-quotes --include-users
"""
import os
import sys
import json
import shutil
import tarfile
import argparse
import tempfile
from datetime import datetime

# Allow running this as a standalone script from project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Reuse server.py's config + DB helpers
try:
    import server
    DB_CONFIG = server.DB_CONFIG
    MYSQL_AVAILABLE = server.MYSQL_AVAILABLE
    MEDIA_DIR = server.MEDIA_DIR
    AUTH_FILE = server.AUTH_FILE
    if MYSQL_AVAILABLE:
        import mysql.connector
except Exception as e:
    print(f"⚠  Could not import server.py: {e}")
    print("   Make sure migrate.py is in the same directory as server.py.")
    sys.exit(1)


def get_conn():
    if not (DB_CONFIG and MYSQL_AVAILABLE):
        return None
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as e:
        print(f"  ✗  MySQL connection failed: {e}")
        return None


# ─── EXPORT ─────────────────────────────────────────────────────────────────────

def dump_table(conn, table):
    cursor = conn.cursor(dictionary=True)
    cursor.execute(f"SELECT * FROM {table}")
    rows = cursor.fetchall()
    # Convert datetimes to ISO strings
    for row in rows:
        for k, v in list(row.items()):
            if isinstance(v, datetime):
                row[k] = v.isoformat()
            elif isinstance(v, bytes):
                row[k] = v.decode('utf-8', errors='replace')
    cursor.close()
    return rows


def export_archive(output_path, include_quotes=False, include_users=False, dry_run=False):
    """Export all CMS content + media to a tar.gz archive."""
    conn = get_conn()
    if not conn:
        print("✗  Cannot export — MySQL not configured or unreachable.")
        return False

    print(f"\n📦  Exporting WFX content...")
    print(f"    Output: {output_path}")
    if dry_run:
        print(f"    Mode:   DRY-RUN (nothing written)")
    print()

    bundle = {
        'meta': {
            'version': 1,
            'exported_at': datetime.now().isoformat(),
            'host': os.uname().nodename if hasattr(os, 'uname') else 'unknown',
        },
        'tables': {},
    }

    # CMS tables (always included)
    cms_tables = ['cms_content', 'cms_industry_products', 'cms_news', 'categories']
    for table in cms_tables:
        try:
            rows = dump_table(conn, table)
            bundle['tables'][table] = rows
            print(f"  ✓  {table}: {len(rows)} rows")
        except mysql.connector.Error as e:
            print(f"  ⚠  {table}: skipped ({e})")

    # Optional tables
    if include_quotes:
        for table in ['quote_requests', 'contact_submissions']:
            try:
                rows = dump_table(conn, table)
                bundle['tables'][table] = rows
                print(f"  ✓  {table}: {len(rows)} rows  (sensitive — included by --include-quotes)")
            except mysql.connector.Error as e:
                print(f"  ⚠  {table}: skipped ({e})")

    conn.close()

    # Count media files
    media_files = []
    if os.path.isdir(MEDIA_DIR):
        for root, _, files in os.walk(MEDIA_DIR):
            for f in files:
                fpath = os.path.join(root, f)
                rel = os.path.relpath(fpath, os.path.dirname(MEDIA_DIR))
                media_files.append((fpath, rel))
    total_size = sum(os.path.getsize(f[0]) for f in media_files)
    print(f"  ✓  media files: {len(media_files)} files ({total_size // 1024} KB)")

    if dry_run:
        print(f"\n  [DRY-RUN] Would create: {output_path}")
        if include_users and os.path.isfile(AUTH_FILE):
            print(f"  [DRY-RUN] Would include: admin_users.json (sensitive)")
        return True

    # Build the archive
    with tempfile.TemporaryDirectory() as tmp:
        # Write the JSON dump
        bundle_path = os.path.join(tmp, 'bundle.json')
        with open(bundle_path, 'w', encoding='utf-8') as f:
            json.dump(bundle, f, indent=2, ensure_ascii=False)

        # Optionally include admin users
        if include_users and os.path.isfile(AUTH_FILE):
            shutil.copy2(AUTH_FILE, os.path.join(tmp, 'admin_users.json'))
            print(f"  ✓  admin_users.json included (sensitive — keep archive secure!)")

        # Write the tarball
        with tarfile.open(output_path, 'w:gz') as tar:
            tar.add(bundle_path, arcname='bundle.json')
            if include_users and os.path.isfile(os.path.join(tmp, 'admin_users.json')):
                tar.add(os.path.join(tmp, 'admin_users.json'), arcname='admin_users.json')
            for fpath, rel in media_files:
                tar.add(fpath, arcname=rel)

    archive_size = os.path.getsize(output_path)
    print(f"\n  ✓  Archive created: {output_path} ({archive_size // 1024} KB)")
    print(f"\n  Next: scp {output_path} user@cloud-server:/path/to/wfx/")
    print(f"        Then on the server: python migrate.py import {output_path}")
    return True


# ─── IMPORT ─────────────────────────────────────────────────────────────────────

def restore_table(conn, table, rows, mode='replace'):
    """
    Insert rows into a table.
    mode='replace' → DELETE existing rows, then INSERT (clean slate)
    mode='upsert'  → INSERT...ON DUPLICATE KEY UPDATE (additive)
    mode='skip'    → skip if any row exists (no-op)
    """
    if not rows:
        return 0
    cursor = conn.cursor()

    # Skip mode
    if mode == 'skip':
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        existing = cursor.fetchone()[0]
        if existing > 0:
            print(f"  -  {table}: {existing} rows exist, skipping (mode=skip)")
            return 0

    # Replace mode
    if mode == 'replace':
        cursor.execute(f"DELETE FROM {table}")

    # Insert
    if not rows:
        return 0
    columns = list(rows[0].keys())
    placeholders = ', '.join(['%s'] * len(columns))
    col_list = ', '.join(f"`{c}`" for c in columns)

    if mode == 'upsert':
        update_clause = ', '.join(f"`{c}`=VALUES(`{c}`)" for c in columns if c != 'id')
        sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON DUPLICATE KEY UPDATE {update_clause}"
    else:
        sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"

    inserted = 0
    for row in rows:
        try:
            values = [row[c] for c in columns]
            cursor.execute(sql, values)
            inserted += 1
        except mysql.connector.Error as e:
            print(f"  ⚠  {table}: row insert failed: {e}")
    conn.commit()
    cursor.close()
    return inserted


def import_archive(archive_path, mode='replace', confirm=False):
    """Restore content from a tar.gz archive."""
    if not os.path.isfile(archive_path):
        print(f"✗  Archive not found: {archive_path}")
        return False

    if not confirm and mode == 'replace':
        print("⚠  Import in 'replace' mode will DELETE all existing CMS content")
        print("   on this server before importing. This cannot be undone.")
        ans = input("   Type 'yes' to continue, anything else to abort: ").strip()
        if ans.lower() != 'yes':
            print("   Aborted.")
            return False

    conn = get_conn()
    if not conn:
        print("✗  Cannot import — MySQL not configured or unreachable.")
        return False

    print(f"\n📥  Importing from {archive_path}  (mode={mode})...")
    print()

    with tempfile.TemporaryDirectory() as tmp:
        # Extract
        with tarfile.open(archive_path, 'r:gz') as tar:
            # Safe extraction: prevent path traversal
            for member in tar.getmembers():
                if os.path.isabs(member.name) or '..' in member.name:
                    print(f"  ✗  Refusing dangerous archive entry: {member.name}")
                    return False
            tar.extractall(tmp)

        # Load bundle.json
        bundle_path = os.path.join(tmp, 'bundle.json')
        if not os.path.isfile(bundle_path):
            print("✗  Archive does not contain bundle.json")
            return False
        with open(bundle_path, 'r', encoding='utf-8') as f:
            bundle = json.load(f)

        # Show meta info
        meta = bundle.get('meta', {})
        print(f"  Archive exported: {meta.get('exported_at', '?')}  from host {meta.get('host', '?')}")
        print(f"  Schema version:   {meta.get('version')}")
        print()

        # Restore tables
        for table, rows in (bundle.get('tables') or {}).items():
            n = restore_table(conn, table, rows, mode=mode)
            print(f"  ✓  {table}: {n} rows imported")

        # Restore media files
        media_src = os.path.join(tmp, 'media')
        if os.path.isdir(media_src):
            os.makedirs(MEDIA_DIR, exist_ok=True)
            count = 0
            for root, _, files in os.walk(media_src):
                for f in files:
                    src = os.path.join(root, f)
                    rel = os.path.relpath(src, media_src)
                    dst = os.path.join(MEDIA_DIR, rel)
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    shutil.copy2(src, dst)
                    count += 1
            print(f"  ✓  media files: {count} copied to {MEDIA_DIR}")

        # Restore admin users (only if archive has it)
        admin_src = os.path.join(tmp, 'admin_users.json')
        if os.path.isfile(admin_src):
            os.makedirs(os.path.dirname(AUTH_FILE), exist_ok=True)
            shutil.copy2(admin_src, AUTH_FILE)
            try:
                os.chmod(AUTH_FILE, 0o600)
            except OSError:
                pass
            print(f"  ✓  admin_users.json restored to {AUTH_FILE} (mode 0600)")

    conn.close()
    print(f"\n  ✓  Import complete. Visit /admin/ to verify content.")
    return True


# ─── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='WFX Content Migration Tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest='cmd', required=True)

    # export
    p_export = sub.add_parser('export', help='Export local content to archive')
    p_export.add_argument('output', nargs='?',
                          default=f'wfx-content-{datetime.now().strftime("%Y%m%d-%H%M%S")}.tar.gz',
                          help='Output filename (default: wfx-content-<timestamp>.tar.gz)')
    p_export.add_argument('--dry-run', action='store_true', help='Preview only')
    p_export.add_argument('--include-quotes', action='store_true',
                          help='Include customer quote/contact submissions (sensitive)')
    p_export.add_argument('--include-users', action='store_true',
                          help='Include admin user accounts (sensitive)')

    # import
    p_import = sub.add_parser('import', help='Import an archive into the current server')
    p_import.add_argument('archive', help='Path to .tar.gz archive')
    p_import.add_argument('--mode', choices=['replace', 'upsert', 'skip'], default='replace',
                          help='replace: wipe and import. upsert: merge. skip: only if empty.')
    p_import.add_argument('--yes', action='store_true', help='Skip confirmation prompt')

    args = parser.parse_args()

    if args.cmd == 'export':
        ok = export_archive(args.output,
                            include_quotes=args.include_quotes,
                            include_users=args.include_users,
                            dry_run=args.dry_run)
    elif args.cmd == 'import':
        ok = import_archive(args.archive, mode=args.mode, confirm=args.yes)
    else:
        parser.print_help()
        sys.exit(1)

    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
