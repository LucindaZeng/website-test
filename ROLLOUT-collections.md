# Page Collections — Rollout Guide

This adds a **generic, schema-driven** way to make any page's repeatable lists
(equipment, materials, processes…) editable in the admin, plus a **page/module
file-organization** convention for uploaded images. Built as a backward-compatible
layer: until you run the seed step, every page renders exactly as before.

---

## What changed (Phase 1 — foundation + CNC Milling)

| Area | Change | Risk |
|------|--------|------|
| DB | New table `cms_collections` (page + collection + JSON item). Nothing else touched. | None — additive |
| Backend | `/api/cms/collections/<page>/<collection>` GET/POST, reusing existing auth, CSRF, RBAC, audit log | Low |
| Injection | `window.__WFX_CMS__.collections` added to every page's first paint | Low |
| Frontend | Isolated renderer appended to `content-loader.js` — try/caught; **falls back to inline HTML** if CMS empty/unavailable | Low |
| CNC Milling | Equipment section wrapped with `data-cms-collection` + a `<template>`; original 3 items kept as fallback | Low |
| Admin | New `admin/collections.html` (add/remove/reorder/edit), driven by `admin/js/page-schemas.js`; nav link added to 14 admin pages | Low (admin only) |
| Media | Upload folders may now be nested page paths (`pages/cnc-milling/equipment`); list/delete handle nesting; flat folders still work | Low |

**The safety guarantee:** the renderer only replaces a page's inline list when the
CMS actually has items for that exact `page:collection`. No data → the original
hardcoded HTML stays. A thrown error in the renderer is caught and the fallback
stays. Verified in a headless DOM across three cases (no CMS / empty CMS / edited CMS).

---

## Deploying Phase 1 (exact order)

1. **Back up the database** (mysqldump) and the site folder.
2. Apply the table migration:
   ```
   mysql <db> < migrations/2026-06-add-cms-collections.sql
   ```
   At this point nothing on the site looks different — the table is empty, so
   every page still shows its inline fallback.
3. Restart `server.py`. Confirm pages render normally and the admin loads.
4. **Seed** the existing CNC Milling equipment so it becomes editable without
   retyping (the SQL was generated from the live HTML, so content is identical):
   ```
   mysql <db> < migrations/seed-collections.sql
   ```
   Re-run `python3 migrations/seed_collections.py` first if the page changed.
5. Open **Admin → Page Collections → CNC Milling → Equipment**. You should see the
   3 machines. Edit/add/remove, Save, then reload `cnc-milling.html` to confirm.

Rollback at any step: `DROP TABLE cms_collections;` (page reverts to inline HTML).

---

## How an editor uses it

Admin → **Page Collections** → pick page → pick collection → add / edit / drag to
reorder / delete → **Save changes**. Required fields are validated before save.
RBAC: `super_admin` and `chief_editor` can edit; others are read-only.

---

## File-organization convention (requirement #2)

Uploaded images are grouped by the page/module they belong to:

```
uploads/media/
  pages/
    cnc-milling/
      equipment/      ← one image per machine
      hero/
    metals-alloys/
      materials/      ← one image per material
    <page>/
      <collection|hero|...>/
  general/            ← legacy / uncategorised (still works)
  products/           ← existing industry-product images (unchanged)
```

When uploading, set the **folder** to `pages/<page>/<collection>`. The server
sanitises it (max depth 4; segments are alphanumeric/dash/underscore; `..` and
absolute paths rejected) and stores the file there. The returned URL
(`/uploads/media/pages/cnc-milling/equipment/<file>`) goes straight into the
item's image field. Opening the media folder now tells you exactly which page
and module each file belongs to.

---

## Extending to full coverage (the repeatable recipe)

Each remaining page is the **same 3 steps**, and each page is independent — a
mistake on one never affects the others, and an unseeded page just keeps its
current HTML.

**Step 1 — Declare the schema.** Add an entry to `admin/js/page-schemas.js`:
```js
"cnc-turning": {
  label: "CNC Turning",
  collections: { equipment: { label: "Equipment", itemLabel: "Machine",
    fields: [ {key:"name",type:"text",required:true},
              {key:"description",type:"textarea",required:true} ] } }
}
```

**Step 2 — Wire the page.** In the page's HTML, wrap the existing list in
`<div data-cms-collection="cnc-turning:equipment"> … existing items … <template
data-cms-item> … </template></div>`. Inside the template, mark fields with
`data-field="name"`, `data-field="description"`, `data-field-src="image"`,
`data-field-href="link"`. Keep the existing items as the fallback.

**Step 3 — Seed.** Add the page to the `TARGETS` list in
`migrations/seed_collections.py`, run it, review the generated SQL, apply it.

Then the page is editable in Admin → Page Collections with zero new code.

### Suggested order (low-risk first)

1. **Service pages** (small, prose-style lists, like CNC Milling):
   `cnc-turning`, `5-axis`, `sheet-metal`, `die-casting`, `investment-casting`,
   `forging`, `stamping`, `finishing`, `assembly`, `precision-inspection`.
2. **Material pages** (large — `metals.html`, `materials.html` are 200KB+; convert
   in batches by material family, verify after each batch). Schema for
   `metals-alloys:materials` is already in `page-schemas.js`.
3. **Industry pages** — already editable via Industry Products; optionally migrate
   into `cms_collections` later for one unified editor (not required).

Do one page, deploy, verify, move on. That is what keeps "full coverage" from
ever being a high-risk change.
