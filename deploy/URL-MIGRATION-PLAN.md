# #13 — Directory-style URL Migration Plan

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

## URL map (38 pages)

| Old (file) | New URL |
|---|---|
| `index.html` | `/` |
| `services.html` | `/services/` |
| `cnc-milling.html` | `/services/cnc-milling/` |
| `cnc-turning.html` | `/services/cnc-turning/` |
| `5-axis.html` | `/services/5-axis-cnc-machining/` |
| `prototyping.html` | `/services/rapid-prototyping/` |
| `production.html` | `/services/production-machining/` |
| `finishing.html` | `/services/surface-finishing/` |
| `assembly.html` | `/services/assembly/` |
| `die-casting.html` | `/services/die-casting/` |
| `forging.html` | `/services/forging/` |
| `stamping.html` | `/services/metal-stamping/` |
| `sheet-metal.html` | `/services/sheet-metal-fabrication/` |
| `investment-casting.html` | `/services/investment-casting/` |
| `precision-inspection.html` | `/services/precision-inspection/` |
| `industries.html` | `/industries/` |
| `aerospace.html` | `/industries/aerospace-cnc-machining/` |
| `medical.html` | `/industries/medical-cnc-machining/` |
| `electronics.html` | `/industries/electronics-cnc-parts/` |
| `industrial.html` | `/industries/industrial-equipment-machining/` |
| `liquid-cooling.html` | `/industries/liquid-cooling-cold-plates/` |
| `robotics.html` | `/industries/robotics-precision-machining/` |
| `materials.html` | `/materials/` |
| `metals.html` | `/materials/metals-alloys/` |
| `quality.html` | `/quality/` |
| `tolerances.html` | `/quality/tolerances/` |
| `resources.html` | `/resources/` |
| `design-guide.html` | `/resources/design-guide/` |
| `material-guide.html` | `/resources/material-selection-guide/` |
| `downloads.html` | `/resources/downloads/` |
| `faq.html` | `/faq/` |
| `blog.html` | `/blog/` |
| `case-studies.html` | `/case-studies/` |
| `about.html` | `/about/` |
| `contact.html` | `/contact/` |
| `careers.html` | `/careers/` |
| `privacy.html` | `/privacy/` |
| `terms.html` | `/terms/` |

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
  re-grep after applying for any remaining `\.html` internal references.
