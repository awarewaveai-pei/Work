-- Reverses 0016_wave1_case_report_snapshots_up.sql only. Does not touch
-- 0001-0015. Pure DROP TABLE: 0016 added a wholly new table and reused
-- existing shared functions/triggers (hci.reject_update_delete(),
-- hci.current_tenant_id()) without modifying them, so nothing else needs
-- restoring.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP TABLE hci.case_report_snapshots;

COMMIT;
