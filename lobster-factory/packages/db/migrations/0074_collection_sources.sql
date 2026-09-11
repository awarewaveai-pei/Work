-- 0074 — collection: where "this tenant collects from these sources" lives.
--
-- Until now the seeds were arguments to a function call, which meant the answer to "what are we
-- collecting for this customer?" existed only inside whoever last typed the call. This table is
-- that answer, and it is also the APPROVAL SURFACE required by ADR 013: a row in `approved` state
-- is a human saying this source may speak for this tenant. Discovery (C6) proposes rows in
-- `candidate` state and may never promote them itself.
--
-- The unit is the SOURCE, not the document (ADR 013 §決策 4): approving a registry-plus-query or a
-- site once, and letting its content flow, is the only version of this that is still automation.
--
-- APPLY WITH (High risk — needs explicit go-ahead, AGENTS.md §3):
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0074_collection_sources.sql
-- Down migration: packages/db/scripts/0074_collection_sources_down.sql
-- Local verification: packages/db/scripts/collection-local-verify.sh

BEGIN;

CREATE TABLE IF NOT EXISTS public.collection_sources (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Which block reads it: collect/http-html, collect/academic, collect/local-file …
  -- Deliberately NOT a CHECK constraint: the set of blocks lives in code (lib/collect/registry),
  -- and a database constraint listing them would be a second place to update, always the stale one.
  -- An unknown id is rejected at write time against the catalogue, which knows the truth.
  block_id         text        NOT NULL,
  -- The entry point, in whatever shape that block declared: a URL, a search query, a path.
  entry            text        NOT NULL,
  options          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- candidate: proposed by discovery, not yet approved — NEVER collected from.
  -- approved: a human said yes. disabled: was approved, now switched off, history kept.
  status           text        NOT NULL DEFAULT 'approved'
    CHECK (status IN ('candidate','approved','disabled')),
  label            text,
  -- Who proposed it (a discovery provider id) and who approved it. Both recorded because "why is
  -- this in our knowledge base?" is a question that gets asked months later, by someone else.
  proposed_by      text,
  approved_by      text,
  approved_at      timestamptz,
  last_run_at      timestamptz,
  last_status      text,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One source per tenant per entry: adding the same site twice is a mistake, not a feature.
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_sources_org_block_entry
  ON public.collection_sources(organization_id, block_id, entry);
CREATE INDEX IF NOT EXISTS idx_collection_sources_org_status
  ON public.collection_sources(organization_id, status);

ALTER TABLE public.collection_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.collection_sources;
CREATE POLICY "service_role only" ON public.collection_sources
  TO service_role USING (true) WITH CHECK (true);

-- Which source a run came from. Needed for the revocation path (ADR 013 §決策 5): when a source is
-- withdrawn, everything it produced has to be findable. This is the run-level half; the
-- document-level half waits for the knowledge base to carry a source reference (tracked in TASKS).
ALTER TABLE public.collection_runs
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.collection_sources(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_collection_runs_source
  ON public.collection_runs(source_id, started_at DESC);

NOTIFY pgrst, 'reload schema';

COMMIT;
