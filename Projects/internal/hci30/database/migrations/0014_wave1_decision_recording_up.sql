-- HCI-30 Wave 1 - Decision recording primitive.
-- Extends 0001-0013; must run after all thirteen, before fixtures/harness/
-- negative-test files.
--
-- Same class of gap as migration 0013 (hci.mint_encryption_key), found the
-- same way -- wiring the actual "review evidence, then record a decision"
-- flow, the capstone of the whole product per 04_HCI30_PRODUCT_SPEC.md
-- ("decision-support platform for ... safe collaboration") and the
-- corpus's own confirmed design direction ("human final decision",
-- 16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md). hci.decisions has only ever had
-- `GRANT SELECT ... TO hci_app_test_a, hci_app_test_b`
-- (0005_wave1_bitemporal_history_up.sql:246) -- grepped every migration,
-- zero INSERT grant exists anywhere. The only inserts on record are
-- database/fixtures/0001_synthetic.sql (owner-run setup) and the negative
-- test suite (also owner-run). No application-role path to record a real
-- decision exists.
--
-- Minimal fix, same SECURITY DEFINER shape as hci.mint_encryption_key()
-- (0013): one function, callable by the app roles, that inserts exactly one
-- hci.decisions row. Unlike mint_encryption_key (which invents a brand-new
-- tenant-scoped id and touches nothing else), this function accepts two
-- caller-supplied ids (case_id, principal_id) that must belong to an
-- existing row -- because it is SECURITY DEFINER and therefore bypasses RLS
-- for its own body, it must independently verify BOTH belong to the
-- caller's own tenant before inserting, or a caller could record a decision
-- against another tenant's case despite RLS normally blocking exactly that
-- read. author_class is hardcoded to 'HUMAN_ONLY', matching
-- hci.enforce_field_author_class()'s own requirement for this table
-- (0008_wave1_field_author_class_policy_up.sql:87-88) -- not a caller
-- choice, since this function's whole reason to exist is that a human is
-- recording a decision.

BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE FUNCTION hci.record_decision(p_case_id uuid, p_principal_id uuid, p_outcome text, p_rationale text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hci, pg_temp AS $$
DECLARE v_tenant_id uuid; v_id uuid;
BEGIN
  v_tenant_id := hci.current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'H1001', MESSAGE = 'tenant authorization is not ACTIVE / not currently valid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hci.cases WHERE tenant_id = v_tenant_id AND id = p_case_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1001', MESSAGE = 'case_id does not belong to the caller''s own tenant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hci.principals WHERE tenant_id = v_tenant_id AND id = p_principal_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1001', MESSAGE = 'principal_id does not belong to the caller''s own tenant';
  END IF;
  v_id := gen_random_uuid();
  INSERT INTO hci.decisions (id, tenant_id, case_id, outcome, rationale, author_class, principal_id)
    VALUES (v_id, v_tenant_id, p_case_id, p_outcome, p_rationale, 'HUMAN_ONLY', p_principal_id);
  RETURN v_id;
END $$;
ALTER FUNCTION hci.record_decision(uuid, uuid, text, text) SET row_security = off;
REVOKE ALL ON FUNCTION hci.record_decision(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.record_decision(uuid, uuid, text, text) TO hci_app_test_a, hci_app_test_b;

COMMIT;
