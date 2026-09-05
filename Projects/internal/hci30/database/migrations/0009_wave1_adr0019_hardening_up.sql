-- HCI-30 Wave 1 - ADR-0019 hardening: closes the db-expert review's Major/
-- Minor findings that were tracked (not silently dropped) rather than fixed
-- in migration 0008 itself, per TASKS.md's 2026-09-05 follow-up entry.
-- Gates 2-4 and gate 5's human-principal half are already DONE (0008); this
-- migration does not add a new gate, it closes coverage/design gaps found
-- against the ones already built. Gate 5's epistemic-label half is a
-- separate, genuinely new concept and lands in its own migration (0010),
-- not bundled here.
--
-- Schema changes here: M7 (spotcheck_principal_id), M6 (canonical
-- view/as_of column parity), M4 (SECURITY DEFINER writers fail closed under
-- FORCE RLS instead of silently matching zero rows), and the review's two
-- suggestions (search_path pinned on every remaining function; RI-lookup
-- indexes for the two principals FKs). m4 (principals DELETE RI-barrier
-- test), M8 (cross-tenant/typed-FK tests for the two composite FKs 0008
-- already built) and m2 (direct assertions for 0008's six CHECK
-- constraints) need no schema change - they are test/mutation additions
-- only, landed in the same commit as this migration but not in this file.
--
-- Extends 0001-0008. Must run after all eight, before the fixtures/harness/
-- negative-test files.

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
    RAISE EXCEPTION 'hci table inventory drift before 0009; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- ============================================================================
-- M7: human_spotcheck_status='APPROVED' was a self-asserted string - the same
-- app-role statement that writes the AI-generated Claim could mark its own
-- output human-approved, with nothing naming which human and no timestamp
-- distinguishing approval from generation. hci.principals (0008) already
-- exists and was not used for this. Mirrors hci.decisions.principal_id's own
-- shape exactly: NOT NULL only when it must be, tenant-composite FK, kept
-- out of the general APPROVED-setting statement's ability to name someone
-- who never reviewed anything (still app-role-writable, same trust level as
-- author_class/claim_state themselves - Wave 1 has no separate reviewer
-- authentication path, so this closes the "which human" gap, not the
-- "was a human actually looking" gap, which is a Wave 4 application-layer
-- concern this schema cannot see).
-- ============================================================================
ALTER TABLE hci.subject_records
  ADD COLUMN spotcheck_principal_id uuid,
  ADD CONSTRAINT subject_records_spotcheck_principal_scoped
    CHECK (kind = 'CLAIM' OR spotcheck_principal_id IS NULL),
  ADD CONSTRAINT subject_records_spotcheck_principal_required
    CHECK (human_spotcheck_status <> 'APPROVED' OR spotcheck_principal_id IS NOT NULL),
  ADD CONSTRAINT subject_records_spotcheck_principal_fk
    FOREIGN KEY (tenant_id, spotcheck_principal_id) REFERENCES hci.principals (tenant_id, id);

REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref,
              author_class, claim_state, human_spotcheck_status, spotcheck_principal_id)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

-- ============================================================================
-- M6: the four canonical `_current` views and `_as_of()` functions never
-- picked up encryption_key_ref/tombstoned_at (ADR-0018, migration 0007) NOR
-- author_class/claim_state/human_spotcheck_status/reaudit_required/
-- spotcheck_principal_id (ADR-0019, 0008-0009) - two migrations in a row
-- broke the "a decision made in both places, symmetrically, or neither" rule
-- ADR-0017's own migration header states (0005:368-376). Closed here for
-- both migrations' worth of columns at once, not just this round's.
--
-- Views: CREATE OR REPLACE VIEW can append columns to the end of an
-- existing view's SELECT list without dropping it or its dependents, as
-- long as every existing column keeps its name/type/position - verified
-- true here (nothing else in this schema depends on these four views).
-- ============================================================================
CREATE OR REPLACE VIEW hci.evidence_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class
  FROM hci.subject_records WHERE kind = 'EVIDENCE' AND system_superseded_at IS NULL;
CREATE OR REPLACE VIEW hci.claims_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class, claim_state, human_spotcheck_status,
         spotcheck_principal_id, reaudit_required
  FROM hci.subject_records WHERE kind = 'CLAIM' AND system_superseded_at IS NULL;
CREATE OR REPLACE VIEW hci.assessments_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         author_class
  FROM hci.subject_records WHERE kind = 'ASSESSMENT' AND system_superseded_at IS NULL;
CREATE OR REPLACE VIEW hci.decisions_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, case_id, outcome, rationale,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         author_class, principal_id
  FROM hci.decisions WHERE system_superseded_at IS NULL;

-- Functions: RETURNS TABLE(...) is part of the function's identity: adding a
-- column requires DROP + CREATE, CREATE OR REPLACE FUNCTION cannot change a
-- return type. Safe here - nothing else in this schema calls or wraps these
-- four (leaf functions, fixed (timestamptz) signature).
DROP FUNCTION hci.evidence_as_of(timestamptz);
DROP FUNCTION hci.claims_as_of(timestamptz);
DROP FUNCTION hci.assessments_as_of(timestamptz);
DROP FUNCTION hci.decisions_as_of(timestamptz);

CREATE FUNCTION hci.evidence_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text, encryption_key_ref uuid, tombstoned_at timestamptz, author_class text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         encryption_key_ref, tombstoned_at, author_class
  FROM hci.subject_records
   WHERE kind = 'EVIDENCE' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
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
CREATE FUNCTION hci.assessments_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text, author_class text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         author_class
  FROM hci.subject_records
   WHERE kind = 'ASSESSMENT' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
CREATE FUNCTION hci.decisions_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, case_id uuid, outcome text, rationale text,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text, author_class text, principal_id uuid
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, case_id, outcome, rationale,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason,
         author_class, principal_id
  FROM hci.decisions
   WHERE system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;

REVOKE ALL ON FUNCTION hci.evidence_as_of(timestamptz), hci.claims_as_of(timestamptz),
  hci.assessments_as_of(timestamptz), hci.decisions_as_of(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.evidence_as_of(timestamptz), hci.claims_as_of(timestamptz),
  hci.assessments_as_of(timestamptz), hci.decisions_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

-- ============================================================================
-- M4: every SECURITY DEFINER function in this schema reads or writes an
-- RLS-forced table AS hci_owner. SECURITY DEFINER bypasses grants, not RLS:
-- FORCE ROW LEVEL SECURITY applies to the table owner too, and only a
-- superuser/BYPASSRLS role escapes it. The test container's owner IS a
-- superuser, which is the only reason these functions have ever seen the
-- rows they write - move this schema to a non-superuser owner (the normal
-- production shape, and the shape FORCE exists for) and every definer
-- lookup resolves hci.current_tenant_id() against the owner's own missing
-- binding, the policy predicate becomes NULL, and each function silently
-- matches ZERO rows: the elevation cascade flags nothing, the link gate's
-- SELECT returns no row, mark_superseded()/tombstone_evidence() touch
-- nothing - all fail-OPEN, all without an error.
--
-- `row_security = off` inverts that failure mode by construction: the
-- parameter makes any statement that WOULD have had a policy applied raise
-- an error instead of running filtered. A superuser owner applies no
-- policy, so nothing changes today; a non-superuser owner gets a hard
-- error at the first definer call rather than a silently empty result.
-- Set as function-level config (ALTER FUNCTION ... SET), which needs no
-- body change, is reversible with RESET, and cannot drift from the body.
-- Applied to the whole class (all five definers, including
-- current_tenant_id() - its own lookup table carries no policy, so this is
-- a no-op there today and a fail-closed guard if that ever changes), not
-- only to the two 0008 functions the review named.
--
-- The zero-row case is deliberately NOT turned into a ROW_COUNT error in
-- flag_claims_on_risk_elevation(): a case with no Claims legitimately
-- flags nothing. With the RLS-silent zero-row path now erroring instead,
-- "zero rows" can only mean "no Claims", so the ambiguity the review
-- pointed at no longer exists.
-- ============================================================================
ALTER FUNCTION hci.current_tenant_id() SET row_security = off;
ALTER FUNCTION hci.mark_superseded() SET row_security = off;
ALTER FUNCTION hci.tombstone_evidence(uuid) SET row_security = off;
ALTER FUNCTION hci.flag_claims_on_risk_elevation() SET row_security = off;
ALTER FUNCTION hci.enforce_decision_reaudit_gate() SET row_security = off;

-- Suggestion (search_path): 0001/0002/0008's SECURITY INVOKER trigger
-- functions never pinned search_path, unlike every function written since
-- 0005. Not exploitable today (all relation references are schema-
-- qualified; pg_temp never resolves functions/operators implicitly), but
-- the rule is a class rule - "every function in hci pins search_path" -
-- and is asserted generically by FUNCTION-SEARCHPATH-01, so it is closed
-- for the whole class here, again as config, not by rewriting bodies.
ALTER FUNCTION hci.require_active_authorization() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.enforce_dsr_transition() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.reject_update_delete() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.reject_tenant_change() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.require_identity_verification() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.protect_identity_evidence() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.enforce_case_lifecycle() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.reject_case_reassignment() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.require_open_or_active_case() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.enforce_field_author_class() SET search_path = hci, pg_temp;
ALTER FUNCTION hci.enforce_claim_state_admission() SET search_path = hci, pg_temp;

-- Suggestion (RI lookup indexes): both FKs into hci.principals are checked
-- on every DELETE FROM hci.principals by scanning the referencing table for
-- the deleted key; decisions_tenant_idx / subject_records' own tenant index
-- cover only the leading column, so without these the RI check degrades to
-- a whole-tenant scan. Partial on subject_records because the column is
-- NULL on every non-APPROVED row.
CREATE INDEX decisions_principal_idx ON hci.decisions (tenant_id, principal_id);
CREATE INDEX subject_records_spotcheck_principal_idx ON hci.subject_records (tenant_id, spotcheck_principal_id)
  WHERE spotcheck_principal_id IS NOT NULL;

COMMIT;
