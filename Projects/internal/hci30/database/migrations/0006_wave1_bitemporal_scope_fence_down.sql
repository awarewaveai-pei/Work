-- Reverses 0006_wave1_bitemporal_scope_fence_up.sql only. Does not touch
-- 0001-0005's tables/roles/schema. Safe to run against a schema where those
-- five are still applied and 0006 is being rolled back independently.
--
-- Not currently exercised by test-wave1-local.ps1's reversibility pass -
-- 0001_wave1_synthetic_down.sql (DROP SCHEMA hci CASCADE) already tears down
-- everything 0002-0006 add along with everything 0001 adds, in one step,
-- because all six live in the same schema.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('persons'), ('tenant_authorizations'), ('subject_lawful_basis_records'),
      ('sources'), ('source_terms_records'), ('research_workflows'),
      ('identity_candidates'), ('identity_verifications'),
      ('data_subject_requests'), ('data_subject_request_targets')
    ) AS t(tbl)
  LOOP
    EXECUTE format('ALTER TABLE hci.%I DROP COLUMN IF EXISTS created_at', rec.tbl);
    -- Restore the pre-0006 table-level INSERT/UPDATE grant shape (0001's
    -- original loop), so a narrower rollback that keeps 0001-0005 applied
    -- leaves each table exactly as it was before 0006.
    EXECUTE format('REVOKE INSERT, UPDATE ON hci.%I FROM hci_app_test_a, hci_app_test_b', rec.tbl);
    EXECUTE format('GRANT INSERT, UPDATE ON hci.%I TO hci_app_test_a, hci_app_test_b', rec.tbl);
  END LOOP;
END $$;

ALTER TABLE hci.source_relationships DROP COLUMN IF EXISTS created_at;
REVOKE INSERT ON hci.source_relationships FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT ON hci.source_relationships TO hci_app_test_a, hci_app_test_b;

COMMIT;
