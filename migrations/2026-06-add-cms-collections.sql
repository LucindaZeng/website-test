-- ============================================================================
-- Migration: generic per-page editable collections
-- Date: 2026-06
-- Purpose: Let ANY page hold add/remove lists (equipment, materials, specs…)
--          without per-page columns. Each item is a JSON blob whose fields are
--          defined by the page's schema in the admin. Generalises the
--          single-purpose cms_industry_products into a reusable mechanism.
--
-- SAFETY: Purely additive. Creates ONE new table. Touches no existing table,
--         no existing data. cms_industry_products keeps working untouched.
--         If anything goes wrong, run the ROLLBACK block at the bottom.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cms_collections (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    page        VARCHAR(64)  NOT NULL,            -- e.g. 'cnc-milling', 'metals-alloys'
    collection  VARCHAR(64)  NOT NULL,            -- e.g. 'equipment', 'materials'
    item_data   JSON         NOT NULL,            -- arbitrary fields per page schema
    sort_order  INT          NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_page_collection (page, collection, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- ROLLBACK (run only if you need to undo this migration):
--   DROP TABLE IF EXISTS cms_collections;
-- ----------------------------------------------------------------------------
