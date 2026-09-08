-- HCI-30 Wave 1 - Decision recording primitive.
-- Extends 0001-0013; must run after all thirteen, before fixtures/harness/
-- negative-test files.
--
-- Wires the "review evidence, then record a decision" flow, the capstone of
-- the whole product per 04_HCI30_PRODUCT_SPEC.md ("decision-support
-- platform for ... safe collaboration") and the corpus's own confirmed
-- design direction ("human final decision", 16_OPEN_DECISIONS_AND_NEXT_
-- ARTIFACTS.md).
--
-- db-expert review (2026-09-08), fixed before this migration was applied
-- for real -- Critical: this file's first draft claimed "hci.decisions has
-- only ever had GRANT SELECT ... zero INSERT grant exists anywhere," which
-- is FALSE. migrations/0005_wave1_bitemporal_history_up.sql:247-248 already
-- grants column-level INSERT (id, tenant_id, case_id, outcome, rationale,
-- valid_from, valid_to, supersedes_id, corrected_reason) to
-- hci_app_test_a/b, widened by 0008_wave1_field_author_class_policy_up.sql:
-- 418-421 to include author_class, principal_id -- both already exercised
-- as the app role by BITEMP-DECISION-01/02 and DECISION-PRINCIPAL-
-- CROSSTENANT-01 in the existing negative suite. hci.record_decision()
-- below does NOT close a missing-capability gap; it is a SECOND, narrower
-- write path deliberately kept alongside the existing wide one -- a
-- documented choice, not an accident: the wide grant remains necessary for
-- correction/supersession (supersedes_id, corrected_reason), which this
-- function intentionally does not expose (recording a decision and
-- correcting one are different operations with different risk profiles).
-- This function exists as a better-error-code, tenant-validated convenience
-- primitive for the single common case ("record a fresh decision"), the
-- one this app's own POST /cases/:id/decisions endpoint calls -- not as a
-- replacement for the wide grant.
--
-- Major, also fixed: originally SECURITY DEFINER (copied from
-- hci.mint_encryption_key(), 0013, without re-verifying the copy was
-- necessary). db-expert proved via a byte-identical SECURITY INVOKER clone
-- that every statement here is satisfiable under the caller's own privilege
-- set (hci_app_test_a/b already hold SELECT on cases/principals and INSERT
-- on decisions, per the paragraph above) -- unlike mint_encryption_key,
-- which genuinely needs DEFINER because hci.data_encryption_keys grants app
-- roles nothing. SECURITY INVOKER is strictly safer here: it sidesteps the
-- documented FORCE-RLS-on-non-superuser-owner failure mode
-- (docs/domain/HCI_INVARIANTS.md:224-239) that would make every DEFINER
-- function in this schema fail closed the day hci_owner stops being a
-- superuser (this schema's actual documented production shape) -- a
-- pre-existing, schema-wide gap this migration does not attempt to fix for
-- the other five DEFINER functions (tracked separately, TASKS.md), but does
-- not need to inherit for this new one. The explicit case_id/principal_id
-- EXISTS checks below are kept even though RLS would now independently
-- enforce the same tenant boundary under INVOKER -- intentional redundancy
-- for a clear, specific error message instead of a bare "0 rows" RLS
-- silence.
--
-- Major, also fixed: H1001 was reused for two new, semantically distinct
-- conditions (case_id/principal_id referential/tenant-mismatch validation)
-- alongside its registered meaning (session/authorization-state,
-- hci.require_active_authorization()) -- exactly the collision class
-- database/ERROR_CODE_REGISTRY.md's own header names as a repeat past
-- incident. Two new codes minted instead: H1020 (case_id), H1021
-- (principal_id) -- registry updated in this same commit.
--
-- author_class is hardcoded to 'HUMAN_ONLY', matching
-- hci.enforce_field_author_class()'s own requirement for this table
-- (0008_wave1_field_author_class_policy_up.sql:87-88) -- not a caller
-- choice, since this function's whole reason to exist is that a human is
-- recording a decision.

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
    RAISE EXCEPTION 'hci table inventory drift before 0014; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

CREATE FUNCTION hci.record_decision(p_case_id uuid, p_principal_id uuid, p_outcome text, p_rationale text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = hci, pg_temp AS $$
DECLARE v_tenant_id uuid; v_id uuid;
BEGIN
  v_tenant_id := hci.current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'H1001', MESSAGE = 'tenant authorization is not ACTIVE / not currently valid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hci.cases WHERE tenant_id = v_tenant_id AND id = p_case_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1020', MESSAGE = 'case_id does not belong to the caller''s own tenant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hci.principals WHERE tenant_id = v_tenant_id AND id = p_principal_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1021', MESSAGE = 'principal_id does not belong to the caller''s own tenant';
  END IF;
  v_id := gen_random_uuid();
  INSERT INTO hci.decisions (id, tenant_id, case_id, outcome, rationale, author_class, principal_id)
    VALUES (v_id, v_tenant_id, p_case_id, p_outcome, p_rationale, 'HUMAN_ONLY', p_principal_id);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hci.record_decision(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.record_decision(uuid, uuid, text, text) TO hci_app_test_a, hci_app_test_b;

COMMIT;
