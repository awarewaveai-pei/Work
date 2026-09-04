-- Reverses 0003_wave1_regulatory_market_scope_up.sql only. Does not touch
-- 0001's or 0002's tables/roles/schema. Safe to run against a schema where
-- 0001+0002 are still applied and 0003 is being rolled back independently.
--
-- Not currently exercised by test-wave1-local.ps1's reversibility pass -
-- 0001_wave1_synthetic_down.sql (DROP SCHEMA hci CASCADE) already tears down
-- everything 0002/0003 add along with everything 0001 adds, in one step,
-- because all three live in the same schema.
--
-- NOT VALUE-PRESERVING for jurisdiction (2026-09-05, db-expert review):
-- DROP COLUMN jurisdiction destroys every tenant's stored jurisdiction value.
-- Re-applying 0003_up afterward resets every tenant to the DEFAULT 'US', not
-- to whatever it held before rollback. Correct and accepted for synthetic
-- Wave 1 (no real tenant data exists to lose); a rollback of this migration
-- against any environment with real jurisdiction data would need a
-- preserve-then-restore step this file does not provide.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- 2026-09-05 db-expert review, corrected twice in the same session by real
-- Docker runs (not by reasoning alone - see the two attempts below):
--
-- Attempt 1 used 'hci'::regnamespace, which raises 3F000 ("schema \"hci\"
-- does not exist") if the schema is already gone - exactly the scenario this
-- file's own header above says it must tolerate (running after
-- 0001_wave1_synthetic_down.sql's DROP SCHEMA).
--
-- Attempt 2 switched to to_regclass('hci.cases') IS NOT NULL AND NOT EXISTS
-- (... 'hci.cases'::regclass ...) as a SINGLE SQL boolean expression, on the
-- assumption that AND would short-circuit and never reach the regclass cast
-- inside the EXISTS subquery once the schema was confirmed missing. A real
-- run against a dropped schema proved that assumption false: PostgreSQL does
-- not guarantee left-to-right short-circuit evaluation across a SQL AND when
-- one operand is a subquery - the 'hci.cases'::regclass cast inside the
-- EXISTS clause was still resolved and still raised the same 3F000, from a
-- LINE deep inside the subquery.
--
-- This (attempt 3) nests two separate PL/pgSQL IF statements instead of one
-- combined SQL boolean expression: the inner block - the only place
-- containing the regclass cast - is a distinct statement that only executes
-- (and is only planned) once control has actually entered the outer IF's
-- THEN branch, which PL/pgSQL's own control flow guarantees in a way a
-- single SQL expression's operand ordering does not.
--
-- The NOT EXISTS guard (both attempts) makes this block idempotent:
-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS, so without it a second run
-- of this file against a schema that was never re-migrated would fail with
-- 42710 (constraint already exists) instead of completing as a no-op like
-- every other statement in this file.
DO $$
BEGIN
  IF to_regclass('hci.cases') IS NOT NULL THEN
    IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conrelid = 'hci.cases'::regclass AND conname = 'cases_purpose_check'
       ) THEN
      ALTER TABLE hci.cases ADD CONSTRAINT cases_purpose_check CHECK (length(btrim(purpose)) > 0);
    END IF;
  END IF;
END $$;
ALTER TABLE IF EXISTS hci.cases DROP CONSTRAINT IF EXISTS cases_purpose_allowlist;

ALTER TABLE IF EXISTS hci.tenants DROP CONSTRAINT IF EXISTS tenants_jurisdiction_denylist;
ALTER TABLE IF EXISTS hci.tenants DROP COLUMN IF EXISTS jurisdiction;

COMMIT;
