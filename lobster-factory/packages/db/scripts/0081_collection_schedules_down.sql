-- Down migration for 0081_collection_schedules.sql.
--
-- Drops the per-tenant schedule config. What is lost: which tenants had scheduling on and at what
-- cadence. The scheduled Trigger.dev task (collect-scheduled-crawl) reads this table on every fire
-- and does nothing if it cannot find enabled rows, so dropping the table is equivalent to disabling
-- scheduling for every tenant at once -- no crawl in flight is interrupted, and collection_sources /
-- the knowledge base are untouched.
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0081_collection_schedules_down.sql

BEGIN;

DROP TABLE IF EXISTS public.collection_schedules;

NOTIFY pgrst, 'reload schema';

COMMIT;
