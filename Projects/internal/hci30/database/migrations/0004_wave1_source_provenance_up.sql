-- HCI-30 Wave 1 - Source/SourceSnapshot provenance and corroboration graph
-- (ADR-0026, HD-16).
--
-- Extends 0001_wave1_synthetic_up.sql + 0002_wave1_case_aggregate_up.sql +
-- 0003_wave1_regulatory_market_scope_up.sql. Must run after all three, in
-- the same database, before the fixtures/harness/negative-test files.
--
-- ============================================================================
-- VBC note (2026-09-05): ADR-0026 gate 1's own text says "Source and
-- SourceSnapshot have no table yet." That is stale relative to what 0001
-- actually built: hci.sources (0001_wave1_synthetic_up.sql, source_ref,
-- tenant_id NOT NULL, already in the tenant-isolation loop) already exists
-- and is already tenant-scoped + RLS-forced - checked before assuming this
-- gate needed a new sources table, per this project's "verify before
-- conclude" discipline. What is genuinely missing, and what this migration
-- adds: hci.source_snapshots (the hash+metadata pointer to a specific
-- retrieval of a Source, referenced by ADR-0026's "raw-source cache"
-- discussion) and hci.source_relationships (the corroboration graph -
-- cites/derived_from/original_source - named at
-- 06_HCI30_PUBLIC_INTELLIGENCE.md:175-179 and required by ADR-0026 gate 1's
-- "no table in this group is exempted" clause).
--
-- Both new tables are append-only (REVOKE UPDATE/DELETE + trigger), matching
-- hci.subject_records rather than hci.sources' current full-CRUD shape:
-- a source snapshot records what was retrieved at a point in time, and a
-- corroboration edge records a fact about the evidence graph as it stood -
-- neither should be silently rewritten after the fact.
--
-- hci.sources' own mutability is NOT left unchanged by this migration, unlike
-- an earlier draft of this note claimed (2026-09-05 db-expert review, real
-- probe): the new FK from hci.source_snapshots makes a hci.sources row
-- undeletable the moment any snapshot references it - hci.sources itself is
-- still full-CRUD per 0001's grant, but DELETE against a referenced row now
-- fails with 23503. This is very likely the correct behavior (provenance
-- should pin its sources), but it is a real behavioral change to a
-- pre-existing table and is stated here rather than disclaimed.
--
-- Correction of the corroboration graph is not possible under this design,
-- and that is a real, undischarged limitation, not an oversight to gloss
-- over: source_relationships is append-only with no supersession mechanism.
-- 2026-09-05 update: ADR-0017's hci.mark_superseded()/H1008 landed
-- (migrations/0005_wave1_bitemporal_history_up.sql), but this table was not
-- given a supersedes_id/bitemporal shape by that migration - the ADR names
-- Evidence/Claim/Assessment/Decision specifically, not the corroboration
-- graph - so a CITES edge asserted in error - e.g. pointing at a since-
-- discredited citation - can still never be retracted or corrected, only ever
-- added around. Left this way for the same reason gate 3 below is left open
-- rather than built against a mechanism that does not exist yet: building a
-- correction path here would mean inventing ADR-0017's mechanism inline,
-- which is that ADR's decision to make, not this migration's. Tracked as
-- blocked on ADR-0017 landing, alongside gate 3's ADR-0018 dependency below.
-- These two tables also enlarge the eventual erasure surface ADR-0018's
-- crypto-shredding mechanism will need to cover.
--
-- Gate 3 (DSR-CLAIM-DELETE-01, a deletion-completeness test) is NOT
-- attempted here. It requires an actual deletion/erasure mechanism for
-- subject_records-and-friends, and none exists yet: subject_records is
-- unconditionally append-only (0001's append_only category, H1003 on any
-- UPDATE/DELETE with no exception path), and the only decided erasure
-- mechanism (crypto-shredding, ADR-0018) is still SPECIFIED - RUNTIME OPEN,
-- not built. Writing a test against a deletion path that does not exist
-- would either be vacuous or would require inventing an erasure mechanism
-- ADR-0018 already owns - left OPEN, tracked as blocked on ADR-0018 landing
-- first, not faked.
--
-- Lock behavior (2026-09-05 db-expert review, verified against a real PG
-- 15.8 probe, not just reasoned about): the two FK-bearing CREATE TABLEs
-- below take ShareRowExclusiveLock on hci.tenants, hci.sources, and
-- hci.subject_records - all three pre-existing tables - held until COMMIT,
-- confirmed to actually block writes to them (a probed INSERT into
-- hci.sources from a second session hit the lock_timeout below). On today's
-- empty synthetic tables this is unmeasurable. The BEGIN/COMMIT wrapping
-- here is not protecting a DROP-then-ADD-CONSTRAINT window the way 0002/0003
-- needed - there isn't one - it is protecting the grant-before-RLS window
-- at the bottom of this file (GRANT at one line, RLS ENABLE/FORCE/POLICY a
-- few lines later): without the transaction, a failure in between - a
-- lock_timeout, a failed CREATE INDEX - would leave a granted, RLS-less,
-- cross-tenant-readable table sitting in the schema, exactly the "no naked
-- table" failure mode this schema's own conventions exist to prevent.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

-- Table-inventory drift check moved to immediately after BEGIN (established
-- pattern from 0003's header): takes no lock on the tables this migration is
-- about to create, and fails fast before any DDL below acquires one.
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
    'tenants','app_tenant_bindings','cases'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0004; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- ============================================================================
-- hci.source_snapshots: a specific retrieval of a Source at a point in time.
-- content_hash/snapshot_ref are the "hash+metadata pointer" ADR-0026:25
-- describes - opaque here by design, the same way hci.cases.project_ref is
-- opaque (0002:66-70): this table records that a snapshot was taken and
-- where its bytes live, not the bytes themselves or how they are stored.
-- ============================================================================
CREATE TABLE hci.source_snapshots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  source_id uuid NOT NULL,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL CHECK (length(btrim(content_hash)) > 0),
  snapshot_ref text NOT NULL CHECK (length(btrim(snapshot_ref)) > 0),
  FOREIGN KEY (tenant_id, source_id) REFERENCES hci.sources(tenant_id, id),
  UNIQUE (tenant_id, id)
);

-- ============================================================================
-- hci.source_relationships: the corroboration graph
-- (06_HCI30_PUBLIC_INTELLIGENCE.md:175-179). Each row is one typed edge from
-- a Claim to either a Source or a SourceSnapshot - exactly one of
-- source_id/source_snapshot_id is set, matching the "cites points at a
-- specific retrieval, original_source may point at the source itself"
-- distinction implicit in that section's field list.
--
-- claim_id's typed-reference FK mirrors the existing
-- data_subject_request_targets pattern (0001:171-178): subject_records has
-- UNIQUE (tenant_id, id, kind), so a bare uuid FK cannot by itself guarantee
-- the referenced row is actually kind='CLAIM' and not kind='EVIDENCE' or
-- 'ASSESSMENT'; claim_kind is a dummy CHECK-pinned column solely to carry
-- that literal into the composite FK, not a real data field.
-- ============================================================================
CREATE TABLE hci.source_relationships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  claim_id uuid NOT NULL,
  claim_kind text NOT NULL DEFAULT 'CLAIM' CHECK (claim_kind = 'CLAIM'),
  relationship_type text NOT NULL CHECK (relationship_type IN ('CITES','DERIVED_FROM','ORIGINAL_SOURCE')),
  source_id uuid,
  source_snapshot_id uuid,
  CHECK ((source_id IS NOT NULL) <> (source_snapshot_id IS NOT NULL)),
  FOREIGN KEY (tenant_id, claim_id, claim_kind) REFERENCES hci.subject_records(tenant_id, id, kind),
  FOREIGN KEY (tenant_id, source_id) REFERENCES hci.sources(tenant_id, id),
  FOREIGN KEY (tenant_id, source_snapshot_id) REFERENCES hci.source_snapshots(tenant_id, id)
);

-- ============================================================================
-- Append-only + tenant-isolation wiring, manually replicating 0001's
-- declarative append_only-category loop (0001:284-338) for these two tables
-- specifically: that loop already ran once in 0001 and cannot retroactively
-- pick up tables created in a later migration, the same reason 0002 wired
-- hci.cases' protections by hand instead of re-running the loop.
-- ============================================================================
-- retrieved_at is server-assigned only (2026-09-05 db-expert review: the
-- original table-level GRANT below made it client-writable, contradicting
-- 0001's own stated rule at 0001:340-344 - "a ledger whose timestamps the
-- audited party can choose proves no ordering at all" - and worse here than
-- in 0001's case, since this table is append-only and a wrong retrieved_at
-- could never be corrected afterward). Same restricted-column pattern as
-- data_subject_request_events.created_at (0001:343-344).
GRANT SELECT ON hci.source_snapshots TO hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, source_id, content_hash, snapshot_ref)
  ON hci.source_snapshots TO hci_app_test_a, hci_app_test_b;
REVOKE UPDATE, DELETE ON hci.source_snapshots FROM hci_app_test_a, hci_app_test_b;
CREATE TRIGGER source_snapshots_append_only BEFORE UPDATE OR DELETE ON hci.source_snapshots FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete();
CREATE TRIGGER source_snapshots_no_truncate BEFORE TRUNCATE ON hci.source_snapshots FOR EACH STATEMENT EXECUTE FUNCTION hci.reject_update_delete();
CREATE INDEX source_snapshots_tenant_idx ON hci.source_snapshots (tenant_id);
CREATE INDEX source_snapshots_source_idx ON hci.source_snapshots (tenant_id, source_id);
ALTER TABLE hci.source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.source_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hci.source_snapshots USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id());

GRANT SELECT, INSERT ON hci.source_relationships TO hci_app_test_a, hci_app_test_b;
REVOKE UPDATE, DELETE ON hci.source_relationships FROM hci_app_test_a, hci_app_test_b;
CREATE TRIGGER source_relationships_append_only BEFORE UPDATE OR DELETE ON hci.source_relationships FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete();
CREATE TRIGGER source_relationships_no_truncate BEFORE TRUNCATE ON hci.source_relationships FOR EACH STATEMENT EXECUTE FUNCTION hci.reject_update_delete();
CREATE INDEX source_relationships_tenant_idx ON hci.source_relationships (tenant_id);
CREATE INDEX source_relationships_claim_idx ON hci.source_relationships (tenant_id, claim_id);
-- source_id specifically (2026-09-05 db-expert review, real EXPLAIN probe):
-- unlike the claim_id and source_snapshot_id FKs, whose parent tables
-- (subject_records, source_snapshots) are append-only and can therefore
-- never trigger a parent-side RI scan, hci.sources is still full-CRUD
-- (0001's ELSE category) - every DELETE or key-column UPDATE against it
-- fires an RI check here. Without this index that check degrades to a
-- tenant-wide scan with source_id as a post-filter, on what is designed to
-- be the largest table in this schema. Mirrors source_snapshots_source_idx
-- above for the identical FK shape against the identical parent.
CREATE INDEX source_relationships_source_idx ON hci.source_relationships (tenant_id, source_id);
ALTER TABLE hci.source_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.source_relationships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hci.source_relationships USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id());

-- Cumulative table-inventory check, post-0004 (same do-not-edit-committed-
-- history reason as 0002/0003's equivalent checks).
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
    'tenants','app_tenant_bindings','cases','source_snapshots','source_relationships'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift after 0004; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

COMMIT;
