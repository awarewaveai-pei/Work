-- Reverses 0005_wave1_bitemporal_history_up.sql only. Does not touch 0001's,
-- 0002's, 0003's, or 0004's tables/roles/schema. Safe to run against a schema
-- where those four are still applied and 0005 is being rolled back
-- independently.
--
-- Not currently exercised by test-wave1-local.ps1's reversibility pass -
-- 0001_wave1_synthetic_down.sql (DROP SCHEMA hci CASCADE) already tears down
-- everything 0002/0003/0004/0005 add along with everything 0001 adds, in one
-- step, because all five live in the same schema. This file's own narrow-
-- rollback path was real-Docker-run independently before commit (2026-09-05,
-- db-expert review) after the review found it would not even complete: the
-- original version dropped hci.mark_superseded() before dropping
-- subject_records_mark_superseded, the trigger that depends on it
-- (PostgreSQL 2BP01, "other objects depend on it" - DROP FUNCTION has no
-- CASCADE here on purpose, so the dependent trigger must be dropped first,
-- explicitly, not papered over).
--
-- Per ADR-0017's own rollback note: "may drop empty bitemporal columns but
-- must not rewrite system_recorded_at on rows that carry data" - the guard
-- below makes that a checked precondition, not merely a comment.
BEGIN;
SET LOCAL lock_timeout = '3s';
-- M3 class fix (db-expert review of migration 0011, 2026-09-05): both tables
-- this guard reads are FORCE ROW LEVEL SECURITY (0001:343-345). Under a
-- non-superuser owner (the real production shape - this test container's
-- hci_owner is a superuser, so the gap never surfaced locally), the guard's
-- SELECTs would silently match zero rows instead of erroring, and this
-- migration would drop populated bitemporal history with no warning. Same
-- fix 0009 (M4) already applied to every SECURITY DEFINER function in this
-- schema, applied here to the down-migration's DO block, which needed it
-- too - this file's own guard was the original template M3 traced the class
-- back to.
SET LOCAL row_security = off;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM hci.subject_records
     WHERE supersedes_id IS NOT NULL OR system_superseded_at IS NOT NULL
  ) OR EXISTS (SELECT 1 FROM hci.decisions) THEN
    RAISE EXCEPTION 'refusing to drop populated bitemporal history (ADR-0017 rollback note); this down migration is the empty-schema case only';
  END IF;
END $$;

DROP VIEW IF EXISTS hci.decisions_current;
DROP VIEW IF EXISTS hci.assessments_current;
DROP VIEW IF EXISTS hci.claims_current;
DROP VIEW IF EXISTS hci.evidence_current;
DROP FUNCTION IF EXISTS hci.decisions_as_of(timestamptz);
DROP FUNCTION IF EXISTS hci.assessments_as_of(timestamptz);
DROP FUNCTION IF EXISTS hci.claims_as_of(timestamptz);
DROP FUNCTION IF EXISTS hci.evidence_as_of(timestamptz);

-- Triggers before the function/table they depend on (see header). decisions'
-- own trigger goes away automatically with DROP TABLE, but subject_records
-- is not being dropped, so its trigger must be dropped explicitly first.
DROP TRIGGER IF EXISTS subject_records_mark_superseded ON hci.subject_records;
DROP TABLE IF EXISTS hci.decisions;
DROP FUNCTION IF EXISTS hci.mark_superseded();

-- Restore hci.reject_update_delete() to exactly 0001's original body
-- (0001_wave1_synthetic_up.sql:188-192). Without this, a rolled-back schema
-- keeps 0005's effect-based exception clause wired into a function that no
-- longer has any legitimate caller (mark_superseded() is gone) on all eight
-- tables that share this function, not just the two 0005 touched.
CREATE OR REPLACE FUNCTION hci.reject_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'H1003',
    MESSAGE = format('%s.%s is append-only (%s rejected)', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP);
END $$;

ALTER TABLE hci.subject_records
  DROP CONSTRAINT IF EXISTS subject_records_supersedes_unique,
  DROP CONSTRAINT IF EXISTS subject_records_supersedes_fk,
  DROP CONSTRAINT IF EXISTS subject_records_reason_nonblank,
  DROP CONSTRAINT IF EXISTS subject_records_reason_paired,
  DROP CONSTRAINT IF EXISTS subject_records_superseded_after_recorded,
  DROP CONSTRAINT IF EXISTS subject_records_valid_window,
  DROP COLUMN IF EXISTS corrected_reason,
  DROP COLUMN IF EXISTS supersedes_id,
  DROP COLUMN IF EXISTS system_superseded_at,
  DROP COLUMN IF EXISTS system_recorded_at,
  DROP COLUMN IF EXISTS valid_to,
  DROP COLUMN IF EXISTS valid_from;

-- Restore the pre-0005 INSERT grant (0001's original append_only-loop shape:
-- table-level, no column restriction) so a narrower rollback that keeps 0001-
-- 0004 applied leaves subject_records exactly as 0004 left it.
REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

COMMIT;
