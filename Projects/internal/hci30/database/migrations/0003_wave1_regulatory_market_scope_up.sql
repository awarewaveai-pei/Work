-- HCI-30 Wave 1 - Regulatory market scope (ADR-0012, HD-20).
--
-- Extends 0001_wave1_synthetic_up.sql + 0002_wave1_case_aggregate_up.sql.
-- Must run after both, in the same database, before the fixtures/harness/
-- negative-test files.
--
-- ============================================================================
-- Re-anchoring note (ADR-0012 gate 2, followed as written): ADR-0012 was
-- filed before hci.cases existed and explicitly anchored its purpose
-- allow-list on hci.tenant_authorizations as an interim measure, with its own
-- instruction to re-anchor onto Case once built: "when ADR-0020's gate 1
-- lands hci.cases as real schema, this gate must be re-anchored onto the
-- Case/Engagement aggregate in the same migration, not left orphaned here"
-- (ADR-0012:36). hci.cases landed in 0002 (this repo, 2026-09-05) with its
-- own 'purpose' column, which is exactly the field ADR-0012's regulatory
-- allow-list belongs on - not a second, parallel purpose field on
-- tenant_authorizations. This migration narrows hci.cases.purpose's existing
-- free-text CHECK to the named allow-list instead of adding a new column
-- elsewhere.
-- ============================================================================
--
-- Gate 3 (H1012 trigger) deliberately NOT implemented as a trigger - see the
-- "Gate 3 disposition" comment further down for the real-Docker-verified
-- reasoning (a CHECK constraint has no bypass path a defense-in-depth
-- trigger could catch that the CHECK itself does not already catch).
-- ============================================================================
--
-- 2026-09-05 db-expert review (post-first-draft, before commit) found this
-- migration's mechanics sound but its GATE CONTENT had a real hole and its
-- rollback file was not re-runnable - both fixed in this version:
--   - Gate 1's deny-list denied 'GB' but not 'UK' (the more common free-text
--     spelling), and was missing 'CH' (EFTA/Switzerland) and 'EL' (the EU's
--     own nomenclature for Greece), despite this header claiming "UK/EFTA"
--     coverage. The regex was copied verbatim from ADR-0012 gate 1, which has
--     the same gap - both are corrected together (see the ADR's own
--     "Implementation note" section, added in the same batch as this fix).
--   - Switched from a regex alternation to upper(btrim(...)) NOT IN (...):
--     strictly more auditable (diffable against ISO-3166 line by line) and
--     closes a normalization gap the regex form had (regex denied 'de' via
--     case-insensitive matching, but never guarded whitespace, e.g. 'FR ').
--   - The DO block resolving hci.cases' existing purpose CHECK now uses
--     SELECT ... INTO STRICT: the original (bare SELECT INTO) would silently
--     drop an arbitrary match and leave any other match in place if a future
--     CHECK's definition text also happened to contain the substring
--     'btrim(purpose)' - STRICT converts that into a loud NO_DATA_FOUND/
--     TOO_MANY_ROWS error inside the transaction instead.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

-- Table-inventory drift check moved to immediately after BEGIN (2026-09-05
-- db-expert review): this migration adds no tables, so the check's outcome
-- cannot depend on anything below it running first - running it here instead
-- of at the end takes no lock on hci.tenants/hci.cases and fails fast before
-- this transaction acquires any lock at all, rather than extending the lock
-- window those tables' DDL below opens.
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
    RAISE EXCEPTION 'hci table inventory drift before 0003; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- ============================================================================
-- Gate 1: hci.tenants.jurisdiction (ADR-0012:35, corrected per this file's
-- header). Deny-list of EU/EEA/UK/EFTA country codes (plus the EU's own 'EL'
-- spelling for Greece), normalized via upper(btrim(...)) so case and
-- surrounding whitespace cannot slip a denied value through. 'EU'/'EEA' are
-- bloc identifiers, not ISO-3166 country codes - included so neither can ever
-- be stored as a literal jurisdiction value, not because they are codes.
--
-- DEFAULT 'US' is safe on this empty synthetic table (same "empty table, not
-- a backfill concern" reasoning as 0002 - see that file's header for what
-- actually makes ADD COLUMN ... NOT NULL safe here, and why this does not
-- generalize to a populated table). Confirmed by a real PG 15.8 probe
-- (2026-09-05, 200k-row table): ADD COLUMN ... DEFAULT alone takes ~2ms and
-- does not change relfilenode (PG 11+ fast default, metadata-only); adding
-- the CHECK in the same statement raises that to ~30ms with relfilenode still
-- unchanged - i.e. no table rewrite, but the CHECK forces a full validating
-- sequential scan the DEFAULT alone does not. On this migration's actual
-- (empty) target this is unmeasurable; on a populated table the split
-- documented in 0002's header (nullable column, backfill, NOT VALID
-- constraint, then VALIDATE CONSTRAINT under a weaker lock) is what avoids
-- this scan, not this migration's shape.
--
-- Named explicitly (tenants_jurisdiction_denylist) rather than left to
-- PostgreSQL's auto-generated name: scripts/mutation-check-wave1.ps1 needs a
-- stable name to target, the same reason gate 2's constraint below is named
-- rather than auto-generated.
-- ============================================================================
ALTER TABLE hci.tenants ADD COLUMN jurisdiction text NOT NULL DEFAULT 'US';
ALTER TABLE hci.tenants ADD CONSTRAINT tenants_jurisdiction_denylist CHECK (
  upper(btrim(jurisdiction)) NOT IN (
    'EU','EEA','GB','UK','CH',
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','EL','HU','IE','IT',
    'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
    'IS','LI','NO'
  )
);

-- ============================================================================
-- Gate 2: hci.cases.purpose allow-list (ADR-0012:36, re-anchored per the note
-- above). Exactly the 5 values ADR-0012 names by literal text; the ADR's own
-- "..." is not additional named values - inventing more here would be
-- deciding scope the ADR itself left to a future governance action, not
-- implementing what was actually decided.
--
-- Constraint name resolved from the catalog (the pattern this file's own
-- test suite already uses for this exact purpose, e.g. 'drop-typed-target-fk'
-- and 'drop-case-ownership-fk' in scripts/mutation-check-wave1.ps1) rather
-- than hardcoded: a bare column-level CHECK gets an auto-generated name, and
-- relying on the specific auto-generated string would be fragile if
-- PostgreSQL's naming convention ever changed. SELECT ... INTO STRICT (not a
-- bare SELECT INTO): see this file's header for why.
-- ============================================================================
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO STRICT c FROM pg_constraint
   WHERE conrelid = 'hci.cases'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%btrim(purpose)%';
  EXECUTE format('ALTER TABLE hci.cases DROP CONSTRAINT %I', c);
END $$;
ALTER TABLE hci.cases ADD CONSTRAINT cases_purpose_allowlist CHECK (
  purpose IN ('vendor_risk_assessment','fraud_investigation','personal_safety',
              'journalism_research','general_due_diligence')
);

-- ============================================================================
-- Gate 3 disposition: no H1012 trigger. ADR-0012:37 asked for a trigger on
-- hci.research_workflows re-checking the joined tenant.jurisdiction and
-- (originally) tenant_authorization.purpose at workflow-start, "defense-in-
-- depth against a bulk-insert path bypassing gates 1-2." That reasoning was
-- written for the pre-Case design, where purpose would have lived on a
-- separate table (tenant_authorizations) from the one research_workflows
-- directly binds to.
--
-- Under the as-built, Case-anchored design this migration implements, no
-- such bypass path exists to defend against: gates 1 and 2 are plain CHECK
-- constraints on hci.tenants and hci.cases respectively, and a CHECK
-- constraint is validated unconditionally on every write to its own table -
-- there is no PostgreSQL insert path (single-row, COPY, or otherwise) that
-- skips it. hci.research_workflows can only ever reference a tenant_id and
-- case_id that already exist, and by the time either row exists it has
-- already satisfied its own CHECK. There is nothing left for a re-check at
-- research_workflows' INSERT boundary to catch that the CHECK constraints
-- have not already caught at the moment the referenced row was created.
--
-- Real-Docker evidence for this claim (2026-09-05, corrected after
-- db-expert review caught the first version's evidence citation not
-- matching what its own test does): REG-NEG-09 proves the CHECK binds even a
-- connection whose privileges bypass every grant (the owner) - the class of
-- bypass 0002's cases_no_delete/cases_no_truncate triggers exist specifically
-- to defend against for DELETE/TRUNCATE, and which a CHECK constraint needs
-- no equivalent trigger for, because CHECK constraints (unlike GRANTs) bind
-- the table owner already. REG-NEG-10 proves the specific bulk-insert-style
-- path this gate's original design worried about: attempting a
-- research_workflows insert against a tenant that does not (and, per gate 1,
-- cannot) exist with an excluded jurisdiction. Together they cover both
-- halves of the "defense-in-depth against a bypass" claim gate 3 was
-- originally written to address.
--
-- H1012 is therefore reserved in the registry below but never raised by this
-- schema: recording it as available-but-unused is more honest than silently
-- dropping the planned code, and keeps the number reserved against a future
-- migration that might have an actual use for a distinct SQLSTATE here.
-- REG-NEG-01..08 all expect 23514 (check_violation), not H1012 - matching
-- what the database actually raises for a CHECK constraint, not what an ADR
-- written before this design existed anticipated.
-- ============================================================================
--   H1012  (reserved, not raised) - excluded jurisdiction or purpose; see
--          "Gate 3 disposition" above for why no trigger raises this today.
--
-- 2026-09-05: the growing SSOT for this whole list is now
-- database/ERROR_CODE_REGISTRY.md - allocate the next code there, not by
-- computing "next free" from this or any other migration's header comment
-- (the practice that produced the two real H1008/H1009 collisions both
-- ADR-0012 and ADR-0020 had to record and renumber around).

COMMIT;
