-- Reverses 0004_wave1_source_provenance_up.sql only. Does not touch 0001's,
-- 0002's, or 0003's tables/roles/schema. Safe to run against a schema where
-- those three are still applied and 0004 is being rolled back independently.
--
-- Not currently exercised by test-wave1-local.ps1's reversibility pass -
-- 0001_wave1_synthetic_down.sql (DROP SCHEMA hci CASCADE) already tears down
-- everything 0002/0003/0004 add along with everything 0001 adds, in one
-- step, because all four live in the same schema.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP TABLE IF EXISTS hci.source_relationships;
DROP TABLE IF EXISTS hci.source_snapshots;

COMMIT;
