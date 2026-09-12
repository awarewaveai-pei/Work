-- 0080 — per-URL fetch state: what conditional GET and a durable scheduler both need to remember
-- between crawl runs, which today is nothing (every run starts from zero).
--
-- WHY THIS EXISTS: net/http-html.ts already sends `if-none-match`/`if-modified-since` when
-- `target.meta.etag`/`lastModified` are set, and already handles a 304 response -- but nothing ever
-- SET those meta fields, because nothing persisted a URL's etag/last-modified past the end of the
-- run that fetched it. The conditional-GET code path has been unreachable in production since it
-- was written. This table is what makes it reachable: the orchestrator hydrates a target's meta from
-- here before every attempt, and writes back after every successful (200) fetch.
--
-- WHY discovered_links IS HERE TOO: a 304 response has no body, so it cannot carry the page's
-- outbound links -- and http-html.ts returning `{docs: [], discovered: []}` on 304 was silently
-- dropping every link that unchanged page pointed to, for that entire crawl round (found in review,
-- TASKS.md 2026-09-11 "蒐集 C3 前必修"). The fix reads THIS column's last-known links on 304 and
-- re-enqueues them, so an unchanged parent page never hides a changed child page from the crawl.
--
-- Keyed by (organization_id, canonical_url) rather than a surrogate id: this table has exactly one
-- reader pattern (look up by that pair) and no other table ever references a row in it by id.
--
-- APPLY WITH (Medium risk -- additive only, no existing table/column touched):
--   node scripts/apply-db-migration.mjs 0080
-- Down migration: packages/db/scripts/0080_collection_url_state_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.collection_url_state (
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  canonical_url     text        NOT NULL,
  etag              text,
  last_modified     text,
  -- The page's outbound in-scope links as of the last successful (200) fetch. Replayed on the next
  -- 304 for this URL. Capped in application code (lib/collect/url-state.ts), not here: a CHECK on
  -- jsonb array length is awkward to write and this is a cache, not a source of truth -- worst case
  -- of an oversized array is a slightly slower read, never a wrong answer.
  discovered_links  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  last_fetched_at   timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, canonical_url)
);

ALTER TABLE public.collection_url_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.collection_url_state;
CREATE POLICY "service_role only" ON public.collection_url_state
  TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.collection_url_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.collection_url_state TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
