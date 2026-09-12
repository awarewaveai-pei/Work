-- Reverses 0019_wave1_case_auto_promote_audit_up.sql only. Does not touch
-- 0001-0018. Drops the one new function (added in a critic-review followup
-- to the original up-migration, see that file) then the table; both are
-- wholly new to 0019 and reuse existing shared functions/triggers
-- (hci.reject_update_delete(), hci.current_tenant_id()) without modifying
-- them, so nothing else needs restoring.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP FUNCTION hci.set_case_auto_promote_rule_findings(uuid, boolean, uuid);
DROP TABLE hci.case_auto_promote_audit;

COMMIT;
