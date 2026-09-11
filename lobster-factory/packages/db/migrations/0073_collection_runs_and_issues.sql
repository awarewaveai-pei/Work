-- 0073 — collection C2: make a crawl's refusals visible instead of ephemeral.
--
-- Until now a crawl's report lived in memory and died with the process. That is the failure mode the
-- whole quality gate exists to prevent, one level up: the gate correctly refuses a page, nobody ever
-- learns it was refused, and the knowledge base quietly stops keeping up with the site.
--
-- Two tables, both owned by collection and both droppable without touching anything else
-- (DATA_COLLECTION_PLAN.md §2: `dirty` must NOT go into cs_knowledge_sources — that table has three
-- separate code paths dedicated to deleting zero-chunk rows and would fight this data).
--
-- Plus one line on ops_incidents: `collection` becomes a legitimate incident source, exactly as
-- `deploy` did in 0031. A crawl that stopped storing content is an ops incident, and the intake
-- pipeline already has fingerprint de-duplication, storm correlation, severity rules and the
-- Telegram/Slack fan-out. Building a second notification path next to it would be the duplication
-- this codebase keeps paying to remove.
--
-- APPLY WITH (High risk — needs explicit go-ahead, AGENTS.md §3):
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0073_collection_runs_and_issues.sql
-- Down migration: packages/db/scripts/0073_collection_runs_and_issues_down.sql

BEGIN;

-- ── One row per crawl run ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collection_runs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- The orchestrator's own run id (its resume key). Not a uuid by contract: a caller may use any
  -- stable string, and this table must record what was actually used.
  run_key          text        NOT NULL,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  -- Why the run ended. NULL while in flight.
  stopped_by       text        CHECK (stopped_by IN ('frontier_empty','budget')),
  fetched          int         NOT NULL DEFAULT 0,
  written          int         NOT NULL DEFAULT 0,
  skipped          int         NOT NULL DEFAULT 0,
  dirty            int         NOT NULL DEFAULT 0,
  quarantined      int         NOT NULL DEFAULT 0,
  disallowed       int         NOT NULL DEFAULT 0,
  gone             int         NOT NULL DEFAULT 0,
  retried          int         NOT NULL DEFAULT 0,
  budget_spent     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  seeds            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- A resumed run keeps its key, so "the run" is one row that gets updated, not a row per attempt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_runs_org_key
  ON public.collection_runs(organization_id, run_key);
CREATE INDEX IF NOT EXISTS idx_collection_runs_org_started
  ON public.collection_runs(organization_id, started_at DESC);

-- ── One row per refused page ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collection_issues (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid        NOT NULL REFERENCES public.collection_runs(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Which bucket: an extraction problem, a planted-instruction quarantine, a robots/gate refusal,
  -- or a page that is simply gone. Kept apart on purpose — an alert on extraction failures must not
  -- fire on robots.txt doing its job, or it gets turned down and then never fires at all.
  kind             text        NOT NULL CHECK (kind IN ('dirty','quarantined','disallowed','gone')),
  uri              text        NOT NULL,
  reason           text        NOT NULL,
  -- The quality gate's numbers (length, density, script, soft-404) when it was the gate that
  -- refused. Stored so a threshold argument can be settled with data rather than opinion.
  checks           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collection_issues_run
  ON public.collection_issues(run_id, kind);
CREATE INDEX IF NOT EXISTS idx_collection_issues_org_created
  ON public.collection_issues(organization_id, created_at DESC);
-- The same page failing the same way every run is one problem, not a hundred.
CREATE INDEX IF NOT EXISTS idx_collection_issues_org_uri
  ON public.collection_issues(organization_id, uri);

ALTER TABLE public.collection_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.collection_runs;
DROP POLICY IF EXISTS "service_role only" ON public.collection_issues;
CREATE POLICY "service_role only" ON public.collection_runs   TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role only" ON public.collection_issues TO service_role USING (true) WITH CHECK (true);

-- ── ops_incidents: one more legitimate source ─────────────────────────────────
-- Same shape as 0031 (which added 'deploy'): DROP + ADD is idempotent, loses no data, and takes
-- only a table-level DDL lock.
ALTER TABLE public.ops_incidents
  DROP CONSTRAINT IF EXISTS ops_incidents_source_check;
ALTER TABLE public.ops_incidents
  ADD CONSTRAINT ops_incidents_source_check
  CHECK (source IN ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection'));

NOTIFY pgrst, 'reload schema';

COMMIT;
