-- Reverses 0010_wave1_epistemic_label_up.sql only. Does not touch 0001-0009.
-- Safe to run against a schema where those nine are still applied and 0010
-- is being rolled back independently. Idempotent: a second run, or a run
-- against a schema that never had 0010 applied, no-ops.
--
-- Not exercised by test-wave1-local.ps1's reversibility pass (whole-schema
-- 0001_down covers it); verified manually, see ADR-0019's Implementation
-- note.
BEGIN;
SET LOCAL lock_timeout = '3s';
-- M3 class fix (db-expert review of migration 0011, 2026-09-05): the guard
-- below reads a FORCE ROW LEVEL SECURITY table. Under a non-superuser owner
-- it would silently match zero rows instead of erroring, letting this
-- migration destroy every CLAIM's epistemic_label with no warning. Same fix
-- as 0005/0007/0008 (M4) - see 0005_wave1_bitemporal_history_down.sql's
-- comment for the full account.
SET LOCAL row_security = off;

-- Empty-state guard. Any CLAIM row at all makes this one-way: after the
-- columns are dropped, re-applying 0010 would find NULL epistemic_label on
-- every existing CLAIM and fail subject_records_epistemic_required (the
-- trigger default only fires at INSERT). Column-free predicate, so it
-- parses on a second run too.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM hci.subject_records WHERE kind = 'CLAIM') THEN
    RAISE EXCEPTION 'refusing to drop epistemic_label / epistemic_verifier_principal_id while CLAIM rows exist; this down migration is the empty-schema case only and 0010 could not be re-applied afterwards';
  END IF;
END $$;

-- claims_current / claims_as_of() back to exactly 0009's column set.
-- DROP + CREATE (CREATE OR REPLACE VIEW cannot remove columns, 42P16) and
-- the SELECT grant re-issued, as 0009_down does.
DROP VIEW IF EXISTS hci.claims_current;
CREATE VIEW hci.claims_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class, claim_state, human_spotcheck_status,
         spotcheck_principal_id, reaudit_required
  FROM hci.subject_records WHERE kind = 'CLAIM' AND system_superseded_at IS NULL;
GRANT SELECT ON hci.claims_current TO hci_app_test_a, hci_app_test_b;

DROP FUNCTION IF EXISTS hci.claims_as_of(timestamptz);
CREATE FUNCTION hci.claims_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text, encryption_key_ref uuid, tombstoned_at timestamptz, author_class text,
  claim_state text, human_spotcheck_status text, spotcheck_principal_id uuid, reaudit_required boolean
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class, claim_state, human_spotcheck_status,
         spotcheck_principal_id, reaudit_required
  FROM hci.subject_records
   WHERE kind = 'CLAIM' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
REVOKE ALL ON FUNCTION hci.claims_as_of(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.claims_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

-- Trigger function back to exactly 0008's body, keeping 0009's search_path
-- pin (0009 set it with ALTER FUNCTION; restating it here is what a
-- CREATE OR REPLACE needs to not lose it).
CREATE OR REPLACE FUNCTION hci.enforce_claim_state_admission() RETURNS trigger
LANGUAGE plpgsql SET search_path = hci, pg_temp AS $$
DECLARE v_predecessor_reaudit boolean;
BEGIN
  IF NEW.kind = 'CLAIM' AND NEW.reaudit_required IS NULL THEN
    IF NEW.supersedes_id IS NOT NULL THEN
      SELECT reaudit_required INTO v_predecessor_reaudit
        FROM hci.subject_records
       WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_id;
      NEW.reaudit_required := COALESCE(v_predecessor_reaudit, false);
    ELSE
      NEW.reaudit_required := false;
    END IF;
  END IF;

  IF NEW.kind = 'CLAIM' AND NEW.claim_state = 'ASSESSMENT_CANDIDATE'
     AND NEW.human_spotcheck_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION USING ERRCODE = 'H1014',
      MESSAGE = 'ASSESSMENT_CANDIDATE requires human_spotcheck_status=APPROVED, independent of case risk_tier';
  END IF;
  RETURN NEW;
END $$;

DROP INDEX IF EXISTS hci.subject_records_epistemic_verifier_idx;
ALTER TABLE hci.subject_records
  DROP CONSTRAINT IF EXISTS subject_records_epistemic_verifier_fk,
  DROP CONSTRAINT IF EXISTS subject_records_source_fact_verified,
  DROP CONSTRAINT IF EXISTS subject_records_epistemic_verifier_scoped,
  DROP CONSTRAINT IF EXISTS subject_records_epistemic_required,
  DROP CONSTRAINT IF EXISTS subject_records_epistemic_scoped,
  DROP COLUMN IF EXISTS epistemic_verifier_principal_id,
  DROP COLUMN IF EXISTS epistemic_label;

REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref,
              author_class, claim_state, human_spotcheck_status, spotcheck_principal_id)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

COMMIT;
