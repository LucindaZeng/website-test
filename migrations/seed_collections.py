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
    {
        "key": "services:cards", "file": "services.html", "strategy": "cards",
        "item_selector": "a.service-card-link",
        "fields": {
            "title": {"sel": "h3"},
            "description": {"sel": "p"},
            "link": {"attr": "href"},
            "icon": {"sel": "i", "attr": "class"},
        },
    },
    {
        "key": "industries:cards", "file": "industries.html", "strategy": "cards",
        "item_selector": "div.industry-card",
        "fields": {
            "title": {"sel": ".industry-card-content h3"},
            "description": {"sel": ".industry-card-content p"},
            "link": {"sel": ".industry-card-content a", "attr": "href"},
            "image": {"sel": "img", "attr": "src"},
            "icon": {"sel": ".industry-icon i", "attr": "class"},
        },
    },
    {
        "key": "faq:general", "file": "faq.html", "strategy": "cards",
        "item_selector": ".faq-item",
        "fields": {"question": {"sel": ".faq-question"}, "answer": {"sel": ".faq-answer"}},
    },
    {
        "key": "faq:technical", "file": "faq.html", "strategy": "cards",
        "item_selector": ".faq-item",
        "fields": {"question": {"sel": ".faq-question"}, "answer": {"sel": ".faq-answer"}},
    },
    {
        "key": "faq:ordering", "file": "faq.html", "strategy": "cards",
        "item_selector": ".faq-item",
        "fields": {"question": {"sel": ".faq-question"}, "answer": {"sel": ".faq-answer"}},
    },
    # Future pages get added here as they are converted.
]

# finishing.html: 7 process families, each its own grid/collection. Same card shape.
for _slug in ("electroplating", "chemical-treatment", "anodizing", "heat-treatment",
              "mechanical", "marking-printing", "other-specialty"):
    TARGETS.append({
        "key": f"finishing:{_slug}", "file": "finishing.html", "strategy": "cards",
        "item_selector": ".process-card",
        "fields": {
            "title":        {"sel": "h3"},
            "icon":         {"sel": "h3 i", "attr": "class"},
            "description":  {"sel": "p"},
            "features":     {"sel": ".process-features li", "list": True, "join": "\n"},
            "applications": {"sel": ".process-applications span"},
        },
    })


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


def _extract_field(item_el, spec):
    """spec: {"sel": css?, "attr": attr?, "list": bool?}. Reads from a descendant
    (or the item itself if no sel). 'list' returns an array of texts from all
    matches; otherwise text by default, or an attribute if 'attr' is given."""
    if spec.get("list"):
        vals = [_text(e) for e in item_el.select(spec["sel"]) if _text(e)]
        return spec["join"].join(vals) if spec.get("join") else vals
    target = item_el
    if spec.get("sel"):
        target = item_el.select_one(spec["sel"])
        if target is None:
            return ""
    if spec.get("attr"):
        val = target.get(spec["attr"], "")
        return " ".join(val) if isinstance(val, list) else (val or "")
    return _text(target)


def extract_cards(container, item_selector, fields):
    """Generic: each element matching item_selector becomes an item; each field
    is pulled per its spec. Items inside the <template> stub are skipped."""
    items = []
    for el in container.select(item_selector):
        if el.find_parent("template") is not None:
            continue
        item = {k: _extract_field(el, spec) for k, spec in fields.items()}
        # need at least one non-empty value to count as a real item
        if any(str(v).strip() for v in item.values()):
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
        elif t["strategy"] == "cards":
            items = extract_cards(container, t["item_selector"], t["fields"])
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
