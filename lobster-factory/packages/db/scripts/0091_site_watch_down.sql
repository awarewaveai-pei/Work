-- Down migration for 0091_site_watch.sql.
-- Drops the site-watch functions and tables and returns ops_incidents_source_check to its 0073 value.
-- Incidents with source='site_watch' would violate the restored constraint, so they are deleted
-- first: alert history of the subsystem being rolled back, not business data.
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0091_site_watch_down.sql

BEGIN;

DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'site\_watch\_%' LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', f);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.site_watch_page_state;
DROP TABLE IF EXISTS public.site_watch_results;
DROP TABLE IF EXISTS public.site_watch_maintenance;
DROP TABLE IF EXISTS public.site_watch_targets;

DELETE FROM public.ops_incidents WHERE source = 'site_watch';

ALTER TABLE public.ops_incidents DROP CONSTRAINT IF EXISTS ops_incidents_source_check;
ALTER TABLE public.ops_incidents
  ADD CONSTRAINT ops_incidents_source_check
  CHECK (source IN ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection'));

NOTIFY pgrst, 'reload schema';

COMMIT;
