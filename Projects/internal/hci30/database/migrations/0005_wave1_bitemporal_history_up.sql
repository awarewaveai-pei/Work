-- HCI-30 Wave 1 - Bitemporal history for Evidence/Claim/Assessment/Decision
-- (ADR-0017, HD-06). Implements gates 1-3 only; gate 4 (the BITEMP-SCOPE-01
-- architecture fence, which requires retrofitting a server-assigned
-- insertion-timestamp column onto every OTHER tenant-owned table) is a
-- separate, independently reviewable migration (0006) - touching eleven
-- unrelated pre-existing tables' grants is a distinct blast radius from the
-- new bitemporal mechanism itself, and 0002/0003/0004 already established
-- one-cohesive-concern-per-migration as this schema's convention. Gate 5
-- (Wave 4 consumer binding, EXPLAIN-ASOF-01) is out of scope: no application
-- layer exists yet to bind.
--
-- Extends 0001+0002+0003+0004. Must run after all four, before the
-- fixtures/harness/negative-test files.
--
-- ADR-0017's own gate 1 text says "Migration 0002 adds..." - stale relative
-- to the migration numbering that was actually finalized (0002 is ADR-0020's
-- hci.cases, already committed and real-Docker-verified). This is migration
-- 0005; noted here rather than editing the ADR's historical decision record.
--
-- ============================================================================
-- The escape-hatch design problem, and why it is NOT a session-local GUC flag
-- ============================================================================
-- hci.mark_superseded() must UPDATE a predecessor row's system_superseded_at,
-- but that row's own append-only trigger (hci.reject_update_delete(), shared
-- across every append-only table in this schema) rejects ALL UPDATEs
-- unconditionally, including ones from a SECURITY DEFINER function owned by
-- the schema owner - the trigger runs as the ROLE PERFORMING THE UPDATE, and
-- SECURITY DEFINER makes that role hci_owner in both the legitimate call and
-- a hypothetical direct hci_owner UPDATE, so nothing distinguishes them by
-- "who is executing."
--
-- A session-local GUC flag (set_config('hci.internal_write','on',true),
-- checked inside a modified reject_update_delete()) was the first design
-- considered and REJECTED after a real-Docker probe: PostgreSQL lets ANY role
-- SET an arbitrary custom (non-predefined) GUC for its own session by
-- default - there is no SQL-level mechanism to restrict who can set a bare
-- `hci.xxx` parameter without a C extension. The application role could
-- simply run `SET hci.internal_write = 'on'` itself before a raw UPDATE,
-- completely forging the escape hatch. That is a real security regression
-- (forgeable by ANY role holding UPDATE grant, not just the owner), not a
-- theoretical one, so it was not built.
--
-- The SECOND design considered - `ALTER TABLE ... DISABLE TRIGGER
-- <table>_append_only` inside mark_superseded(), then its own UPDATE, then
-- re-`ENABLE TRIGGER` - passed the same five-scenario privilege probe the GUC
-- design failed, but broke for a DIFFERENT reason on the first real migration
-- run against the actual schema (not the standalone probe): mark_superseded()
-- fires as an AFTER INSERT ROW trigger ON THE SAME TABLE it then needs to
-- ALTER, and PostgreSQL raises `55006 cannot ALTER TABLE "subject_records"
-- because it is being used by active queries in this session` - the
-- triggering INSERT statement itself is still "active" for that relation
-- when the AFTER trigger fires, and ALTER TABLE cannot run reentrant against
-- a relation with an open query in the same session. The standalone probe
-- (a plain `SELECT mark_superseded(id)` call, no enclosing INSERT on the same
-- table) never hit this, which is exactly why it had to be caught by running
-- the real migration end to end, not by trusting the probe alone.
--
-- The THIRD design considered - a lazily-created, per-session TEMP TABLE
-- (`pg_temp.hci_supersession_lock`), owned by hci_owner with no GRANT to the
-- application roles, populated immediately before mark_superseded()'s UPDATE
-- and cleared immediately after - passed 118/118 real assertions and 45/45
-- mutations, then was REJECTED by an independent db-expert review before
-- commit (2026-09-05) for a real, demonstrated hole: `pg_temp` is not
-- actually owner-exclusive. PostgreSQL grants every role holding the
-- database's `TEMPORARY` privilege (PUBLIC by default, never revoked by any
-- migration in this schema) full rights, including CREATE, on ITS OWN
-- session's temp schema - and because `SET ROLE` shares one session's
-- `pg_temp` across every role switch (exactly how this project's own test
-- harness runs), an application role can simply run `CREATE TEMP TABLE
-- hci_supersession_lock (id uuid PRIMARY KEY); INSERT INTO
-- hci_supersession_lock VALUES ('<target row id>');` BEFORE hci_owner's
-- lazy `CREATE TEMP TABLE IF NOT EXISTS` ever runs, and that IF NOT EXISTS
-- silently adopts the attacker's table. This is the SAME forgeability class
-- as the first (GUC) design, not a new one - "any role can plant the
-- session-local marker checked to grant the exception" - just moved from a
-- config parameter to a temp relation. Not exploitable TODAY only because
-- the application roles hold zero UPDATE grant on every append-only table
-- (blocked earlier at 42501) - exactly the narrow future scenario (a
-- column-restricted UPDATE grant on an append-only table) the temp-table
-- design's own comment claimed to be defending, and was not.
--
-- The mechanism actually used: hci.reject_update_delete() authorizes an
-- UPDATE by what it DOES, not by any session-local marker a role could
-- plant. It computes `to_jsonb(OLD)` and `to_jsonb(NEW)`, and lets the
-- UPDATE through only when ALL of: (a) `system_superseded_at` moved from
-- NULL to NOT NULL, (b) every OTHER column is byte-identical between OLD and
-- NEW (`(o - 'system_superseded_at') = (n - 'system_superseded_at')` on the
-- jsonb-minus-key form), and (c) `current_user` is a member of the table's
-- owning role (`pg_has_role(current_user, relowner, 'MEMBER')`). There is no
-- carrier for a forged bypass here - nothing is planted, checked, or trusted
-- across statements; the decision is made entirely from the one UPDATE
-- statement's own OLD/NEW rows and the actual role executing it. This also
-- means mark_superseded() no longer needs a lock table, DISABLE TRIGGER, or
-- any escape-hatch scaffolding at all - it performs its UPDATE directly, and
-- reject_update_delete() recognizes the shape of a legitimate supersession
-- write regardless of which SECURITY DEFINER function produced it.
--
-- This does NOT defend against a genuinely compromised owner-level
-- connection that crafts an UPDATE matching this exact shape directly - but
-- neither does any existing append-only trigger in this schema defend
-- against a deliberately malicious owner-level connection (the established
-- "owner bypass" tests, e.g. APPEND-ONLY-TRIGGER-01..04, prove the trigger
-- blocks a NORMAL UPDATE/DELETE statement from an owner-level connection,
-- not one that constructs a statement designed to exploit the rule on
-- purpose). That deeper threat model is audit-logging territory (pgaudit,
-- ADR-0025), not a single trigger's job - this design does not weaken the
-- schema's existing security posture, it is consistent with it, and unlike
-- the temp-table design it has no side channel to strengthen later.
--
-- ADR-0018 (crypto-shredding, tombstoned_at) already anticipates reusing
-- "the same single-purpose, SECURITY DEFINER, function-owned exception
-- ADR-0017 used for system_superseded_at" (ADR-0018:14) - the shape here is
-- specific to `system_superseded_at`, so that future migration needs its own
-- shape clause (`tombstoned_at` NULL -> NOT NULL, nothing else changed) in
-- the same function, not a copy of this file's rejected designs.
-- ============================================================================

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
    'tenants','app_tenant_bindings','cases','source_snapshots','source_relationships'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0005; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- ============================================================================
-- Gate 1: bitemporal columns on hci.subject_records (Evidence/Claim/
-- Assessment; TRUST_DOMAIN inherits them physically per the ADR's escape
-- clause since the table is still polymorphic - the semantic contract is
-- claimed only for the three kinds plus hci.decisions below).
-- ============================================================================
-- system_recorded_at/system_superseded_at use clock_timestamp() (real wall-
-- clock at evaluation time), not now() (frozen at transaction START) - a
-- db-expert review (2026-09-05) found now() lets a long-running transaction
-- backdate its row's ledger time to before it even began relative to OTHER
-- committed transactions, and independently produces a false 23514 under
-- real concurrency (a longer-running transaction's successor row can get an
-- EARLIER system_recorded_at than an already-committed predecessor's, then
-- fail subject_records_superseded_after_recorded when mark_superseded()
-- tries to set the predecessor's system_superseded_at to that earlier time).
-- valid_from/valid_to are a different axis (the application's claim about
-- real-world applicability, not the ledger's own clock) and correctly stay
-- application-writable via the INSERT grant below - only the two system-time
-- columns needed this fix.
--
-- UNIQUE (tenant_id, supersedes_id), not UNIQUE (supersedes_id) alone (same
-- review): a bare UNIQUE(supersedes_id) lets a DIFFERENT tenant's INSERT
-- attempt use the constraint as a cross-tenant existence/state oracle - the
-- unique index is checked before the composite FK trigger runs and is not
-- subject to RLS, so a foreign tenant guessing another tenant's row id would
-- learn "already superseded" (23505) vs "not yet superseded" (23503) purely
-- from which error comes back, despite RLS hiding the row itself. The
-- composite FK already requires supersedes_id to belong to the SAME tenant,
-- so tying the UNIQUE to (tenant_id, supersedes_id) closes the oracle
-- without weakening the no-fork guarantee for legitimate same-tenant rows.
--
-- corrected_reason gets both a non-blank check (matching every other
-- evidentiary free-text column in this schema - 0001:66-68's own stated
-- lesson: "blank is not evidence") and a bidirectional pairing with
-- supersedes_id (not just one-directional "reason required when
-- superseding" - a reason with no supersedes_id is equally meaningless).
--
-- clock_timestamp() is volatile, so on a POPULATED table this ADD COLUMN
-- would take ACCESS EXCLUSIVE for a full table rewrite (PG11+'s constant-
-- default fast path does not apply to non-constant defaults) - harmless here
-- only because subject_records is empty at every point this migration runs
-- (synthetic-only, pre-fixtures). Not a shape to copy onto a populated
-- deployment without the Expand/Contract discipline ADR-0017:141 already
-- requires for a later change to this scope.
ALTER TABLE hci.subject_records
  ADD COLUMN valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN valid_to timestamptz,
  ADD COLUMN system_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN system_superseded_at timestamptz,
  ADD COLUMN supersedes_id uuid,
  ADD COLUMN corrected_reason text,
  ADD CONSTRAINT subject_records_valid_window CHECK (valid_to IS NULL OR valid_to > valid_from),
  ADD CONSTRAINT subject_records_superseded_after_recorded CHECK (system_superseded_at IS NULL OR system_superseded_at >= system_recorded_at),
  ADD CONSTRAINT subject_records_reason_paired CHECK ((supersedes_id IS NULL) = (corrected_reason IS NULL)),
  ADD CONSTRAINT subject_records_reason_nonblank CHECK (corrected_reason IS NULL OR length(btrim(corrected_reason)) > 0),
  ADD CONSTRAINT subject_records_supersedes_fk FOREIGN KEY (tenant_id, supersedes_id) REFERENCES hci.subject_records(tenant_id, id),
  ADD CONSTRAINT subject_records_supersedes_unique UNIQUE (tenant_id, supersedes_id);

-- system_recorded_at is server-assigned only, same rule and same mechanism as
-- data_subject_request_events.created_at (0001:340-344) and
-- source_snapshots.retrieved_at (0004): the ledger's own clock must not be
-- something the audited party can choose. subject_records was previously
-- covered by a TABLE-level INSERT grant (0001's append_only loop), so this
-- REVOKE+narrow-GRANT is required now - the table-level grant would otherwise
-- silently extend to every new column, including this one.
REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id, valid_from, valid_to, supersedes_id, corrected_reason)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

-- ============================================================================
-- Gate 1: hci.decisions - new table, same bitemporal shape. Outcome enum
-- copied verbatim from 04_HCI30_PRODUCT_SPEC.md's Decision output values
-- (PROCEED/PROCEED_WITH_CONTROLS/LIMIT_ACCESS/PAUSE/REVIEW_REQUIRED/EXIT;
-- that document is explicit that GOOD_PERSON/BAD_PERSON-style verdicts are
-- never a valid output). Deliberately minimal: this ADR only requires the
-- table to EXIST with the bitemporal shape (gate 1) so mark_superseded() has
-- a second real consumer (gate 2) - full Decision workflow semantics (a
-- bias-check precondition, requester binding beyond case_id, etc.) belong to
-- whichever ADR resolves HD-19/HD-21, not this one; not built here, not
-- faked with placeholder columns nobody asked for.
-- ============================================================================
CREATE TABLE hci.decisions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  case_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('PROCEED','PROCEED_WITH_CONTROLS','LIMIT_ACCESS','PAUSE','REVIEW_REQUIRED','EXIT')),
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  system_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  system_superseded_at timestamptz,
  supersedes_id uuid,
  corrected_reason text,
  CONSTRAINT decisions_valid_window CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT decisions_superseded_after_recorded CHECK (system_superseded_at IS NULL OR system_superseded_at >= system_recorded_at),
  CONSTRAINT decisions_reason_paired CHECK ((supersedes_id IS NULL) = (corrected_reason IS NULL)),
  CONSTRAINT decisions_reason_nonblank CHECK (corrected_reason IS NULL OR length(btrim(corrected_reason)) > 0),
  FOREIGN KEY (tenant_id, case_id) REFERENCES hci.cases(tenant_id, id),
  CONSTRAINT decisions_supersedes_fk FOREIGN KEY (tenant_id, supersedes_id) REFERENCES hci.decisions(tenant_id, id),
  UNIQUE (tenant_id, id),
  CONSTRAINT decisions_supersedes_unique UNIQUE (tenant_id, supersedes_id)
);

-- Append-only wiring by hand (0001's declarative loop already ran and cannot
-- retroactively adopt a table created in a later migration - same reason
-- 0002/0004 wire hci.cases/hci.source_snapshots/hci.source_relationships this
-- way). system_recorded_at withheld from INSERT, matching subject_records
-- above.
GRANT SELECT ON hci.decisions TO hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, case_id, outcome, rationale, valid_from, valid_to, supersedes_id, corrected_reason)
  ON hci.decisions TO hci_app_test_a, hci_app_test_b;
REVOKE UPDATE, DELETE ON hci.decisions FROM hci_app_test_a, hci_app_test_b;
CREATE TRIGGER decisions_append_only BEFORE UPDATE OR DELETE ON hci.decisions FOR EACH ROW EXECUTE FUNCTION hci.reject_update_delete();
CREATE TRIGGER decisions_no_truncate BEFORE TRUNCATE ON hci.decisions FOR EACH STATEMENT EXECUTE FUNCTION hci.reject_update_delete();
CREATE INDEX decisions_tenant_idx ON hci.decisions (tenant_id);
CREATE INDEX decisions_case_idx ON hci.decisions (tenant_id, case_id);
-- decisions_tenant_idx's leading (tenant_id) column makes it a strict prefix
-- of decisions_case_idx immediately above - kept anyway (db-expert review:
-- redundant, not wrong) so a future migration that drops case_id's own
-- index in isolation does not silently remove tenant-scoped lookup too.
-- The _current/_as_of predicates below have no index support on synthetic-
-- scale data; both partial indexes target exactly those predicates.
CREATE INDEX subject_records_current_idx ON hci.subject_records (tenant_id, kind) WHERE system_superseded_at IS NULL;
CREATE INDEX subject_records_recorded_at_idx ON hci.subject_records (tenant_id, system_recorded_at);
CREATE INDEX decisions_current_idx ON hci.decisions (tenant_id) WHERE system_superseded_at IS NULL;
CREATE INDEX decisions_recorded_at_idx ON hci.decisions (tenant_id, system_recorded_at);
ALTER TABLE hci.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hci.decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hci.decisions USING (tenant_id = hci.current_tenant_id()) WITH CHECK (tenant_id = hci.current_tenant_id());

-- ============================================================================
-- Gate 2: hci.reject_update_delete() extension (effect-based, see file
-- header for the three rejected designs) + hci.mark_superseded(). Every
-- other append-only/no-delete table in this schema (cases,
-- data_subject_requests, data_subject_request_events,
-- data_subject_request_targets, source_snapshots, source_relationships) is
-- unaffected: none of them have a `system_superseded_at` column, so `o ?
-- 'system_superseded_at'` is false for every one of their UPDATE attempts,
-- and they fall straight through to the unconditional RAISE exactly as
-- 0001 defined it.
-- ============================================================================
CREATE OR REPLACE FUNCTION hci.reject_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o jsonb; n jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    n := to_jsonb(NEW);
    -- (a) this table has the column at all; (b) it moved NULL -> NOT NULL;
    -- (c) nothing else on the row changed (jsonb-minus-key comparison, order
    -- independent since jsonb normalizes key order internally); (d) the
    -- executing role can act as the table owner. All four together are the
    -- exact and only shape hci.mark_superseded()'s own UPDATE produces -
    -- there is no separate flag or side-table to plant, so there is nothing
    -- for the application role to forge.
    IF o ? 'system_superseded_at'
       AND o->>'system_superseded_at' IS NULL
       AND n->>'system_superseded_at' IS NOT NULL
       AND (o - 'system_superseded_at') = (n - 'system_superseded_at')
       AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), 'MEMBER')
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'H1003',
    MESSAGE = format('%s.%s is append-only (%s rejected)', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP);
END $$;

-- One generic function, reused by both bitemporal tables (mirrors
-- hci.reject_tenant_change() already being generic across many tables via
-- TG_TABLE_NAME, rather than writing two near-identical copies that could
-- drift). TG_TABLE_SCHEMA/TG_TABLE_NAME come from the firing trigger's own
-- definition, never from caller input, so the dynamic SQL below has no
-- injection surface; %I quotes every identifier regardless. SECURITY DEFINER
-- is still required - it is what lets this UPDATE reach the predecessor row
-- at all, since the application roles hold zero UPDATE grant on either
-- table (0001's append_only category, unchanged) - but a SECURITY DEFINER
-- function is PUBLIC-executable by default, so EXECUTE is revoked below
-- immediately after creation (matching hci.current_tenant_id()'s own
-- existing pattern, 0001:289 - this migration's original draft missed it,
-- caught by db-expert review before commit).
CREATE FUNCTION hci.mark_superseded() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hci, pg_temp AS $$
DECLARE
  v_rows int;
BEGIN
  IF NEW.supersedes_id IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format(
    'UPDATE %I.%I SET system_superseded_at = $1 WHERE tenant_id = $2 AND id = $3 AND system_superseded_at IS NULL',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
  ) USING NEW.system_recorded_at, NEW.tenant_id, NEW.supersedes_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Reachable only when the composite FK above has already proven
  -- supersedes_id names a real row in this tenant (the FK fires before this
  -- AFTER INSERT trigger even runs) - so zero rows matched here means
  -- specifically "that row's system_superseded_at was already non-NULL", not
  -- "the row doesn't exist" or "wrong tenant". No forks: a row already
  -- superseded cannot be superseded again. In practice
  -- subject_records_supersedes_unique/decisions_supersedes_unique (gate 1's
  -- UNIQUE(tenant_id, supersedes_id)) reject a second attempt at 23505
  -- before this trigger ever runs, so this branch is defense-in-depth for a
  -- schema where that UNIQUE constraint were ever weakened, not the primary
  -- path - see BITEMP-SUPERSEDE-02's own comment in the test file for the
  -- real-Docker discovery this documents.
  IF v_rows = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'H1008', MESSAGE = 'predecessor record is already superseded';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION hci.mark_superseded() FROM PUBLIC;

CREATE TRIGGER subject_records_mark_superseded AFTER INSERT ON hci.subject_records
  FOR EACH ROW WHEN (NEW.supersedes_id IS NOT NULL) EXECUTE FUNCTION hci.mark_superseded();
CREATE TRIGGER decisions_mark_superseded AFTER INSERT ON hci.decisions
  FOR EACH ROW WHEN (NEW.supersedes_id IS NOT NULL) EXECUTE FUNCTION hci.mark_superseded();

-- ============================================================================
-- Gate 3: canonical reads. security_invoker=true (PG15+) so RLS is evaluated
-- as the QUERYING role, not the view owner - without it, a view owned by
-- hci_owner would either bypass tenant isolation or resolve
-- current_tenant_id() against the owner's own (nonexistent) binding,
-- silently breaking every _current read. BITEMP-VIEWRLS-01 (added after a
-- db-expert review found the suite never actually exercised hci_app_test_b
-- against these views, nor would dropping security_invoker have failed
-- anything) real-Docker-proves this specifically, not just BITEMP-ASOF-01's
-- own-tenant assertions.
--
-- Explicit column lists, not SELECT * (db-expert review, 2026-09-05): a view
-- freezes its own output column list at CREATE time, while a SQL function's
-- SETOF-a-table-type return automatically tracks the table's row type as
-- columns are added later (e.g. ADR-0018's tombstoned_at) - SELECT * would
-- have let the four _as_of() functions silently pick up a new column while
-- the four _current views silently did not, splitting one "canonical read"
-- into two column sets with no error to catch it. Explicit lists make a
-- future column addition a decision made in both places, symmetrically, or
-- neither.
-- ============================================================================
CREATE VIEW hci.evidence_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records WHERE kind = 'EVIDENCE' AND system_superseded_at IS NULL;
CREATE VIEW hci.claims_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records WHERE kind = 'CLAIM' AND system_superseded_at IS NULL;
CREATE VIEW hci.assessments_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records WHERE kind = 'ASSESSMENT' AND system_superseded_at IS NULL;
CREATE VIEW hci.decisions_current WITH (security_invoker = true) AS
  SELECT id, tenant_id, case_id, outcome, rationale,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.decisions WHERE system_superseded_at IS NULL;

GRANT SELECT ON hci.evidence_current, hci.claims_current, hci.assessments_current, hci.decisions_current
  TO hci_app_test_a, hci_app_test_b;

-- The as-of filter is defined once per table, here, deliberately: any future
-- application code that re-implements this predicate instead of calling
-- these functions is a defect per ADR-0017's Consequences section, not a
-- convenience. Valid-time (valid_from/valid_to) is NOT folded into these -
-- the ADR requires the caller apply that predicate separately. RETURNS
-- TABLE(...) with the same explicit column list as the views above, not
-- SETOF hci.subject_records - see the explicit-column-list note above.
CREATE FUNCTION hci.evidence_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records
   WHERE kind = 'EVIDENCE' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
CREATE FUNCTION hci.claims_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records
   WHERE kind = 'CLAIM' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
CREATE FUNCTION hci.assessments_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, person_id uuid, subject_type text, subject_id uuid, kind text, case_id uuid,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.subject_records
   WHERE kind = 'ASSESSMENT' AND system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;
CREATE FUNCTION hci.decisions_as_of(p_t timestamptz) RETURNS TABLE (
  id uuid, tenant_id uuid, case_id uuid, outcome text, rationale text,
  valid_from timestamptz, valid_to timestamptz, system_recorded_at timestamptz, system_superseded_at timestamptz,
  supersedes_id uuid, corrected_reason text
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = hci, pg_temp AS $$
  SELECT id, tenant_id, case_id, outcome, rationale,
         valid_from, valid_to, system_recorded_at, system_superseded_at, supersedes_id, corrected_reason
  FROM hci.decisions
   WHERE system_recorded_at <= p_t AND (system_superseded_at IS NULL OR system_superseded_at > p_t)
$$;

-- SECURITY INVOKER functions default to PUBLIC-executable too; RLS on the
-- underlying tables means this was never an actual data leak (db-expert
-- review confirmed), but REVOKE-then-GRANT matches this schema's existing
-- convention (0001:289) instead of leaving it as a silent default.
REVOKE ALL ON FUNCTION hci.evidence_as_of(timestamptz), hci.claims_as_of(timestamptz),
  hci.assessments_as_of(timestamptz), hci.decisions_as_of(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.evidence_as_of(timestamptz), hci.claims_as_of(timestamptz),
  hci.assessments_as_of(timestamptz), hci.decisions_as_of(timestamptz) TO hci_app_test_a, hci_app_test_b;

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
    RAISE EXCEPTION 'hci table inventory drift after 0005; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

COMMIT;
