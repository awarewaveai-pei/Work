-- HCI-30 Wave 1 - Case Report Snapshot (operator-requested "產生信任評估報告",
-- 2026-09-10; closes SEC-10, docs/HCI/HCI30_RESEARCH_REVIEW/07_SECURITY_
-- PRIVACY_REVIEW.md:265-284 -- exported reports were never required to carry
-- the claim-status labels / disclaimer / purpose-reassertion that make an
-- exported artifact safe once it leaves the live app, a gap that review
-- already named and never closed).
--
-- Extends 0001-0015. Must run after all fifteen, before fixtures/harness/
-- negative-test files (fixtures/0001_synthetic.sql now seeds one tenant-B row
-- for RLS-LEAK-07, so it must load after this file, same as every other
-- fixture that references a table this late in the sequence).
--
-- Why a new append-only table rather than rendering the live case on demand:
-- a report handed to a client/board/compliance officer must read the same
-- tomorrow as it did the day it was produced, even if the case's own data
-- changes afterward (more evidence added, decision revisited, risk_tier
-- elevated). A live re-render would silently rewrite history out from under
-- an already-delivered document. This table freezes the exact computed
-- payload (same shape server.mjs's GET /cases/:caseId already returns) at
-- generation time; nothing here invents new business logic, it only
-- persists an existing computation.
--
-- Structural posture copied byte-for-byte from hci.decision_claims
-- (0008_wave1_field_author_class_policy_up.sql:281-363), the closest existing
-- analog: tenant-scoped, case-scoped, principal-authored, INSERT+SELECT only,
-- fully revoked UPDATE/DELETE at the grant layer AND trigger-blocked via the
-- shared hci.reject_update_delete() (0001:188-192) for a superuser/owner
-- connection that bypasses grants -- a report snapshot's whole value is that
-- it cannot be quietly edited after the fact.
--
-- No new SECURITY DEFINER function: unlike hci.mint_encryption_key() (0013),
-- the app role already holds every grant this needs (SELECT/INSERT here,
-- SELECT on cases/principals already granted by 0002/0008), so a DEFINER
-- wrapper would add the FORCE-RLS-under-non-superuser-owner risk
-- (docs/domain/HCI_INVARIANTS.md:224-239, already an open TASKS.md item for
-- five existing functions) for zero capability gain. Composite FKs
-- (tenant_id, case_id) / (tenant_id, generated_by_principal_id) plus RLS's
-- own WITH CHECK are what stop a cross-tenant row, exactly as they do for
-- hci.decisions.principal_id (0008:402-404).

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
    RAISE EXCEPTION 'hci table inventory drift before 0016; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

CREATE TABLE hci.case_report_snapshots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  case_id uuid NOT NULL,
  generated_by_principal_id uuid NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  -- Same shape as the live GET /cases/:caseId payload (case, persons,
  -- records, decisions, rollup, evidenceQuality, strengths, risks, unknowns)
  -- -- a frozen copy of an existing computation, not a new one.
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  FOREIGN KEY (tenant_id, case_id) REFERENCES hci.cases(tenant_id, id),
  FOREIGN KEY (tenant_id, generated_by_principal_id) REFERENCES hci.principals(tenant_id, id),
  UNIQUE (tenant_id, id)
);

GRANT SELECT ON hci.case_report_snapshots TO hci_app_test_a, hci_app_test_b;
-- generated_at withheld (server-default only, same pattern as
-- cases.opened_at/principals.created_at) -- a report's own timestamp must not
-- be caller-chosen, the exact CREATED-AT-01 class of gap this schema already
-- guards against elsewhere.
GRANT INSERT (id, tenant_id, case_id, generated_by_principal_id, report)
  ON hci.case_report_snapshots TO hci_app_test_a, hci_app_test_b;
REVOKE UPDATE, DELETE ON hci.case_report_snapshots FROM hci_app_test_a, hci_app_test_b;
CREATE TRIGGER case_report_snapshots_append_only BEFORE UPDATE OR DELETE ON hci.case_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete();
CREATE TRIGGER case_report_snapshots_no_truncate BEFORE TRUNCATE ON hci.case_report_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION hci.reject_update_delete();

CREATE INDEX case_report_snapshots_case_idx ON hci.case_report_snapshots (tenant_id, case_id, generated_at DESC);
ALTER TABLE hci.case_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.case_report_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hci.case_report_snapshots
  USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id());

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
    'data_encryption_keys','decision_claims','principals','case_report_snapshots'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift after 0016; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

COMMIT;
