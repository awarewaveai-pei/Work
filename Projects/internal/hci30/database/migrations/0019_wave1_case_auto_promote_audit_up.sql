-- HCI-30 Wave 1 - Auto-promote toggle audit trail (closes
-- HCI_C1_C10_DECISIONS.md §C5, operator-requested 2026-09-12: "auto-promote
-- 開關風險...新增不可竄改稽核紀錄，跟現有'系統自動判定，未經人工確認'
-- UI 標籤互補").
--
-- Extends 0001-0018. Must run after all eighteen.
--
-- What this closes: `hci.cases.auto_promote_rule_findings` (migrations/
-- 0017) is a plain UPDATE-able column -- the live row always tells you the
-- CURRENT value, never who set it or when it last changed. A case that
-- silently had auto-promote flipped on, accumulated some rule-engine-only
-- dimension scores, then flipped back off, would show no trace of that
-- window ever existing. This table is that trace: one append-only row per
-- toggle, independent of the current column value.
--
-- Structural posture copied from hci.case_report_snapshots (0016): tenant-
-- scoped, case-scoped, principal-authored, INSERT+SELECT only, fully
-- revoked UPDATE/DELETE at the grant layer AND trigger-blocked via the
-- shared hci.reject_update_delete() (0001) -- an audit trail whose own rows
-- can be quietly edited after the fact is not an audit trail. changed_at is
-- withheld from the app-role INSERT grant (server-default only), same
-- CREATED-AT-01-class posture as case_report_snapshots.generated_at.
--
-- Critic review (2026-09-12): the app-level draft of this endpoint did the
-- hci.cases UPDATE and this table's INSERT as two separate round trips (no
-- BEGIN/COMMIT spanning them) -- an audit trail whose own write can be lost
-- to an ordinary transient failure between the two statements is not the
-- "every toggle leaves a trace" guarantee this migration's header promises.
-- hci.set_case_auto_promote_rule_findings() below closes that gap the same
-- way hci.record_decision() (0014) already does for its own two-write
-- shape: one SECURITY INVOKER function call = one statement = atomic by
-- construction, no app-level transaction plumbing needed. It also folds in
-- a second fix found in the same review: the app draft inserted a new audit
-- row even when the toggle was a no-op (same value re-POSTed), which would
-- have let an unbounded string of "changed to X" rows accumulate for a
-- value that never actually changed -- the UPDATE's own WHERE clause now
-- makes that a no-op that writes nothing.

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
    'data_encryption_keys','decision_claims','principals','case_report_snapshots','subject_record_chain_tips'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0019; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

CREATE TABLE hci.case_auto_promote_audit (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  case_id uuid NOT NULL,
  changed_by_principal_id uuid NOT NULL,
  new_value boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, case_id) REFERENCES hci.cases(tenant_id, id),
  FOREIGN KEY (tenant_id, changed_by_principal_id) REFERENCES hci.principals(tenant_id, id),
  UNIQUE (tenant_id, id)
);

GRANT SELECT ON hci.case_auto_promote_audit TO hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, case_id, changed_by_principal_id, new_value)
  ON hci.case_auto_promote_audit TO hci_app_test_a, hci_app_test_b;
REVOKE UPDATE, DELETE ON hci.case_auto_promote_audit FROM hci_app_test_a, hci_app_test_b;
CREATE TRIGGER case_auto_promote_audit_append_only BEFORE UPDATE OR DELETE ON hci.case_auto_promote_audit
  FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete();
CREATE TRIGGER case_auto_promote_audit_no_truncate BEFORE TRUNCATE ON hci.case_auto_promote_audit
  FOR EACH STATEMENT EXECUTE FUNCTION hci.reject_update_delete();

CREATE INDEX case_auto_promote_audit_case_idx ON hci.case_auto_promote_audit (tenant_id, case_id, changed_at DESC);
ALTER TABLE hci.case_auto_promote_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.case_auto_promote_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hci.case_auto_promote_audit
  USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id());

-- Returns NULL when case_id isn't visible to the caller's tenant (endpoint
-- maps that to 404, same as the old rowCount=0 check); TRUE when the value
-- actually changed (and the audit row was written); FALSE when the POSTed
-- value already matched the current one (a real no-op, nothing written).
CREATE FUNCTION hci.set_case_auto_promote_rule_findings(p_case_id uuid, p_new_value boolean, p_principal_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = hci, pg_temp AS $$
DECLARE v_tenant_id uuid; v_changed boolean;
BEGIN
  v_tenant_id := hci.current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'H1001', MESSAGE = 'tenant authorization is not ACTIVE / not currently valid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hci.cases WHERE tenant_id = v_tenant_id AND id = p_case_id) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hci.principals WHERE tenant_id = v_tenant_id AND id = p_principal_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1021', MESSAGE = 'principal_id does not belong to the caller''s own tenant';
  END IF;
  UPDATE hci.cases SET auto_promote_rule_findings = p_new_value
    WHERE id = p_case_id AND tenant_id = v_tenant_id AND auto_promote_rule_findings IS DISTINCT FROM p_new_value;
  v_changed := FOUND;
  IF v_changed THEN
    INSERT INTO hci.case_auto_promote_audit (id, tenant_id, case_id, changed_by_principal_id, new_value)
      VALUES (gen_random_uuid(), v_tenant_id, p_case_id, p_principal_id, p_new_value);
  END IF;
  RETURN v_changed;
END $$;
REVOKE ALL ON FUNCTION hci.set_case_auto_promote_rule_findings(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.set_case_auto_promote_rule_findings(uuid, boolean, uuid) TO hci_app_test_a, hci_app_test_b;

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
    'data_encryption_keys','decision_claims','principals','case_report_snapshots','subject_record_chain_tips',
    'case_auto_promote_audit'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift after 0019; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

COMMIT;
