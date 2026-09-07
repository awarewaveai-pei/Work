-- Reverses 0012_wave1_subject_record_payload_up.sql only. Does not touch
-- 0001-0011. Idempotent: a second run, or a run against a schema that never
-- had 0012 applied, no-ops (column-existence check below).
--
-- Unlike 0011's down migration, no "refuse if populated" guard is needed:
-- payload has no cross-column semantic requirement the way domain/
-- evidence_ref_id did for TRUST_DOMAIN rows (0011 could not be re-applied
-- with those still populated on other kinds; 0012 can always be re-applied
-- regardless of what payload data existed, since every kind's payload is
-- independently optional at the DB layer -- application-layer validation,
-- not a DB CHECK, is what would reject a malformed one).
--
-- db-expert review (2026-09-08): the up-migration adds `payload` to six
-- canonical read objects (evidence_current/claims_current/
-- assessments_current, evidence_as_of()/claims_as_of()/assessments_as_of()).
-- Those must be restored to their pre-0012 definitions BEFORE
-- DROP COLUMN payload below, or the DROP hard-fails ("cannot drop column
-- payload... other objects depend on it") since a view/function referencing
-- a column blocks dropping it without CASCADE -- and CASCADE would silently
-- drop three views that predate 0012 entirely, which this file must not do.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'hci' AND table_name = 'subject_records' AND column_name = 'payload'
  ) THEN
    RETURN;
  END IF;

  -- Restore the six read objects to their exact pre-0012 shape (the same
  -- definitions 0009/0010 left them in) before the column they reference is
  -- dropped below.
  EXECUTE $v1$
    CREATE OR REPLACE VIEW hci.evidence_current WITH (security_invoker = true) AS
      SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
             valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
             encryption_key_ref, tombstoned_at, author_class
        FROM hci.subject_records
       WHERE kind = 'EVIDENCE' AND system_superseded_at IS NULL
  $v1$;

  EXECUTE $v2$
    CREATE OR REPLACE VIEW hci.claims_current WITH (security_invoker = true) AS
      SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
             valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
             encryption_key_ref, tombstoned_at, author_class, claim_state, human_spotcheck_status,
             spotcheck_principal_id, reaudit_required, epistemic_label, epistemic_verifier_principal_id
        FROM hci.subject_records
       WHERE kind = 'CLAIM' AND system_superseded_at IS NULL
  $v2$;

  EXECUTE $v3$
    CREATE OR REPLACE VIEW hci.assessments_current WITH (security_invoker = true) AS
      SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
             valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
             author_class
        FROM hci.subject_records
       WHERE kind = 'ASSESSMENT' AND system_superseded_at IS NULL
  $v3$;

  DROP FUNCTION IF EXISTS hci.evidence_as_of(timestamptz);
  EXECUTE $f1$
    CREATE FUNCTION hci.evidence_as_of(p_t timestamptz) RETURNS TABLE(
      id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
      valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
      supersedes_id uuid, corrected_reason text, encryption_key_ref uuid, tombstoned_at timestamptz, author_class text
    ) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $body$
      SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
             valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
             encryption_key_ref, tombstoned_at, author_class
        FROM hci.subject_records
       WHERE kind = 'EVIDENCE' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
    $body$
  $f1$;
  GRANT EXECUTE ON FUNCTION hci.evidence_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

  DROP FUNCTION IF EXISTS hci.claims_as_of(timestamptz);
  EXECUTE $f2$
    CREATE FUNCTION hci.claims_as_of(p_t timestamptz) RETURNS TABLE(
      id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
      valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
      supersedes_id uuid, corrected_reason text, encryption_key_ref uuid, tombstoned_at timestamptz, author_class text,
      claim_state text, human_spotcheck_status text, spotcheck_principal_id uuid, reaudit_required boolean,
      epistemic_label text, epistemic_verifier_principal_id uuid
    ) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $body$
      SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
             valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
             encryption_key_ref, tombstoned_at, author_class, claim_state, human_spotcheck_status,
             spotcheck_principal_id, reaudit_required, epistemic_label, epistemic_verifier_principal_id
        FROM hci.subject_records
       WHERE kind = 'CLAIM' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
    $body$
  $f2$;
  GRANT EXECUTE ON FUNCTION hci.claims_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

  DROP FUNCTION IF EXISTS hci.assessments_as_of(timestamptz);
  EXECUTE $f3$
    CREATE FUNCTION hci.assessments_as_of(p_t timestamptz) RETURNS TABLE(
      id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
      valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
      supersedes_id uuid, corrected_reason text, author_class text
    ) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $body$
      SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
             valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
             author_class
        FROM hci.subject_records
       WHERE kind = 'ASSESSMENT' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
    $body$
  $f3$;
  GRANT EXECUTE ON FUNCTION hci.assessments_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

  ALTER TABLE hci.subject_records DROP COLUMN payload;
END $$;

REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref,
              author_class, claim_state, human_spotcheck_status, spotcheck_principal_id,
              epistemic_label, epistemic_verifier_principal_id,
              domain, evidence_ref_id, evidence_ref_kind)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

COMMIT;
