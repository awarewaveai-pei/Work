-- Down migration for 0073_collection_runs_and_issues.sql.
--
-- Drops both collection tables and returns the ops_incidents source constraint to its 0031 value.
-- Any incident already recorded with source='collection' would then violate the restored
-- constraint, so those rows are deleted first — they are alert history for a subsystem being rolled
-- back, not business data. Everything else on ops_incidents is untouched.
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0073_collection_runs_and_issues_down.sql

BEGIN;

DROP TABLE IF EXISTS public.collection_issues;
DROP TABLE IF EXISTS public.collection_runs;

DELETE FROM public.ops_incidents WHERE source = 'collection';

ALTER TABLE public.ops_incidents
  DROP CONSTRAINT IF EXISTS ops_incidents_source_check;
ALTER TABLE public.ops_incidents
  ADD CONSTRAINT ops_incidents_source_check
  CHECK (source IN ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy'));

NOTIFY pgrst, 'reload schema';

COMMIT;
