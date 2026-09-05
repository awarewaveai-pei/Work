-- Reverses 0011_wave1_trust_domain_scope_up.sql only. Does not touch
-- 0001-0010. Safe to run against a schema where those ten are still applied
-- and 0011 is being rolled back independently. Idempotent: a second run, or
-- a run against a schema that never had 0011 applied, no-ops.
--
-- Not exercised by test-wave1-local.ps1's reversibility pass (whole-schema
-- 0001_down covers it); verified manually, see ADR-0004's Implementation
-- note.
BEGIN;
SET LOCAL lock_timeout = '3s';
-- M3 (db-expert, 2026-09-05): hci.subject_records is FORCE ROW LEVEL
-- SECURITY (0001:343-345). Under a non-superuser owner (the real production
-- shape FORCE exists for - the test container's hci_owner is a superuser, so
-- this never surfaces locally), the guard below's own SELECT would silently
-- match zero rows instead of erroring, this migration would then drop
-- domain/evidence_ref_* while real TRUST_DOMAIN rows still exist, and 0011
-- could never be re-applied afterwards. Same fix, same reasoning 0009 (M4)
-- already applied to every SECURITY DEFINER function in this schema - here
-- applied to the down-migration's DO block instead, which needed it too.
SET LOCAL row_security = off;

-- Idempotency guard (db-expert N3, 2026-09-05): the ORIGINAL guard checked
-- only for TRUST_DOMAIN rows, so a run against a schema that PREDATES 0011
-- - which could legally hold a TRUST_DOMAIN row with none of these columns,
-- e.g. this suite's own pre-0011 TARGET-KIND-01a shape - would RAISE instead
-- of the header's claimed no-op. Checking the column's existence first makes
-- "0011 was never applied" a true no-op, and only refuses when the column
-- exists AND is populated (0011 applied, not empty).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'hci' AND table_name = 'subject_records' AND column_name = 'domain'
  ) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM hci.subject_records WHERE kind = 'TRUST_DOMAIN') THEN
    RAISE EXCEPTION 'refusing to drop domain / evidence_ref_id / evidence_ref_kind while TRUST_DOMAIN rows exist; this down migration is the empty-schema case only and 0011 could not be re-applied afterwards';
  END IF;
END $$;

DROP INDEX IF EXISTS hci.subject_records_trust_domain_evidence_ref_idx;
DROP INDEX IF EXISTS hci.subject_records_trust_domain_unique;

ALTER TABLE hci.subject_records
  DROP CONSTRAINT IF EXISTS subject_records_evidence_ref_fk,
  DROP CONSTRAINT IF EXISTS subject_records_person_kind_unique,
  DROP CONSTRAINT IF EXISTS subject_records_evidence_ref_kind_required,
  DROP CONSTRAINT IF EXISTS subject_records_evidence_ref_kind_scoped,
  DROP CONSTRAINT IF EXISTS subject_records_evidence_ref_id_required,
  DROP CONSTRAINT IF EXISTS subject_records_evidence_ref_id_scoped,
  DROP CONSTRAINT IF EXISTS subject_records_trust_domain_no_supersede,
  DROP CONSTRAINT IF EXISTS subject_records_domain_required,
  DROP CONSTRAINT IF EXISTS subject_records_domain_scoped,
  DROP COLUMN IF EXISTS evidence_ref_kind,
  DROP COLUMN IF EXISTS evidence_ref_id,
  DROP COLUMN IF EXISTS domain;

REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref,
              author_class, claim_state, human_spotcheck_status, spotcheck_principal_id,
              epistemic_label, epistemic_verifier_principal_id)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

COMMIT;
