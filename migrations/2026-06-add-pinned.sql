-- ============================================================================
-- WFX migration: add is_pinned (置顶) to cms_news (blog + news articles)
-- ============================================================================
-- Lets editors pin/feature specific articles to the top of listings.
-- New deployments get this from schema.sql automatically.
--
-- USAGE:
--   mysql -u wfx_user -p wfx_website < migrations/2026-06-add-pinned.sql
-- ============================================================================

ALTER TABLE cms_news
    ADD COLUMN is_pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER is_published;

-- Index to make "pinned first" ordering fast
ALTER TABLE cms_news
    ADD INDEX idx_pinned (type, is_pinned);

SELECT 'is_pinned column added to cms_news.' AS status;
