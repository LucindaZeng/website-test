#!/usr/bin/env python3
"""
sync.py — make the admin panel show the same content that's on the .html pages.

Run this after the website's files are updated (or just let the server run it
for you automatically on startup — see server.py main()).

What it does:
    Re-reads every *.html page and refreshes the editable-list defaults
    (migrations/collection-defaults.json). The admin panel and the public pages
    both fall back to these defaults for any list that hasn't been edited yet, so
    refreshing this file is all it takes to keep the front-end and back-end in
    sync after an update.

What it does NOT do:
    It never writes to the database. The database only ever holds lists an editor
    actually saved in the admin. That means running this — once or a hundred
    times — can never create duplicate data in the backend.

BeautifulSoup is needed to read the pages; without it, the committed defaults
file is kept as-is.

Usage:
    python3 sync.py
"""
import server

if __name__ == '__main__':
    print("Syncing page content → admin defaults …")
    server.cms_autosync_collections()
    print("Done.")
