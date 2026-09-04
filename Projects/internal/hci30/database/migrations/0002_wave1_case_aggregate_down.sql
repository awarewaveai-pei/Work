-- Reverses 0002_wave1_case_aggregate_up.sql only. Does not touch 0001's
-- tables/roles/schema. Safe to run against a schema where 0001 is still
-- applied and 0002 is being rolled back independently.
--
-- Not currently exercised by test-wave1-local.ps1's reversibility pass -
-- 0001_wave1_synthetic_down.sql (DROP SCHEMA hci CASCADE) already tears down
-- everything 0002 adds along with everything 0001 adds, in one step, because
-- both live in the same schema. This file exists for the narrower case: a
-- reviewed rollback of 0002 alone, per ADR-0020's own rollback section.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP TRIGGER IF EXISTS subject_records_require_open_or_active_case ON hci.subject_records;
DROP TRIGGER IF EXISTS research_workflows_require_open_or_active_case ON hci.research_workflows;
DROP FUNCTION IF EXISTS hci.require_open_or_active_case();

DROP TRIGGER IF EXISTS research_workflows_case_immutable ON hci.research_workflows;
DROP FUNCTION IF EXISTS hci.reject_case_reassignment();

-- IF EXISTS on the table itself (2026-09-04, db-expert review, verified
-- against a real PG 15.8 probe): every other statement in this file already
-- tolerates a missing object, but plain ALTER TABLE does not tolerate a
-- missing TABLE - re-running this file after 0001_wave1_synthetic_down.sql
-- has already dropped the whole hci schema would otherwise abort here
-- (ERROR: schema "hci" does not exist) instead of completing as a no-op like
-- every DROP ... IF EXISTS above it.
ALTER TABLE IF EXISTS hci.subject_records DROP COLUMN IF EXISTS case_id;
ALTER TABLE IF EXISTS hci.research_workflows DROP COLUMN IF EXISTS case_id;

DROP TABLE IF EXISTS hci.cases;
DROP FUNCTION IF EXISTS hci.enforce_case_lifecycle();

COMMIT;
