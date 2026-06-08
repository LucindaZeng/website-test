-- ============================================================================
-- WFX — schema additions (reconcile schema.sql with what server.py uses)
-- ============================================================================
-- The base schema.sql does not include two things that server.py requires
-- (they were introduced in later rounds): the cms_collections table and the
-- is_pinned column on cms_news. Apply this AFTER schema.sql. Idempotent
-- (IF NOT EXISTS), and uses the same style as schema.sql.
--
--   mysql -u root -p wfx_website < migrations/schema-additions.sql
-- ============================================================================

USE wfx_website;

-- ----------------------------------------------------------------------------
-- Schema-driven CMS collections (case-studies, tolerances, materials, faq,
-- services, industries, finishing, etc.). One row per list item; item_data is
-- the item's fields as a JSON string (server.py writes json.dumps, reads with
-- json.loads). Rendered into <div data-cms-collection="page:collection"> by
-- content-loader.js, edited in Admin -> Page Collections.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cms_collections (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    page        VARCHAR(100)    NOT NULL,
    collection  VARCHAR(100)    NOT NULL,
    item_data   MEDIUMTEXT      NOT NULL,
    sort_order  INT             DEFAULT 0,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_page_collection (page, collection)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- cms_news: pinned flag used by the homepage "What's New" picker and ordering
-- (server.py: ORDER BY is_pinned DESC, ... and INSERT includes is_pinned).
-- ----------------------------------------------------------------------------
ALTER TABLE cms_news
    ADD COLUMN IF NOT EXISTS is_pinned TINYINT(1) NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- Data fix (#5): older builds stored Liquid-Cooling industry products under the
-- key 'automotive'. The admin editor and pages now use 'liquid-cooling'. Move
-- any existing rows so they show on /industries/liquid-cooling-cold-plates/.
-- ----------------------------------------------------------------------------
UPDATE cms_industry_products SET industry = 'liquid-cooling'
    WHERE industry = 'automotive';
