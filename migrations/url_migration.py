#!/usr/bin/env python3
"""
#13 — Directory-style URL migration (PLAN + tooling).

This module is the single source of truth for the flat-.html -> directory-URL
map. It generates:
  - deploy/URL-MIGRATION-PLAN.md            (human plan: map, sequence, rollback)
  - deploy/nginx-url-migration.conf.example (serve new URLs + 301 old .html)

It ALSO exposes apply_html_changes() which rewrites canonical / og:url /
internal links / JSON-LD / sitemap to the new URLs. That function is NOT run by
default — it must be deployed in lockstep with the nginx rules (see the plan),
otherwise internal links 404. Run with:  python3 migrations/url_migration.py --apply
"""
import os, re, glob, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://wanfuxin-dg.com"

# flat file  ->  new directory URL (with trailing slash; "/" for home)
URL_MAP = {
    "index.html": "/",
    # Services
    "services.html": "/services/",
    "cnc-milling.html": "/services/cnc-milling/",
    "cnc-turning.html": "/services/cnc-turning/",
    "5-axis.html": "/services/5-axis-cnc-machining/",
    "prototyping.html": "/services/rapid-prototyping/",
    "production.html": "/services/production-machining/",
    "finishing.html": "/services/surface-finishing/",
    "assembly.html": "/services/assembly/",
    "die-casting.html": "/services/die-casting/",
    "forging.html": "/services/forging/",
    "stamping.html": "/services/metal-stamping/",
    "sheet-metal.html": "/services/sheet-metal-fabrication/",
    "investment-casting.html": "/services/investment-casting/",
    "precision-inspection.html": "/services/precision-inspection/",
    # Industries
    "industries.html": "/industries/",
    "aerospace.html": "/industries/aerospace-cnc-machining/",
    "medical.html": "/industries/medical-cnc-machining/",
    "electronics.html": "/industries/electronics-cnc-parts/",
    "industrial.html": "/industries/industrial-equipment-machining/",
    "liquid-cooling.html": "/industries/liquid-cooling-cold-plates/",
    "robotics.html": "/industries/robotics-precision-machining/",
    # Materials
    "materials.html": "/materials/",
    "metals.html": "/materials/metals-alloys/",
    # Quality
    "quality.html": "/quality/",
    "tolerances.html": "/quality/tolerances/",
    # Resources
    "resources.html": "/resources/",
    "design-guide.html": "/resources/design-guide/",
    "material-guide.html": "/resources/material-selection-guide/",
    "downloads.html": "/resources/downloads/",
    "faq.html": "/faq/",
    "blog.html": "/blog/",
    "case-studies.html": "/case-studies/",
    # Company
    "about.html": "/about/",
    "contact.html": "/contact/",
    "careers.html": "/careers/",
    "privacy.html": "/privacy/",
    "terms.html": "/terms/",
}


def gen_nginx():
    lines = [
        "# ============================================================================",
        "# WFX — #13 directory-style URL migration (nginx)",
        "# Serves new directory URLs from the existing .html files (no file moves) and",
        "# 301-redirects the old .html URLs to the new ones. Deploy this AT THE SAME",
        "# TIME as the migrated HTML (canonical/links/sitemap). Review before applying.",
        "#",
        "# Assumes:  root /var/www/wfx;   index index.html;",
        "# try_files serves the file in place (no redirect loop); the .html 301 blocks",
        "# only fire on direct old-URL requests.",
        "# ============================================================================",
        "",
        "# 1) Home: 301 /index.html -> /",
        "location = /index.html { return 301 /; }",
        "",
        "# 2) Serve new directory URLs from existing files + add missing trailing slash",
    ]
    for f, url in URL_MAP.items():
        if url == "/":
            continue
        no_slash = url[:-1]
        lines.append(f"location = {url} {{ try_files /{f} =404; }}")
        lines.append(f"location = {no_slash} {{ return 301 {url}; }}")
    lines += ["", "# 3) 301 old .html URLs -> new directory URLs (preserve query string)"]
    for f, url in URL_MAP.items():
        if url == "/":
            continue
        lines.append(f"location = /{f} {{ return 301 {url}$is_args$args; }}")
    lines += [
        "",
        "# 4) Optional: block direct .html access entirely after verifying redirects work.",
        "# Rollback: remove this file's include and redeploy the original flat HTML.",
        "",
    ]
    out = os.path.join(ROOT, "deploy", "nginx-url-migration.conf.example")
    open(out, "w", encoding="utf-8").write("\n".join(lines))
    return out


def gen_plan():
    rows = "\n".join(f"| `{f}` | `{url}` |" for f, url in URL_MAP.items())
    md = f"""# #13 — Directory-style URL Migration Plan

**Status: PROPOSAL — review before applying. Nothing on the live site has changed.**

## Why
Move from flat `*.html` to clean directory URLs (e.g. `/services/cnc-milling/`),
matching the keyword architecture. Done wrong this loses rankings, so every old
URL gets a permanent 301 to its new home and the change ships in one coordinated step.

## Approach (no file moves, lowest risk)
Keep the existing `.html` files on disk. nginx **serves** the new directory URLs
from those files (`try_files`) and **301-redirects** the old `.html` URLs to the
new ones. The HTML is updated so canonical, og:url, internal links, JSON-LD and
the sitemap all point at the new URLs.

## URL map ({len(URL_MAP)} pages)

| Old (file) | New URL |
|---|---|
{rows}

## Rollout sequence (must be coordinated)
1. **Back up** current HTML + nginx config.
2. Deploy `deploy/nginx-url-migration.conf.example` (review first; merge into the server block) and reload nginx.
3. Verify on staging / a few URLs: new URL returns 200, old `.html` returns 301 -> new, `/index.html` -> `/`. Confirm **no redirect loops**.
4. Run `python3 migrations/url_migration.py --apply` to rewrite canonical/og:url/internal links/JSON-LD/sitemap, then deploy the updated HTML + sitemap.xml.
5. In Search Console: submit the new sitemap, watch Coverage + the Change-of-Address is not needed (same domain).
6. Keep the 301s **permanently** (do not remove old-URL redirects).

## Internal links
`--apply` updates internal `href="x.html"` to the new directory URLs so users and
crawlers never hit an internal 301 chain. Anchors (`#quote`) and query strings are
preserved. It also patches **`content-loader.js`** — the blog list/detail links are
generated in JavaScript (`blog.html?post=slug` -> `/blog/?post=slug`) — and the old
`.html` 301s carry the query string (`$is_args$args`) so `?post=` survives any old
inbound links.

## Rollback
Remove the nginx include and redeploy the backed-up flat HTML + original sitemap.
Because no files were moved or deleted, rollback is a redeploy, not a rebuild.

## Risks & mitigations
- *Redirect loops*: avoided — `try_files` serves files without re-entering redirect
  locations; `.html` 301s only fire on direct old-URL hits. Verify in step 3.
- *Premature HTML deploy*: if migrated HTML ships before nginx, internal links 404.
  Mitigation: deploy nginx first (step 2), HTML second (step 4).
- *Mixed content / hardcoded absolute .html elsewhere*: `--apply` covers HTML files;
  re-grep after applying for any remaining `\\.html` internal references.
"""
    out = os.path.join(ROOT, "deploy", "URL-MIGRATION-PLAN.md")
    open(out, "w", encoding="utf-8").write(md)
    return out


def apply_html_changes():
    """Rewrite canonical/og:url/internal links/JSON-LD/sitemap to new URLs.
    Deploy in lockstep with the nginx rules (see plan)."""
    # full absolute + relative variants -> new absolute URL
    repl = {}
    for f, url in URL_MAP.items():
        new_abs = BASE + url
        repl[f] = (url, new_abs)

    changed = 0
    for page in glob.glob(os.path.join(ROOT, "*.html")):
        name = os.path.basename(page)
        if name == "honeypot-do-not-follow.html":
            continue
        s = open(page, encoding="utf-8").read()
        orig = s
        # internal links: href="x.html"  and  href="x.html#frag" / ?q
        def link_sub(m):
            pre, fn, tail = m.group(1), m.group(2), m.group(3)
            if fn in URL_MAP:
                return f'{pre}"{URL_MAP[fn]}{tail}"'
            return m.group(0)
        s = re.sub(r'(href=)"([a-z0-9-]+\.html)((?:#[^"]*|\?[^"]*)?)"', link_sub, s)
        # absolute URLs (canonical, og:url, JSON-LD): https://.../x.html -> new abs
        for fn, (url, new_abs) in repl.items():
            s = s.replace(f'{BASE}/{fn}', new_abs)
        if s != orig:
            open(page, "w", encoding="utf-8").write(s)
            changed += 1

    # sitemap.xml
    sm = os.path.join(ROOT, "sitemap.xml")
    if os.path.exists(sm):
        s = open(sm, encoding="utf-8").read()
        for fn, (url, new_abs) in repl.items():
            s = s.replace(f'{BASE}/{fn}', new_abs)
        open(sm, "w", encoding="utf-8").write(s)

    # content-loader.js — blog list/detail links are generated in JS
    cl = os.path.join(ROOT, "content-loader.js")
    if os.path.exists(cl):
        s = open(cl, encoding="utf-8").read()
        s = s.replace("'blog.html?post=' +", "'/blog/?post=' +")
        s = s.replace("back.setAttribute('href', 'blog.html')",
                       "back.setAttribute('href', '/blog/')")
        open(cl, "w", encoding="utf-8").write(s)
    return changed


def main():
    p = gen_plan()
    n = gen_nginx()
    print("Wrote:")
    print("  " + os.path.relpath(p, ROOT))
    print("  " + os.path.relpath(n, ROOT))
    if "--apply" in sys.argv:
        c = apply_html_changes()
        print(f"APPLIED HTML changes to {c} pages + sitemap.xml (deploy with nginx rules!).")
    else:
        print("Plan only. Re-run with --apply (after nginx is deployed) to rewrite HTML.")


if __name__ == "__main__":
    main()
