-- ============================================================================
-- WFX migration: make admin_audit_log immutable (append-only)
-- ============================================================================
--
-- Defense in depth for the audit trail. The application code never issues
-- UPDATE or DELETE against admin_audit_log, but a compromised app account or
-- a careless admin with direct DB access could still tamper with history.
-- These triggers block UPDATE and DELETE at the database engine level — even
-- a user with full table privileges cannot modify or remove a logged row.
--
-- USAGE:
--   mysql -u root -p wfx_website < migrations/2026-05-audit-log-immutable.sql
--
-- NOTE: Must be run by a user with TRIGGER privilege (usually root or a DBA
-- account). The application's normal DB user does NOT need this privilege.
--
-- TO REMOVE (if you ever need to prune very old logs under controlled
-- conditions): drop the triggers, perform the maintenance, then recreate them:
--   DROP TRIGGER IF EXISTS trg_audit_no_update;
--   DROP TRIGGER IF EXISTS trg_audit_no_delete;
--   ... (do controlled maintenance) ...
--   ... (re-run this file) ...
--
-- For legitimate long-term retention management, prefer PARTITIONING by month
-- and dropping whole old partitions under a documented process, rather than
-- row-level deletes. That keeps the immutability guarantee for active data.
-- ============================================================================

DELIMITER $$

-- Block UPDATE: any attempt to modify an existing audit row raises an error
DROP TRIGGER IF EXISTS trg_audit_no_update$$
CREATE TRIGGER trg_audit_no_update
BEFORE UPDATE ON admin_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'admin_audit_log is append-only: UPDATE is not permitted';
END$$

-- Block DELETE: any attempt to remove an audit row raises an error
DROP TRIGGER IF EXISTS trg_audit_no_delete$$
CREATE TRIGGER trg_audit_no_delete
BEFORE DELETE ON admin_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'admin_audit_log is append-only: DELETE is not permitted';
END$$

DELIMITER ;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- After running, test that the triggers work (these SHOULD fail):
--   UPDATE admin_audit_log SET action='x' WHERE id=1;   -- Error 1644
--   DELETE FROM admin_audit_log WHERE id=1;             -- Error 1644
-- And that INSERT still works (the app relies on this):
--   INSERT still succeeds normally.
SELECT 'Audit log immutability triggers installed.' AS status;
