-- Reverses 0009_wave1_adr0019_hardening_up.sql only. Does not touch 0001-0008.
-- Safe to run against a schema where those eight are still applied and 0009
-- is being rolled back independently.
--
-- Not currently exercised by test-wave1-local.ps1's reversibility pass -
-- 0001_wave1_synthetic_down.sql (DROP SCHEMA hci CASCADE) already tears down
-- everything 0002-0009 add along with everything 0001 adds, in one step.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- Empty-state guard, written idempotent from the start (the m3 lesson found
-- against 0008_down.sql's first version): a second run, or a run against a
-- schema that never had 0009 applied, must no-op rather than fail on an
-- object that is already gone. Two things make that hard here and both are
-- handled explicitly: (1) the column being dropped cannot appear in a
-- statically-parsed query, because PL/pgSQL parses the whole block before
-- running any of it and would raise 42703 on the second run even inside a
-- branch that is never taken - so the data check runs via EXECUTE, only
-- after information_schema confirms the column still exists; (2)
-- `to_regclass(...) IS NOT NULL AND EXISTS(...)` in one boolean is NOT
-- safe (PostgreSQL does not guarantee short-circuit evaluation - this
-- schema's own 0003/0005 history hit exactly that), hence nested IFs.
DO $$
DECLARE v_present boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'hci' AND table_name = 'subject_records'
                AND column_name = 'spotcheck_principal_id') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM hci.subject_records WHERE spotcheck_principal_id IS NOT NULL)'
       INTO v_present;
    IF v_present THEN
      RAISE EXCEPTION 'refusing to drop spotcheck_principal_id while a subject_records row still references one; this down migration does not preserve that data';
    END IF;
  END IF;
END $$;

-- M4 / search_path / index additions are pure config and index objects:
-- RESET returns each function to its pre-0009 config exactly (a RESET on a
-- parameter that is not set is a no-op, so this block is idempotent too).
-- Only the eleven functions 0009 itself pinned are RESET - the ones that
-- carried search_path from their own CREATE (0001's current_tenant_id(),
-- 0005/0007/0008's definers, the four _as_of() functions) keep it.
ALTER FUNCTION hci.current_tenant_id() RESET row_security;
ALTER FUNCTION hci.mark_superseded() RESET row_security;
ALTER FUNCTION hci.tombstone_evidence(uuid) RESET row_security;
ALTER FUNCTION hci.flag_claims_on_risk_elevation() RESET row_security;
ALTER FUNCTION hci.enforce_decision_reaudit_gate() RESET row_security;
ALTER FUNCTION hci.require_active_authorization() RESET search_path;
ALTER FUNCTION hci.enforce_dsr_transition() RESET search_path;
ALTER FUNCTION hci.reject_update_delete() RESET search_path;
ALTER FUNCTION hci.reject_tenant_change() RESET search_path;
ALTER FUNCTION hci.require_identity_verification() RESET search_path;
ALTER FUNCTION hci.protect_identity_evidence() RESET search_path;
ALTER FUNCTION hci.enforce_case_lifecycle() RESET search_path;
ALTER FUNCTION hci.reject_case_reassignment() RESET search_path;
ALTER FUNCTION hci.require_open_or_active_case() RESET search_path;
ALTER FUNCTION hci.enforce_field_author_class() RESET search_path;
ALTER FUNCTION hci.enforce_claim_state_admission() RESET search_path;
DROP INDEX IF EXISTS hci.decisions_principal_idx;
DROP INDEX IF EXISTS hci.subject_records_spotcheck_principal_idx;

-- Views/functions revert to exactly 0008's column set (the same columns
-- 0008 itself produced, before this migration's M6 fix added more).
-- DROP + CREATE, not CREATE OR REPLACE: PostgreSQL lets CREATE OR REPLACE
-- VIEW append columns (which is how 0009 up extends them) but never remove
-- any ("cannot drop columns from view", 42P16) - so the reverse direction
-- has to recreate the view, and therefore also re-issue the SELECT grant
-- that DROP VIEW discards. Nothing else in this schema depends on these
-- four views, so a plain DROP is safe here.
DROP VIEW IF EXISTS hci.evidence_current;
DROP VIEW IF EXISTS hci.claims_current;
DROP VIEW IF EXISTS hci.assessments_current;
DROP VIEW IF EXISTS hci.decisions_current;
CREATE VIEW hci.evidence_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records WHERE kind = 'EVIDENCE' AND system_superseded_at IS NULL;
CREATE VIEW hci.claims_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records WHERE kind = 'CLAIM' AND system_superseded_at IS NULL;
CREATE VIEW hci.assessments_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records WHERE kind = 'ASSESSMENT' AND system_superseded_at IS NULL;
CREATE VIEW hci.decisions_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, case_id, outcome, rationale,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.decisions WHERE system_superseded_at IS NULL;
GRANT SELECT ON hci.evidence_current, hci.claims_current, hci.assessments_current, hci.decisions_current
  TO hci_app_test_a, hci_app_test_b;

DROP FUNCTION IF EXISTS hci.evidence_as_of(timestamptz);
DROP FUNCTION IF EXISTS hci.claims_as_of(timestamptz);
DROP FUNCTION IF EXISTS hci.assessments_as_of(timestamptz);
DROP FUNCTION IF EXISTS hci.decisions_as_of(timestamptz);

CREATE FUNCTION hci.evidence_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records
   WHERE kind = 'EVIDENCE' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
CREATE FUNCTION hci.claims_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records
   WHERE kind = 'CLAIM' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
CREATE FUNCTION hci.assessments_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records
   WHERE kind = 'ASSESSMENT' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
CREATE FUNCTION hci.decisions_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, case_id uuid, outcome text, rationale text,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, case_id, outcome, rationale,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.decisions
   WHERE system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;

REVOKE ALL ON FUNCTION hci.evidence_as_of(timestamptz), hci.claims_as_of(timestamptz),
  hci.assessments_as_of(timestamptz), hci.decisions_as_of(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.evidence_as_of(timestamptz), hci.claims_as_of(timestamptz),
  hci.assessments_as_of(timestamptz), hci.decisions_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

ALTER TABLE hci.subject_records
  DROP CONSTRAINT IF EXISTS subject_records_spotcheck_principal_fk,
  DROP CONSTRAINT IF EXISTS subject_records_spotcheck_principal_required,
  DROP CONSTRAINT IF EXISTS subject_records_spotcheck_principal_scoped,
  DROP COLUMN IF EXISTS spotcheck_principal_id;

REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref,
              author_class, claim_state, human_spotcheck_status)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

COMMIT;
