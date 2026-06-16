-- Migration 0042: Content Studio operator-managed trending sources
-- The trending panel's sources were code/env-only (Google News / Reddit / PTT / Perplexity built-in,
-- plus env CONTENT_TRENDING_FEEDS). This table lets the operator add/remove RSS/Atom feeds from the UI
-- without a deploy — rows are fetched per trending request and run as ephemeral search blocks alongside
-- the built-in ones (see lib/content/trending-sources.ts buildDbSearchBlocks + runTrending extraBlocks).
--
-- SSRF posture: rows are added only via the ops-role-gated /api/content/sources route, so they are
-- "trusted operator input" — the same trust level as env CONTENT_TRENDING_FEEDS. isSafePublicHttps
-- (literal-host check) is applied at both insert time and fetch time. Opening this to untrusted users
-- would require DNS-resolution checks first (documented in trending-sources.ts isSafePublicHttps).
--
-- Operator-authored config (not secrets); service-role-only access for consistency with wp_sites /
-- content_drafts.

CREATE TABLE IF NOT EXISTS public.content_sources (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text        NOT NULL,
  url         text        NOT NULL,
  geos        jsonb       NOT NULL DEFAULT '"*"'::jsonb,   -- "*" = all geos, or e.g. ["TW","HK"]
  enabled     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_sources_created ON public.content_sources(created_at DESC);

-- RLS: service role only (bypasses RLS); anon/authenticated never reach this table directly.
ALTER TABLE public.content_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_sources_service_role ON public.content_sources
  TO service_role USING (true) WITH CHECK (true);

-- Rollback:
--   DROP POLICY IF EXISTS content_sources_service_role ON public.content_sources;
--   DROP TABLE IF EXISTS public.content_sources;
