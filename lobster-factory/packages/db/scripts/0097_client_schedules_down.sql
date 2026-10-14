-- Down migration for 0097_client_schedules.sql: restores 0081 collection_schedules with the
-- 'collect_crawl' rows, drops client_schedules (rows of any other job are lost -- there were none at
-- 0097), and puts ops_incidents.source back to 0091's list (fails if a 'schedule' incident exists:
-- delete or re-source those rows first).
-- Revert the next-admin code that reads client_schedules in the same window.
--
-- APPLY: docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 0097_client_schedules_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.collection_schedules (
  organization_id  uuid        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled          boolean     NOT NULL DEFAULT false,
  frequency        text        NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly')),
  hour_utc         int         NOT NULL DEFAULT 3 CHECK (hour_utc BETWEEN 0 AND 23),
  day_of_week_utc  int         NOT NULL DEFAULT 1 CHECK (day_of_week_utc BETWEEN 0 AND 6),
  last_run_at      timestamptz,
  last_run_key     text,
  updated_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.collection_schedules
  (organization_id, enabled, frequency, hour_utc, day_of_week_utc, last_run_at, last_run_key, updated_by, created_at, updated_at)
SELECT organization_id, enabled, frequency, hour_utc, day_of_week_utc, last_run_at, last_run_key, updated_by, created_at, updated_at
FROM public.client_schedules WHERE job_key = 'collect_crawl'
ON CONFLICT (organization_id) DO NOTHING;

ALTER TABLE public.collection_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.collection_schedules;
CREATE POLICY "service_role only" ON public.collection_schedules
  TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.collection_schedules FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.collection_schedules TO service_role;

DROP TABLE IF EXISTS public.client_schedules;

ALTER TABLE public.ops_incidents DROP CONSTRAINT IF EXISTS ops_incidents_source_check;
ALTER TABLE public.ops_incidents
  ADD CONSTRAINT ops_incidents_source_check
  CHECK (source IN ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch'));

NOTIFY pgrst, 'reload schema';

COMMIT;
