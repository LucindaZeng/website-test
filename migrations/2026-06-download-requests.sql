-- ============================================================================
-- WFX migration: add download_requests table
-- ============================================================================
-- For existing databases set up before resource-request tracking was added.
-- New deployments get this table from schema.sql automatically.
--
-- USAGE:
--   mysql -u wfx_user -p wfx_website < migrations/2026-06-download-requests.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS download_requests (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status          ENUM('new', 'contacted', 'sent', 'closed')
                                  NOT NULL DEFAULT 'new',

    resource        VARCHAR(200)  NOT NULL,

    customer_name    VARCHAR(200),
    customer_email   VARCHAR(200)  NOT NULL,
    customer_company VARCHAR(200),
    customer_industry VARCHAR(200),
    customer_phone   VARCHAR(50),
    notes            TEXT,

    ip_address      VARCHAR(45),
    user_agent      VARCHAR(500),

    INDEX idx_created_at (created_at),
    INDEX idx_status (status),
    INDEX idx_email (customer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'download_requests table created.' AS status;
