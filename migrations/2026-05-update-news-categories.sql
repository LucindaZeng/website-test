-- ============================================================================
-- WFX migration: replace generic news categories with 5 technical content pillars
-- ============================================================================
--
-- Run AGAINST AN EXISTING DATABASE that was set up before this category change.
-- New deployments don't need this — schema.sql already has the right seed.
--
-- USAGE:
--   mysql -u wfx_user -p wfx_website < migrations/2026-05-update-news-categories.sql
--
-- BEHAVIOR:
--   1. Add the 5 new news categories (CNC Processes, Materials, DFM, Finishing, Related)
--   2. Reassign any existing articles using the old categories to the closest new one
--   3. Delete the old categories ONLY if no articles still reference them
--
-- ROLLBACK:
--   This migration is destructive (it deletes old categories). Take a backup first:
--     mysqldump -u wfx_user -p wfx_website categories cms_news > backup-pre-migration.sql
--   To roll back: mysql -u wfx_user -p wfx_website < backup-pre-migration.sql
-- ============================================================================

START TRANSACTION;

-- ─── 1. Insert new categories ──────────────────────────────────────────────
INSERT IGNORE INTO categories (type, name, slug, description, sort_order) VALUES
    ('news', 'CNC Processes & Machines',     'cnc-processes',       'Milling, turning, 5-axis, EDM techniques and machine capabilities',     1),
    ('news', 'Materials Knowledge Hub',      'materials',           'Aluminum, steel, titanium, plastics — properties and machinability',    2),
    ('news', 'Engineering Drawings & DFM',   'drawings-dfm',        'Design for manufacturability, tolerances, GD&T, drawing standards',     3),
    ('news', 'Surface Finishing',            'surface-finishing',   'Anodizing, plating, coating, polishing, passivation — post-processing',  4),
    ('news', 'Related Processes & Quality',  'related-processes',   'Casting, forging, sheet metal, inspection, QA, certifications',         5);

-- ─── 2. Reassign existing articles ──────────────────────────────────────────
-- Best-effort mapping from old slugs to new pillars. Anything technical →
-- "cnc-processes" (the most general technical bucket). Articles can be
-- re-categorized manually in the admin UI afterwards.
--
-- Note: cms_news.category stores the slug as a string (not a FK), so we update
-- by slug name directly.

UPDATE cms_news SET category = 'cnc-processes'    WHERE category = 'technical-articles';
UPDATE cms_news SET category = 'related-processes' WHERE category = 'case-studies';
UPDATE cms_news SET category = 'related-processes' WHERE category = 'industry-insights';
-- Company news + events have no good technical pillar. Move to related-processes
-- so articles aren't orphaned; admin can recategorize or delete as needed.
UPDATE cms_news SET category = 'related-processes' WHERE category = 'company-news';
UPDATE cms_news SET category = 'related-processes' WHERE category = 'events';

-- ─── 3. Delete the now-unused old categories ────────────────────────────────
-- Safe because we just reassigned all references in cms_news above.
DELETE FROM categories
WHERE type = 'news'
  AND slug IN ('company-news', 'industry-insights', 'technical-articles', 'case-studies', 'events');

-- ─── 4. Resequence sort_order so the new categories appear cleanly in admin UI
UPDATE categories SET sort_order = 1 WHERE type='news' AND slug='cnc-processes';
UPDATE categories SET sort_order = 2 WHERE type='news' AND slug='materials';
UPDATE categories SET sort_order = 3 WHERE type='news' AND slug='drawings-dfm';
UPDATE categories SET sort_order = 4 WHERE type='news' AND slug='surface-finishing';
UPDATE categories SET sort_order = 5 WHERE type='news' AND slug='related-processes';

COMMIT;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- Run after migration:
--   SELECT type, name, slug, sort_order FROM categories WHERE type='news' ORDER BY sort_order;
-- Expected: exactly the 5 new categories above, in order.
