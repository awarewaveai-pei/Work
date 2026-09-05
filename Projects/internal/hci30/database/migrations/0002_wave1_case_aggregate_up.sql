-- HCI-30 Wave 1 - Case/Engagement aggregate (ADR-0020, HD-10).
--
-- Extends 0001_wave1_synthetic_up.sql. Must run after it, in the same
-- database, before the fixtures/harness/negative-test files.
--
-- ============================================================================
-- Domain error-code registry extension. 2026-09-05: the SSOT for this list
-- is now database/ERROR_CODE_REGISTRY.md, not 0001's header comment (which
-- is frozen as a record of its own file's codes only, per that file's own
-- 2026-09-05 note) - this block is kept as a historical record of what this
-- specific file allocated, not as the place to look up "next free."
-- ============================================================================
--   H1010  case lifecycle transition rejected
--   H1011  case is not OPEN/ACTIVE (research_workflows/subject_records insert
--          rejected)
--
-- H1008 and H1009 are reserved by ADR-0017 (mark_superseded) and ADR-0018
-- (tombstone_evidence) respectively; neither is implemented in this schema
-- yet. This migration's codes are numbered to not collide with either, per
-- the reconciliation note at ADR-0020 gate 2 / Evidence.
-- ============================================================================
--
-- Why hci.cases is a NEW migration rather than added to 0001's CREATE TABLE
-- list: 0001 is already committed, real-Docker-tested (51/51 assertions,
-- 15/15 mutations), and that evidence trail is a record of what that exact
-- file's content does. Editing 0001 in place would silently invalidate that
-- history. This is Wave 1 pre-freeze, additive, synthetic-only schema
-- evolution - a genuinely new migration, not a production change requiring
-- expand/contract discipline (no real data exists to migrate).
--
-- Wrapped in a single transaction (unlike 0001, which relies on psql's
-- ON_ERROR_STOP plus the fact that its statements are only ever run once
-- against an empty database): 0002 runs a real ADD COLUMN ... NOT NULL
-- against tables 0001 already created, and a partial failure mid-file would
-- otherwise leave the schema in a state that is neither "0001 only" nor
-- "0001+0002" - not cleanly re-runnable and not cleanly reversible by either
-- down migration. All DDL and DO blocks here are transactional in PostgreSQL.
--
-- Lock behaviour (2026-09-04, db-expert review, verified against a real
-- PG 15.8 probe container - not just reasoned about): the FK-bearing
-- CREATE TABLE below takes ShareRowExclusiveLock on hci.tenants and
-- hci.tenant_authorizations from that statement onward, and the two
-- ADD COLUMN ... NOT NULL statements take AccessExclusiveLock on
-- research_workflows and subject_records - all four locks are held until
-- COMMIT, i.e. for the rest of this file, including the closing drift-check
-- DO block. On today's empty synthetic tables that window is milliseconds.
-- This pattern does NOT carry over to a populated table: CREATE INDEX
-- CONCURRENTLY (needed to avoid the same AccessExclusiveLock on a real
-- table) cannot run inside a transaction block at all, so a future migration
-- following this file's shape on real data would need to split it back into
-- multiple non-transactional steps rather than copy this BEGIN/COMMIT
-- wrapper. lock_timeout below converts "some other session builds up a lock
-- queue behind this migration" into a clean, retryable failure instead of an
-- indefinite stall - the probe reproduced an ordinary read (SELECT count(*))
-- queuing behind a blocked writer once one table was mid-migration.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE TABLE hci.cases (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  tenant_authorization_id uuid NOT NULL,
  purpose text NOT NULL CHECK (length(btrim(purpose)) > 0),
  -- ADR-0013 (WAVE1-EPISTEMIC-ANNOTATION-01): R0-R4 mirrors AI LEGO's
  -- risk-tier.schema.yaml ladder and is PROVISIONAL pending ADR-0013 gate 3.
  -- Annotation added 2026-09-05 (comment only, no schema change) when
  -- scripts/verify-epistemic-annotation.ps1 was built and found this
  -- pre-existing Wave 1 column uncited.
  risk_tier text NOT NULL CHECK (risk_tier IN ('R0','R1','R2','R3','R4')),
  relationship_context text,
  requester_context text NOT NULL CHECK (length(btrim(requester_context)) > 0),
  -- Opaque, never a foreign key: a Case must never depend on the commercial
  -- Project/billing schema (doc 08) existing, resolving, or even being
  -- reachable. See ADR-0020 "Why B (merge into Project) loses".
  project_ref text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACTIVE','CLOSED')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  -- Bidirectional: CLOSED without closed_at is exactly as wrong as closed_at
  -- with a non-CLOSED status (2026-09-04 critic review; the one-way version
  -- of this CHECK only closed off the direction the trigger already handled).
  CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL)),
  FOREIGN KEY (tenant_id, tenant_authorization_id) REFERENCES hci.tenant_authorizations(tenant_id, id),
  UNIQUE (tenant_id, id)
);

-- BEFORE INSERT OR UPDATE (2026-09-04 critic review; originally BEFORE UPDATE
-- only, on the theory that the column DEFAULT was the sole INSERT path - that
-- theory was false because 'status' was also in the INSERT grant below,
-- letting the app role INSERT directly into ACTIVE or CLOSED and skip the
-- state machine entirely, including a CLOSED row born with closed_at NULL).
-- 'status' is now withheld from the INSERT grant (matching opened_at's
-- pattern), so the app role cannot reach the INSERT branch below at all; it
-- exists for the same break-glass/table-owner reason 0001's append-only
-- triggers exist (0001:288-291) - a connection whose privileges bypass grants
-- must still go through OPEN.
--
-- The UPDATE branch permits exactly OPEN->ACTIVE and ACTIVE->CLOSED; every
-- other status change (CLOSED->*, and the OPEN->CLOSED skip) is rejected,
-- matching the state machine already used for data_subject_requests
-- (0001:134-161) but with its own registry code so the two lifecycles remain
-- independently testable. It also freezes every other column once CLOSED:
-- the original version guarded only the moment of closing, not what could
-- still be rewritten afterwards on a case that claims to be finished - the
-- same missing-invariant class 0001 already names at :37-39.
CREATE FUNCTION hci.enforce_case_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'OPEN' THEN
      RAISE EXCEPTION USING ERRCODE = 'H1010', MESSAGE = 'a case must be created OPEN';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'CLOSED' AND (NEW.purpose, NEW.risk_tier, NEW.relationship_context, NEW.requester_context, NEW.project_ref)
       IS DISTINCT FROM (OLD.purpose, OLD.risk_tier, OLD.relationship_context, OLD.requester_context, OLD.project_ref) THEN
    RAISE EXCEPTION USING ERRCODE = 'H1007', MESSAGE = 'case fields are immutable once CLOSED';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'OPEN' AND NEW.status = 'ACTIVE') OR (OLD.status = 'ACTIVE' AND NEW.status = 'CLOSED')) THEN
      RAISE EXCEPTION USING ERRCODE = 'H1010', MESSAGE = 'invalid case lifecycle transition';
    END IF;
    -- Set inside the trigger, not by the caller: closed_at is withheld from
    -- the app role's UPDATE grant below, so this is the only path that can
    -- ever set it. A BEFORE-row trigger may assign NEW.<col> regardless of
    -- the acting role's column privileges - only the client-supplied SET
    -- list is privilege-checked, not trigger-internal writes to NEW.
    IF NEW.status = 'CLOSED' THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cases_lifecycle BEFORE INSERT OR UPDATE ON hci.cases FOR EACH ROW EXECUTE FUNCTION hci.enforce_case_lifecycle();
CREATE TRIGGER cases_tenant_immutable BEFORE UPDATE ON hci.cases FOR EACH ROW EXECUTE FUNCTION hci.reject_tenant_change();
-- A Case is never deleted (ADR-0020 explicitly does not decide HD-07
-- erasure/retention for a closed Case) or truncated. These reuse 0001's
-- shared hci.reject_update_delete() (H1003) rather than a new function, and
-- exist for the same break-glass reason 0001's append_only/no_delete tables
-- get this trigger layer (0001:284-291) - the withheld DELETE grant below
-- only stops the app role, not a connection whose privileges bypass grants
-- (2026-09-04 critic review; the original migration gave hci.cases the grant
-- layer only, unlike every other protected table in this schema).
CREATE TRIGGER cases_no_delete BEFORE DELETE ON hci.cases FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete();
CREATE TRIGGER cases_no_truncate BEFORE TRUNCATE ON hci.cases FOR EACH STATEMENT EXECUTE FUNCTION hci.reject_update_delete();

GRANT SELECT ON hci.cases TO hci_app_test_a, hci_app_test_b;
-- opened_at and status are both server/default-assigned only (same
-- restricted-column pattern as data_subject_request_events.created_at,
-- 0001:340-344). 'status' was removed from this list 2026-09-04 (critic
-- review, see the trigger comment above) - the app role now has no way to
-- create a case in any state but the DEFAULT 'OPEN'.
GRANT INSERT (id, tenant_id, tenant_authorization_id, purpose, risk_tier, relationship_context, requester_context, project_ref)
  ON hci.cases TO hci_app_test_a, hci_app_test_b;
-- closed_at is trigger-only. tenant_id, tenant_authorization_id, opened_at,
-- and id are not in this list either: none of the four has a stated need to
-- change post-creation, and withholding by default is the narrower, safer
-- choice absent an ADR requirement to the contrary.
GRANT UPDATE (status, purpose, risk_tier, relationship_context, requester_context, project_ref)
  ON hci.cases TO hci_app_test_a, hci_app_test_b;
-- No DELETE grant: a Case is never deleted. ADR-0020 explicitly does not
-- decide HD-07 erasure/retention for a closed Case, so this withholds delete
-- entirely rather than assuming an answer to a question still open.

CREATE INDEX cases_tenant_idx ON hci.cases (tenant_id);
ALTER TABLE hci.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.cases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hci.cases USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id());

-- ============================================================================
-- Ownership binding (ADR-0020 gate 3): every research_workflows and
-- subject_records row must belong to exactly one Case. Added as NOT NULL
-- directly (not nullable-then-backfilled) because this table is empty at
-- migration time - fixtures and the negative-test suite run after this file,
-- so there is no existing data to violate the constraint.
--
-- This is a correctness precondition, not a performance one (2026-09-04,
-- db-expert review, verified against a real PG 15.8 probe): on a table that
-- already has rows, `ADD COLUMN ... NOT NULL` with no DEFAULT does not run
-- slowly, it fails outright (23502, not_null_violation) as soon as it hits
-- the first existing row - there is no partial/degraded outcome to worry
-- about. "Empty table" is what makes this statement succeed at all, not
-- merely what makes it cheap. A future migration reusing this NOT-NULL-
-- directly shape on a populated table needs real expand/contract (nullable
-- column, backfill, then a separate NOT NULL step), not just a bigger lock
-- budget.
-- ============================================================================
ALTER TABLE hci.research_workflows ADD COLUMN case_id uuid NOT NULL;
ALTER TABLE hci.research_workflows ADD FOREIGN KEY (tenant_id, case_id) REFERENCES hci.cases(tenant_id, id);
-- ADR-0020's stated purpose is bounding replay to one case_id
-- (ADR-0020:18,35): "every workflow/subject_record under this case" is
-- therefore an expected query shape, and would otherwise be a seq scan.
-- Unlike a typical unindexed-FK risk, the referenced (hci.cases) side is not
-- exposed here: DELETE is trigger-blocked (cases_no_delete above) and
-- tenant_id/id are excluded from cases' own UPDATE grant plus guarded by
-- cases_tenant_immutable, so there is no RI check on hci.cases that this
-- index would otherwise be protecting.
CREATE INDEX research_workflows_case_idx ON hci.research_workflows (tenant_id, case_id);

-- case_id is immutable once set (2026-09-04 critic review): research_workflows
-- is a normal (not append-only) table, so without this a row's case_id could
-- be UPDATEd to point at a different case after INSERT - including a CLOSED
-- one, since the terminal-state guard below is BEFORE INSERT only. That would
-- let a workflow be moved into a closed case entirely without tripping the
-- guard the ownership binding exists to enforce, and would undermine the
-- "replay bounds to one case_id" premise ADR-0020 is built on (a case_id that
-- can be silently repointed after the fact is not a stable replay boundary).
-- subject_records needs no equivalent trigger: it is already append-only
-- (0001:304,311-314), so its case_id can never be UPDATEd at all.
CREATE FUNCTION hci.reject_case_reassignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.case_id <> OLD.case_id THEN
    RAISE EXCEPTION USING ERRCODE = 'H1007', MESSAGE = 'case_id is immutable once set';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_workflows_case_immutable BEFORE UPDATE ON hci.research_workflows FOR EACH ROW EXECUTE FUNCTION hci.reject_case_reassignment();

ALTER TABLE hci.subject_records ADD COLUMN case_id uuid NOT NULL;
ALTER TABLE hci.subject_records ADD FOREIGN KEY (tenant_id, case_id) REFERENCES hci.cases(tenant_id, id);
CREATE INDEX subject_records_case_idx ON hci.subject_records (tenant_id, case_id);

-- ============================================================================
-- Terminal-state guard (ADR-0020 gate 4): a CLOSED case may not admit new
-- work. BEFORE INSERT only - an already-admitted row is not retroactively
-- affected by its Case closing later (mirrors CONSENT-NEG-04's "revocation
-- guards the START of new work only" design, 0001:95-100), and is no longer
-- an UPDATE-side gap now that case_id itself is frozen post-INSERT (the
-- trigger above): the only way a row's case_id is ever evaluated against
-- hci.cases is at the moment of INSERT.
--
-- Alphabetical trigger-firing order (already relied on for
-- TENANT-IMMUTABLE-01, see wave1-negative-tests.sql) puts
-- research_workflows_require_active_authorization ('...require_active...')
-- before research_workflows_require_open_or_active_case
-- ('...require_open...') on hci.research_workflows, so an inactive
-- authorization is still reported as H1001 even when the case is also
-- closed - composing with, not shadowing, the existing gate.
--
-- Fail-closed against unknown future status values, but only once the case
-- is known to resolve inside this row's own tenant (2026-09-04, corrected
-- twice in the same session by real Docker runs, not by reasoning alone):
--
-- Attempt 1 (originally shipped) checked "status = 'CLOSED'" - fail-open, per
-- the critic review below.
-- Attempt 2 flipped it to "NOT (status IN ('OPEN','ACTIVE'))" - fail-closed
-- against a future status value, but WRONG for a different reason the first
-- real Docker run of the widened suite caught: RLS-WRITE-01, CASE-OWNS-01,
-- and CASE-OWNS-02 all failed. This trigger fires BEFORE the NOT NULL
-- constraint on case_id, BEFORE the composite FK to hci.cases, AND before
-- this row's own RLS WITH CHECK - and its SELECT against hci.cases is itself
-- RLS-filtered (SECURITY INVOKER, correctly - see 00_test_harness.sql:24-26).
-- So a NULL case_id, a case_id belonging to a different tenant than this row,
-- or a cross-tenant write attempt (this row's own tenant_id not matching the
-- caller's session) all make the lookup return zero visible rows, which
-- "NOT EXISTS ... IN ('OPEN','ACTIVE')" reads as "not open or active" and
-- rejects with the wrong H1011 - masking the more specific 23502/23503/42501
-- that the NOT NULL constraint, the FK, and this row's own RLS WITH CHECK
-- would otherwise correctly raise a moment later.
--
-- This (attempt 3) resolves the case's status once into v_status. A case_id
-- that does not resolve inside this row's own tenant - NULL, absent, or
-- belonging to someone else - is deliberately NOT this trigger's concern:
-- v_status stays NULL, the trigger returns NEW without raising, and control
-- passes to whichever downstream check is actually the right one to fire.
-- Only once a case genuinely resolves in-tenant does fail-closed logic apply:
-- any status other than OPEN/ACTIVE - including a value that does not exist
-- yet - is rejected, rather than only the one value ('CLOSED') known about
-- today. This keeps both properties attempt 1 and attempt 2 each got only
-- half of.
-- ============================================================================
CREATE FUNCTION hci.require_open_or_active_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT c.status INTO v_status FROM hci.cases c
   WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.case_id;

  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_status NOT IN ('OPEN','ACTIVE') THEN
    RAISE EXCEPTION USING ERRCODE = 'H1011', MESSAGE = 'case is not open or active; new work may not be admitted';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_workflows_require_open_or_active_case BEFORE INSERT ON hci.research_workflows FOR EACH ROW EXECUTE FUNCTION hci.require_open_or_active_case();
CREATE TRIGGER subject_records_require_open_or_active_case BEFORE INSERT ON hci.subject_records FOR EACH ROW EXECUTE FUNCTION hci.require_open_or_active_case();

-- ============================================================================
-- Cumulative table-inventory drift check (ADR-0020 gate 1's "same migration"
-- requirement, satisfied here as a fresh check over the full post-0002
-- inventory rather than by editing 0001's own check, for the same
-- do-not-edit-committed-history reason given above). Extends 0001's list by
-- exactly 'cases'.
-- ============================================================================
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
    RAISE EXCEPTION 'hci table inventory drift after 0002; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

COMMIT;
