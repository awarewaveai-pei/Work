-- Reverses 0017_wave1_rule_engine_auto_promote_up.sql only. Does not touch
-- 0001-0016. Pure DROP COLUMN: the GRANT on that column drops with it
-- automatically (Postgres revokes column privileges when the column is
-- dropped), nothing else references this column.
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE hci.cases DROP COLUMN auto_promote_rule_findings;

COMMIT;
