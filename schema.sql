-- ============================================================================
-- WFX Wanfuxin Website — MySQL Schema
-- ============================================================================
-- Run this once to set up the database:
--   mysql -u root -p < schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS wfx_website
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE wfx_website;

-- ----------------------------------------------------------------------------
-- Quote Requests Table
-- Stores all customer quote submissions from index.html quote form
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quote_requests (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status          ENUM('new', 'contacted', 'quoted', 'won', 'lost')
                                  NOT NULL DEFAULT 'new',

    -- Customer information (collected from quote form)
    customer_name   VARCHAR(200),
    customer_email  VARCHAR(200)  NOT NULL,
    customer_phone  VARCHAR(50),
    customer_company VARCHAR(200),

    -- Project details from form
    material        VARCHAR(100),
    quantity        VARCHAR(50),
    finish          VARCHAR(100),
    lead_time       VARCHAR(100),
    notes           TEXT,

    -- File attachment metadata (file stored on disk; only path saved here)
    file_original_name VARCHAR(255),
    file_stored_name   VARCHAR(255),
    file_size_bytes    BIGINT,
    file_mime_type     VARCHAR(100),

    -- Tracking
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(500),

    INDEX idx_created_at (created_at),
    INDEX idx_status (status),
    INDEX idx_email (customer_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Contact Form Submissions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_submissions (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status          ENUM('new', 'replied', 'closed') NOT NULL DEFAULT 'new',

    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    email           VARCHAR(200)  NOT NULL,
    phone           VARCHAR(50),
    company         VARCHAR(200),
    inquiry_type    VARCHAR(100),
    message         TEXT,

    ip_address      VARCHAR(45),
    user_agent      VARCHAR(500),

    INDEX idx_created_at (created_at),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Categories Table — used for both News/Blog Articles and Products
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    type            ENUM('news', 'product') NOT NULL,
    name            VARCHAR(100)  NOT NULL,
    slug            VARCHAR(100)  NOT NULL,
    description     VARCHAR(500),
    sort_order      INT           DEFAULT 0,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_type_slug (type, slug),
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default category seed data
INSERT IGNORE INTO categories (type, name, slug, description, sort_order) VALUES
    ('news',    'Company News',         'company-news',       'WFX company announcements and updates', 1),
    ('news',    'Industry Insights',    'industry-insights',  'Manufacturing trends and analysis',     2),
    ('news',    'Technical Articles',   'technical-articles', 'Engineering deep-dives and tutorials',  3),
    ('news',    'Case Studies',         'case-studies',       'Customer success stories',              4),
    ('news',    'Events & Exhibitions', 'events',             'Trade shows and company events',        5),
    ('product', 'Aerospace',            'aerospace',          'Aerospace components',                  1),
    ('product', 'Medical',              'medical',            'Medical device parts',                  2),
    ('product', 'Electronics',          'electronics',        'Electronics enclosures and parts',      3),
    ('product', 'Robotics',             'robotics',           'Robotics components',                   4),
    ('product', 'Industrial',           'industrial',         'Industrial machinery parts',            5),
    ('product', 'Liquid Cooling',       'liquid-cooling',     'Cold plates, heat sinks, manifolds',    6);

-- ----------------------------------------------------------------------------
-- Notes:
-- 1. File attachments (CAD files) are stored on disk under /uploads/quotes/
--    NOT in MySQL. Only metadata (path, size, original name) is saved here.
--    Storing 100MB CAD files in MySQL would balloon database size and hurt
--    backup/restore performance.
-- 2. Backup uploads/ separately (rsync to S3, NAS, etc.)
-- ----------------------------------------------------------------------------

-- ============================================================================
-- CMS Content Tables (added in Round 3)
-- These persist data that was previously only in browser localStorage,
-- making it visible to all users and to Google's crawler.
-- ============================================================================

USE wfx_website;

-- Generic key/value store for site-wide content
-- (homepage media config, page content blocks, settings, etc.)
CREATE TABLE IF NOT EXISTS cms_content (
    content_key   VARCHAR(100)    PRIMARY KEY,
    content_value MEDIUMTEXT      NOT NULL,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Industry products (shown on aerospace.html, medical.html, etc.)
CREATE TABLE IF NOT EXISTS cms_industry_products (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    industry        VARCHAR(50)     NOT NULL,
    name            VARCHAR(200)    NOT NULL,
    description     TEXT,
    image_url       VARCHAR(500),
    sort_order      INT             DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_industry (industry)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- News/blog posts
CREATE TABLE IF NOT EXISTS cms_news (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    type            ENUM('news','blog') NOT NULL DEFAULT 'news',
    title           VARCHAR(300)    NOT NULL,
    slug            VARCHAR(300)    NOT NULL,
    category        VARCHAR(100),
    excerpt         TEXT,
    content         MEDIUMTEXT,
    image_url       VARCHAR(500),
    author          VARCHAR(100),
    published_at    DATETIME,
    is_published    TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_type_slug (type, slug),
    INDEX idx_type_published (type, is_published, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

