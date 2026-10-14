-- 0097 — client_schedules: one table for every per-client routine job (agency-os/docs/operations/
-- SCHEDULES_PAGE_PLAN.md §3.2/§4.1). Generalizes 0081 collection_schedules from "one crawl per org" to
-- "one row per (org, job_key)"; which jobs exist is a code registry (next-admin lib/schedules/jobs.ts),
-- so job_key has no FK. 0081's reason for a table over Trigger.dev dynamic schedules still holds.
--
-- Site-watch keeps its own tables (0091): it is a lease/bucket monitor, not a run-once-when-due job.
--
-- last_error/last_error_at: set by the sweep when a job throws, cleared by the next success. A failed
-- run never sets last_run_at (0081 rule: the next due heartbeat retries).
--
-- ops_incidents.source gains 'schedule' (the sweep raises one incident per (job, org) on a throw).
--
-- Moves the rows of collection_schedules as job 'collect_crawl' and drops it. Deploy order: this
-- migration, then the next-admin code (old code reading the dropped table degrades to "disabled").
--
-- APPLY:  node scripts/apply-db-migration.mjs 0097     (High: drops collection_schedules)
-- Down:   packages/db/scripts/0097_client_schedules_down.sql (restores 0081 table + rows)

BEGIN;
-- The source CHECK re-validates ops_incidents under an exclusive lock: give up rather than queue writers.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.client_schedules (
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_key          text        NOT NULL CHECK (job_key ~ '^[a-z][a-z0-9_]{2,40}$'),
  enabled          boolean     NOT NULL DEFAULT false,
  frequency        text        NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly')),
  hour_utc         int         NOT NULL DEFAULT 3 CHECK (hour_utc BETWEEN 0 AND 23),
  -- JS Date#getUTCDay() encoding (0=Sunday), same as 0081. Ignored when frequency='daily'.
  day_of_week_utc  int         NOT NULL DEFAULT 1 CHECK (day_of_week_utc BETWEEN 0 AND 6),
  last_run_at      timestamptz,
  last_run_key     text,
  last_error       text,
  last_error_at    timestamptz,
  updated_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, job_key)
);

INSERT INTO public.client_schedules
  (organization_id, job_key, enabled, frequency, hour_utc, day_of_week_utc, last_run_at, last_run_key, updated_by, created_at, updated_at)
SELECT organization_id, 'collect_crawl', enabled, frequency, hour_utc, day_of_week_utc, last_run_at, last_run_key, updated_by, created_at, updated_at
FROM public.collection_schedules
ON CONFLICT (organization_id, job_key) DO NOTHING;

DROP TABLE public.collection_schedules;

ALTER TABLE public.client_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.client_schedules;
CREATE POLICY "service_role only" ON public.client_schedules
  TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.client_schedules FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_schedules TO service_role;

-- Current value is 0091's.
ALTER TABLE public.ops_incidents DROP CONSTRAINT IF EXISTS ops_incidents_source_check;
ALTER TABLE public.ops_incidents
  ADD CONSTRAINT ops_incidents_source_check
  CHECK (source IN ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch','schedule'));

NOTIFY pgrst, 'reload schema';

COMMIT;
