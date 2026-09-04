-- HCI-30 Wave 1 - Bitemporal scope fence (ADR-0017 gate 4, HD-06).
--
-- Extends 0001-0005. Must run after all five, before the fixtures/harness/
-- negative-test files.
--
-- ADR-0017's Decision item 2: "Every other table... carries exactly one
-- NOT NULL, server-assigned insertion-timestamp column... No valid_*/
-- system_* bitemporal columns may be populated outside the four tables
-- named in item 1." Gate 4 is the machine form of that sentence
-- (BITEMP-SCOPE-01, information_schema introspection). This migration is
-- what makes that check pass honestly: eleven pre-existing tables
-- (persons, tenant_authorizations, subject_lawful_basis_records, sources,
-- source_terms_records, research_workflows, data_subject_requests,
-- data_subject_request_targets, identity_candidates, identity_verifications,
-- source_relationships) currently carry NO insertion-timestamp column at
-- all - a real, pre-existing gap this migration closes, not a regression
-- being introduced.
--
-- Deliberately its own migration, not folded into 0005: touching eleven
-- unrelated pre-existing tables' grants is a distinct blast radius from the
-- bitemporal mechanism itself (0005's own header makes the same call), and
-- 0002/0003/0004 already established one-cohesive-concern-per-migration as
-- this schema's convention.
--
-- Plain now(), not clock_timestamp(): 0005's switch to clock_timestamp() for
-- system_recorded_at/system_superseded_at was specifically about a CHECK
-- constraint comparing that pair ACROSS ROWS under concurrency (a longer
-- transaction's successor could get an earlier value than an already-
-- committed predecessor, tripping subject_records_superseded_after_recorded
-- with a false 23514). None of the eleven columns here have any such
-- cross-row constraint - they are plain single-row insertion timestamps,
-- the same shape as every existing created_at/opened_at/retrieved_at
-- column in this schema (0001:340-344, 0002 cases.opened_at, 0004
-- source_snapshots.retrieved_at), all of which use now(). Matching that
-- convention here, not introducing a second one.
--
-- created_at is withheld from BOTH the INSERT and UPDATE grants for every
-- table below, not just INSERT: 0001:349-351's own stated rule ("a ledger
-- whose timestamps the audited party can choose proves no ordering at all")
-- applies exactly the same to a column that starts correct at INSERT and
-- could then be silently rewritten by UPDATE. The eight full-CRUD tables and
-- two no_delete tables below currently hold table-level UPDATE grants that
-- would otherwise silently extend to this new column; source_relationships
-- needs no equivalent narrowing - it is 0004's append_only category, and
-- REVOKE UPDATE, DELETE already covers the whole table unconditionally,
-- including any column added later.
--
-- app_tenant_bindings is NOT one of the eleven, even though it has its own
-- tenant_id column: it is an infrastructure role->tenant mapping, not
-- domain data - 0001:281-282 already withholds it from the application
-- roles entirely ("a tenant must never be able to read or rewrite the
-- mapping that decides which tenant it is"), and ADR-0017's own examples of
-- "every other table" (source_snapshots, cases, identity_candidates) are
-- all domain tables, not schema-internal plumbing. BITEMP-SCOPE-01 below
-- excludes it explicitly, by name, rather than by accident of a query that
-- happens not to catch it.

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
    'tenants','app_tenant_bindings','cases','source_snapshots','source_relationships','decisions'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0006; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- The eight full-CRUD ("ELSE" category in 0001's declarative loop) tables
-- plus the two no_delete tables: all ten currently hold table-level
-- INSERT and UPDATE grants, so both must be narrowed the same way. Driven
-- by a VALUES list rather than eleven repeated blocks, to remove the risk
-- of a manual copy-paste error in one of the eleven column lists - the
-- column lists themselves are still fully explicit (this schema's
-- established convention), just supplied as loop data instead of literal
-- SQL text per table.
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('persons',                       'id,tenant_id,display_label'),
      ('tenant_authorizations',         'id,tenant_id,status,expires_at'),
      ('subject_lawful_basis_records',  'id,tenant_id,person_id,basis'),
      ('sources',                       'id,tenant_id,source_ref'),
      ('source_terms_records',          'id,tenant_id,source_id,terms_ref'),
      ('research_workflows',            'id,tenant_id,tenant_authorization_id,case_id'),
      ('identity_candidates',           'id,tenant_id,person_id,match_state'),
      ('identity_verifications',        'id,tenant_id,candidate_id,method,evidence_ref'),
      ('data_subject_requests',         'id,tenant_id,person_id,request_type,status'),
      ('data_subject_request_targets',  'id,tenant_id,request_id,target_kind,target_id')
    ) AS t(tbl, cols)
  LOOP
    EXECUTE format('ALTER TABLE hci.%I ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()', rec.tbl);
    EXECUTE format('REVOKE INSERT, UPDATE ON hci.%I FROM hci_app_test_a, hci_app_test_b', rec.tbl);
    EXECUTE format('GRANT INSERT (%s) ON hci.%I TO hci_app_test_a, hci_app_test_b', rec.cols, rec.tbl);
    EXECUTE format('GRANT UPDATE (%s) ON hci.%I TO hci_app_test_a, hci_app_test_b', rec.cols, rec.tbl);
  END LOOP;
END $$;

-- source_relationships (0004's append_only category): no UPDATE grant
-- exists to narrow, REVOKE UPDATE, DELETE already covers the whole table.
ALTER TABLE hci.source_relationships ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
REVOKE INSERT ON hci.source_relationships FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, claim_id, claim_kind, relationship_type, source_id, source_snapshot_id)
  ON hci.source_relationships TO hci_app_test_a, hci_app_test_b;

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
    'tenants','app_tenant_bindings','cases','source_snapshots','source_relationships','decisions'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift after 0006; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

COMMIT;
