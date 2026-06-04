#!/usr/bin/env python3
"""
Seed cms_collections from the content already present in the HTML pages.

Why: when we convert a hardcoded list into a CMS-managed collection, we must
NOT lose the content that's already on the page. This reads each page's
`data-cms-collection` container, extracts the current items, and emits
idempotent SQL (DELETE then INSERT per page+collection). Running the SQL makes
the live page render the *identical* content — but now editable in the admin.

Usage:
    python3 migrations/seed_collections.py            # writes seed-collections.sql
    python3 migrations/seed_collections.py --print     # also print to stdout

Safety: this script only READS html and WRITES a .sql file. It never touches
the database itself. Review the SQL, then apply it once.
"""
import json
import os
import sys

from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Which collections to extract, and how. Each entry maps a CMS key
# "page:collection" to the source HTML file and a parser strategy.
#   strategy "heading_paragraph": each item = an <h3> (name) + the next <p> (description)
TARGETS = [
    {
        "key": "cnc-milling:equipment",
        "file": "cnc-milling.html",
        "strategy": "heading_paragraph",
        "fields": ("name", "description"),
    },
    {
        "key": "metals-alloys:materials",
        "file": "materials.html",
        "strategy": "table_rows",
        # column order in each <tr>: name, category, density, machinability,
        # strength, corrosion, applications. 'family' comes from the row class.
        "columns": ("name", "category", "density", "machinability",
                    "strength", "corrosion", "applications"),
    },
    # Future pages get added here as they are converted.
]


def _text(el):
    return el.get_text(" ", strip=True) if el else ""


def extract_heading_paragraph(container, fields):
    """Items = each <h3> paired with the immediately following <p>."""
    items = []
    name_f, desc_f = fields
    for h in container.find_all(["h2", "h3", "h4"], recursive=True):
        # Skip anything inside the <template> (that's the render stub, not content)
        if h.find_parent("template") is not None:
            continue
        nxt = h.find_next_sibling()
        # advance to the next <p> sibling
        while nxt is not None and nxt.name != "p":
            nxt = nxt.find_next_sibling()
        desc = _text(nxt) if (nxt is not None and nxt.name == "p") else ""
        name = _text(h)
        if name:
            items.append({name_f: name, desc_f: desc})
    return items


_FAMILIES = ("aluminum", "stainless", "steel", "copper", "magnesium", "titanium")


def extract_table_rows(container, columns):
    """Items = each <tr class="material-row ..."> mapped to `columns` by cell order.

    The row's family (aluminum/stainless/…) is read from its class list so the
    page's family filter keeps working on CMS-rendered rows.
    """
    items = []
    for tr in container.find_all("tr"):
        if tr.find_parent("template") is not None:
            continue
        classes = tr.get("class") or []
        if "material-row" not in classes:
            continue
        family = next((c for c in classes if c in _FAMILIES), "")
        cells = tr.find_all("td", recursive=False)
        if not cells:
            continue
        item = {}
        for i, col in enumerate(columns):
            item[col] = _text(cells[i]) if i < len(cells) else ""
        item["family"] = family
        if item.get("name"):
            items.append(item)
    return items


def find_container(soup, key):
    return soup.find(attrs={"data-cms-collection": key})


def sql_escape(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")


def build_sql():
    blocks = []
    summary = []
    for t in TARGETS:
        key = t["key"]
        page, collection = key.split(":", 1)
        path = os.path.join(ROOT, t["file"])
        if not os.path.exists(path):
            print(f"  ⚠  {t['file']} not found — skipping {key}", file=sys.stderr)
            continue
        with open(path, encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "html.parser")
        container = find_container(soup, key)
        if container is None:
            print(f"  ⚠  no data-cms-collection=\"{key}\" in {t['file']} — skipping", file=sys.stderr)
            continue

        if t["strategy"] == "heading_paragraph":
            items = extract_heading_paragraph(container, t["fields"])
        elif t["strategy"] == "table_rows":
            items = extract_table_rows(container, t["columns"])
        else:
            print(f"  ⚠  unknown strategy {t['strategy']} for {key}", file=sys.stderr)
            continue

        lines = [
            f"-- {key}  ({len(items)} items extracted from {t['file']})",
            f"DELETE FROM cms_collections WHERE page = '{sql_escape(page)}' "
            f"AND collection = '{sql_escape(collection)}';",
        ]
        for i, item in enumerate(items):
            payload = sql_escape(json.dumps(item, ensure_ascii=False))
            lines.append(
                "INSERT INTO cms_collections (page, collection, item_data, sort_order) "
                f"VALUES ('{sql_escape(page)}', '{sql_escape(collection)}', "
                f"'{payload}', {i});"
            )
        blocks.append("\n".join(lines))
        summary.append(f"{key}: {len(items)} items")

    header = (
        "-- ============================================================\n"
        "-- Seed cms_collections from existing page content (idempotent).\n"
        "-- Generated by migrations/seed_collections.py — review before applying.\n"
        "-- Re-running is safe: each block DELETEs its own page+collection first.\n"
        "-- ============================================================\n"
    )
    return header + "\n\n".join(blocks) + "\n", summary


def main():
    sql, summary = build_sql()
    out = os.path.join(ROOT, "migrations", "seed-collections.sql")
    with open(out, "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"✓ wrote {out}")
    for line in summary:
        print(f"   • {line}")
    if "--print" in sys.argv:
        print("\n" + sql)


if __name__ == "__main__":
    main()
