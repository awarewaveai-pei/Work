-- HCI-30 Wave 1 - Evidence/Claim/Assessment/TrustDomain payload (ADR-0034).
-- Extends 0001-0011; must run after all eleven, before fixtures/harness/
-- negative-test files.
--
-- hci.subject_records has been a bare kind-tagged anchor since 0001 (id,
-- tenant_id, person_id, subject_type, subject_id, kind) plus whatever
-- kind-scoped columns 0002-0011 added (author_class, claim_state,
-- epistemic_label, domain, evidence_ref_id/kind, ...) - none of which carry
-- the actual content a human or the intelligence pipeline would read. ADR-0034
-- decides the shape: one generic `payload jsonb`, not four kind-specific
-- columns or a separate table per kind, for the same reason the table itself
-- is polymorphic (ADR-0011 gate 1) - tenant isolation/append-only/RLS stay
-- written once. Per-kind shape (content/evidence_refs/dimension/domain keys)
-- is validated at the application layer (packages/contracts/
-- validate-subject-record-payload.mjs), not a DB CHECK, per ADR-0034's own
-- "why application-layer" reasoning - revisit if a second write path
-- appears that could bypass it.
--
-- db-expert review (2026-09-08), fixed before this migration was applied for
-- real: Major -- the original version of this migration added `payload` to
-- subject_records but never to the six canonical read objects
-- 0005/0009/0010 already established as the sanctioned read path
-- (evidence_current/claims_current/assessments_current views,
-- evidence_as_of()/claims_as_of()/assessments_as_of() functions) --
-- violating 0005's own stated rule that a column addition is "a decision
-- made in both places, symmetrically, or neither" (0005_wave1_bitemporal_
-- history_up.sql:368-376), the same class of gap 0009 itself had to fix
-- once already (labelled Major there too). All six now carry `payload`.
-- Minor -- added the standard table-inventory-drift guard every migration
-- since 0002 opens with, omitted from the first draft.

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE actual text[]; expected text[];
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C") INTO actual
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'hci' AND c.relkind = 'r';
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO expected FROM unnest(ARRAY[
    'persons','tenant_authorizations','subject_lawful_basis_records','sources','source_terms_records',
    'research_workflows','subject_records','data_subject_requests','data_subject_request_events',
    'data_subject_request_targets','identity_candidates','identity_verifications',
    'tenants','app_tenant_bindings','cases','source_snapshots','source_relationships','decisions',
    'data_encryption_keys','decision_claims','principals'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0012; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

ALTER TABLE hci.subject_records
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- subject_records is already append-only (0001) and RLS-forced (0001); both
-- are row-level/table-level and already cover this new column with no
-- further ALTER TABLE ... ENABLE/FORCE/POLICY needed.

REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref,
              author_class, claim_state, human_spotcheck_status, spotcheck_principal_id,
              epistemic_label, epistemic_verifier_principal_id,
              domain, evidence_ref_id, evidence_ref_kind, payload)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

-- Six canonical read objects (0005/0009/0010's own established pattern),
-- each re-declared with `payload` appended to its column list. TRUST_DOMAIN
-- has no *_current view / *_as_of() function (true since 0011, unchanged
-- here). decisions_current/decisions_as_of() are untouched -- decisions
-- never gets `payload`.
CREATE OR REPLACE VIEW hci.evidence_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class, payload
    FROM hci.subject_records
   WHERE kind = 'EVIDENCE' AND system_superseded_at IS NULL;

CREATE OR REPLACE VIEW hci.claims_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class, claim_state, human_spotcheck_status,
         spotcheck_principal_id, reaudit_required, epistemic_label, epistemic_verifier_principal_id, payload
    FROM hci.subject_records
   WHERE kind = 'CLAIM' AND system_superseded_at IS NULL;

CREATE OR REPLACE VIEW hci.assessments_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         author_class, payload
    FROM hci.subject_records
   WHERE kind = 'ASSESSMENT' AND system_superseded_at IS NULL;

DROP FUNCTION IF EXISTS hci.evidence_as_of(timestamptz);
CREATE FUNCTION hci.evidence_as_of(p_t timestamptz) RETURNS TABLE(
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text, encryption_key_ref uuid, tombstoned_at timestamptz, author_class text,
  payload jsonb
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class, payload
    FROM hci.subject_records
   WHERE kind = 'EVIDENCE' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
GRANT EXECUTE ON FUNCTION hci.evidence_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

DROP FUNCTION IF EXISTS hci.claims_as_of(timestamptz);
CREATE FUNCTION hci.claims_as_of(p_t timestamptz) RETURNS TABLE(
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text, encryption_key_ref uuid, tombstoned_at timestamptz, author_class text,
  claim_state text, human_spotcheck_status text, spotcheck_principal_id uuid, reaudit_required boolean,
  epistemic_label text, epistemic_verifier_principal_id uuid, payload jsonb
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class, claim_state, human_spotcheck_status,
         spotcheck_principal_id, reaudit_required, epistemic_label, epistemic_verifier_principal_id, payload
    FROM hci.subject_records
   WHERE kind = 'CLAIM' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
GRANT EXECUTE ON FUNCTION hci.claims_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

DROP FUNCTION IF EXISTS hci.assessments_as_of(timestamptz);
CREATE FUNCTION hci.assessments_as_of(p_t timestamptz) RETURNS TABLE(
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text, author_class text, payload jsonb
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         author_class, payload
    FROM hci.subject_records
   WHERE kind = 'ASSESSMENT' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
GRANT EXECUTE ON FUNCTION hci.assessments_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

COMMIT;
