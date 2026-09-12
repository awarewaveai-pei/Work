-- 0081 — per-tenant collection schedule: the switch that turns "someone has to remember to click
-- Run" into "this runs itself", one tenant at a time, off by default.
--
-- WHY A TABLE INSTEAD OF TRIGGER.DEV'S OWN DYNAMIC SCHEDULES: Trigger.dev can register a schedule
-- per externalId (per organization), but that makes Trigger.dev's own schedule list the source of
-- truth for "who is scheduled and at what cadence" -- a second copy of exactly the same fact this
-- table holds, with no mechanism to notice the two disagreeing. One fixed cron task reads this table
-- and fans out itself (packages/workflows/src/trigger/collect-scheduled-crawl.ts); adding a tenant
-- is one row, not an API call to a second system.
--
-- DEFAULT OFF (AGENTS.md §0 "自動化預設 OFF"): `enabled` defaults false. A row can exist
-- (pre-configured cadence) without the crawl ever firing until an operator explicitly flips it.
--
-- day_of_week_utc uses JS Date#getUTCDay() encoding (0=Sunday..6=Saturday) so the Trigger.dev task,
-- written in TypeScript, needs no translation table between what it reads here and what it computes.
--
-- APPLY WITH (Medium risk -- additive only, no existing table/column touched):
--   node scripts/apply-db-migration.mjs 0081
-- Down migration: packages/db/scripts/0081_collection_schedules_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.collection_schedules (
  organization_id  uuid        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled          boolean     NOT NULL DEFAULT false,
  frequency        text        NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly')),
  hour_utc         int         NOT NULL DEFAULT 3 CHECK (hour_utc BETWEEN 0 AND 23),
  -- Ignored when frequency='daily'. 1 = Monday, a reasonable default for a weekly re-crawl.
  day_of_week_utc  int         NOT NULL DEFAULT 1 CHECK (day_of_week_utc BETWEEN 0 AND 6),
  last_run_at      timestamptz,
  -- The run_key handed to runCollection()/collection_runs, so "did today's scheduled run happen?"
  -- is answerable by joining the two tables instead of trusting last_run_at alone.
  last_run_key     text,
  -- Who last changed the config -- "role:source", same shape as collection_sources.approved_by.
  updated_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.collection_schedules;
CREATE POLICY "service_role only" ON public.collection_schedules
  TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.collection_schedules FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.collection_schedules TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
