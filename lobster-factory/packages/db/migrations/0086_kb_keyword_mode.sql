-- 0086 — precise vs long-tail keyword matching, per document (K2i; operator decision 2026-09-17:
-- "有時候我要有關連性-長尾關鍵字，有時候我要精確關鍵字" — the existing bigram-OR match (migration 0076)
-- only ever does the first one).
--
-- MODEL: `cs_knowledge_sources.keyword_mode` ('inherit' | 'exact' | 'fuzzy', default 'inherit') plus a
-- TENANT DEFAULT read from `organizations.metadata->'client_config'->>'kbKeywordModeDefault'` — the
-- exact JSON blob cs-config's `csEnabled` kill-switch already lives in (app/api/ops/clients/[slug]/
-- cs-config/route.ts), not a new config mechanism. A document's effective mode is its own column
-- unless that column is 'inherit', in which case it falls back to the tenant default (absent ⇒
-- 'fuzzy', so every document ingested before this migration keeps today's behaviour with zero
-- action from any operator).
--
-- WHY THE TENANT LOOKUP IS INSIDE THE SQL, NOT PASSED IN BY THE CALLER: `cs_match_chunks_keyword`
-- already joins one row per chunk to its OWN `cs_knowledge_sources` row inside the function — the
-- tenant whose default applies is that document's own organization_id, not the caller's `p_viewer`
-- (which is a DIFFERENT axis: migration 0083's sensitive-content viewer check). Computing it inside
-- the function, keyed off `c.organization_id`, is correct for every caller shape this function has
-- ever had, including a future multi-org `p_scope`; a boolean parameter the CALLER computes would be
-- correct only for today's single-tenant-per-call shape and silently wrong the day that changes.
--
-- MATCHING: exact mode does NOT replace the existing PGroonga bigram-OR gate (`c.content &@~
-- btrim(p_term)`) — every row still has to clear that first (keeps the index-acceleration migration
-- 0076 built `&@~` for). Exact mode ADDS a further requirement: the caller's literal, un-bigrammed
-- question (`p_raw_query`) must appear as a substring of the chunk, via the same
-- `pgroonga_normalize()` case/width folding the ranking CTE already uses below — the "精確關鍵字" the
-- operator asked for is "the whole phrase actually appears", not merely "shares one bigram with it".
--
-- EMPTY-NEEDLE GUARD: `strpos(x, '')` is 1 (>0) in Postgres for ANY x — an unguarded exact-mode check
-- against an empty p_raw_query would therefore match every row, the opposite of "precise". Guarded
-- explicitly with `length(btrim(p_raw_query)) > 0`, so an empty raw query EXCLUDES exact-mode
-- documents rather than defaulting to matching everything.
--
-- Argument list changes (adds p_raw_query) ⇒ DROP the old signature first, same pattern 0083 used.
--
-- APPLY WITH (Medium risk — additive column + parameter, both defaulted; existing behaviour for every
-- document not explicitly opted into 'exact' is unchanged):
--   node scripts/apply-db-migration.mjs 0086
-- Down migration: packages/db/scripts/0086_kb_keyword_mode_down.sql (restores the pre-0086 signature
-- verbatim from 0083, drops the column).

BEGIN;

ALTER TABLE public.cs_knowledge_sources
  ADD COLUMN IF NOT EXISTS keyword_mode text NOT NULL DEFAULT 'inherit'
    CHECK (keyword_mode IN ('inherit', 'exact', 'fuzzy'));

DROP FUNCTION IF EXISTS public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int, boolean);

CREATE OR REPLACE FUNCTION public.cs_match_chunks_keyword(
  p_scope             uuid[],
  p_spaces            uuid[],
  p_viewer            uuid,
  p_as_of             timestamptz,
  p_model             text,
  p_term              text,
  p_limit             int DEFAULT 8,
  p_include_sensitive boolean DEFAULT true,
  p_raw_query         text DEFAULT ''
)
RETURNS TABLE (
  id uuid, source_id uuid, content text, score double precision,
  title text, canonical_url text, author text, published_at timestamptz, venue text, doi text,
  epistemic_type text, authorship_state text, locked text
)
LANGUAGE sql STABLE AS $fn$
  SELECT c.id, c.source_id, c.content,
         hit.n AS score,
         s.title, s.canonical_url, s.author, s.published_at, s.venue, s.doi,
         s.epistemic_type, s.authorship_state, s.locked
  FROM public.cs_knowledge_chunks c
  JOIN public.cs_knowledge_sources s ON s.id = c.source_id
  JOIN public.organizations o ON o.id = c.organization_id
  CROSS JOIN LATERAL (
    SELECT count(*)::double precision AS n
    FROM unnest(string_to_array(btrim(p_term), ' OR ')) AS q(term)
    WHERE btrim(q.term) <> '' AND strpos(pgroonga_normalize(c.content), pgroonga_normalize(btrim(q.term))) > 0
  ) hit
  CROSS JOIN LATERAL (
    SELECT CASE COALESCE(s.keyword_mode, 'inherit')
             WHEN 'exact' THEN true
             WHEN 'fuzzy' THEN false
             ELSE COALESCE((o.metadata -> 'client_config' ->> 'kbKeywordModeDefault') = 'exact', false)
           END AS exact_mode
  ) mode
-- >>> KB_VISIBILITY_PREDICATE
  WHERE c.organization_id = ANY(p_scope)
    AND COALESCE(s.space_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = ANY(COALESCE(p_spaces, ARRAY['00000000-0000-0000-0000-000000000000'::uuid]))
    AND s.status = 'active'
    AND (NOT s.is_sensitive OR (c.organization_id = p_viewer AND p_include_sensitive))
    AND COALESCE(s.valid_from, '-infinity'::timestamptz) <= COALESCE(p_as_of, now())
    AND (s.valid_to IS NULL OR s.valid_to > COALESCE(p_as_of, now()))
    AND c.embed_model = p_model
    AND c.embedding IS NOT NULL
-- <<< KB_VISIBILITY_PREDICATE
    AND length(btrim(p_term)) > 0
    AND c.content &@~ btrim(p_term)
    AND (
      NOT mode.exact_mode
      OR (length(btrim(p_raw_query)) > 0
          AND strpos(pgroonga_normalize(c.content), pgroonga_normalize(btrim(p_raw_query))) > 0)
    )
  ORDER BY hit.n DESC, c.last_modified DESC, c.id
  LIMIT GREATEST(p_limit, 1);
$fn$;

REVOKE ALL ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int, boolean, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
