-- 0076 — the keyword half of hybrid retrieval actually retrieves, and ranks.
--
-- WHAT WAS WRONG: `cs_match_chunks_keyword` matched with
--     strpos(lower(c.content), lower(btrim(p_term))) > 0
-- and `lib/kb/rag.ts` passed the USER'S WHOLE QUESTION as p_term. No chunk contains an entire
-- question, so the keyword half returned zero rows for essentially every real query: hybrid
-- retrieval has been vector-only in practice since 0051, with nothing anywhere saying so. Even when
-- it did match, ORDER BY last_modified meant "most recently edited", not "most relevant".
--
-- WHY PGROONGA: 0051 left `bm25_tsv` unpopulated and wrote down the reason — Postgres' own full-text
-- search does not segment CJK, so a tsvector of Chinese prose is not searchable in any useful way.
-- PGroonga tokenises CJK as character bigrams and ships in the supabase/postgres image already in
-- production (probed: extension loads, index builds, `pgroonga_score` survives a join).
-- The query side is built in `lib/kb/keyword-query.ts` — the same bigrams, OR-ed — because that is
-- unit-testable and a stored procedure full of string surgery is not.
--
-- MATCHING is PGroonga (`&@~`, correct CJK tokenisation, index-assisted when the planner wants it).
-- RANKING is term overlap, computed in SQL. pgroonga_score() was the obvious choice and is wrong
-- here: it only has a value for rows from a PGroonga index scan, so on a small table — which is
-- every table until this product grows — every row scores 0 and the ranking quietly disappears.
--
-- `bm25_tsv` and `idx_cs_chunks_bm25` are NOT dropped here: dropping a column is irreversible and
-- this migration is already changing how retrieval behaves. Tracked in TASKS.md for a later pass.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgroonga;

-- Content-only index. Deliberately not a multi-column index with organization_id: PGroonga is the
-- text matcher, and the visibility predicates are applied by the function around it.
CREATE INDEX IF NOT EXISTS idx_cs_chunks_pgroonga
  ON public.cs_knowledge_chunks USING pgroonga (content);

-- RETURN shape changes (adds `score`), so the old signature must go first.
DROP FUNCTION IF EXISTS public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int);

CREATE OR REPLACE FUNCTION public.cs_match_chunks_keyword(
  p_scope  uuid[],
  p_spaces uuid[],
  p_viewer uuid,
  p_as_of  timestamptz,
  p_model  text,
  p_term   text,
  p_limit  int DEFAULT 8
)
RETURNS TABLE (
  id uuid, source_id uuid, content text, score double precision,
  title text, canonical_url text, author text, published_at timestamptz, venue text, doi text,
  epistemic_type text, authorship_state text, locked text
)
LANGUAGE sql STABLE AS $fn$
  SELECT c.id, c.source_id, c.content,
         -- How many of the query's terms this chunk contains. NOT pgroonga_score(): that returns a
         -- value only for rows produced by a PGroonga index scan, and on a small table the planner
         -- chooses a sequential scan, scoring every row 0 and silently reverting the ranking to the
         -- tie-breaker. Counting overlap is plan-independent and matches what pgroonga_score gave
         -- (a chunk matching three query bigrams scored exactly 3.0).
         hit.n AS score,
         s.title, s.canonical_url, s.author, s.published_at, s.venue, s.doi,
         s.epistemic_type, s.authorship_state, s.locked
  FROM public.cs_knowledge_chunks c
  JOIN public.cs_knowledge_sources s ON s.id = c.source_id
  CROSS JOIN LATERAL (
    SELECT count(*)::double precision AS n
    FROM unnest(string_to_array(btrim(p_term), ' OR ')) AS q(term)
    WHERE btrim(q.term) <> '' AND strpos(lower(c.content), lower(btrim(q.term))) > 0
  ) hit
-- >>> KB_VISIBILITY_PREDICATE
  WHERE c.organization_id = ANY(p_scope)
    AND COALESCE(s.space_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = ANY(COALESCE(p_spaces, ARRAY['00000000-0000-0000-0000-000000000000'::uuid]))
    AND s.status = 'active'
    AND (NOT s.is_sensitive OR c.organization_id = p_viewer)
    AND COALESCE(s.valid_from, '-infinity'::timestamptz) <= COALESCE(p_as_of, now())
    AND (s.valid_to IS NULL OR s.valid_to > COALESCE(p_as_of, now()))
    AND c.embed_model = p_model
    AND c.embedding IS NOT NULL
-- <<< KB_VISIBILITY_PREDICATE
    AND length(btrim(p_term)) > 0
    AND c.content &@~ btrim(p_term)
  ORDER BY hit.n DESC, c.last_modified DESC, c.id
  LIMIT GREATEST(p_limit, 1);
$fn$;

-- 0064 house pattern: Supabase grants EXECUTE to anon and authenticated on every NEW function.
-- Revoking from PUBLIC alone does not remove those grants.
REVOKE ALL ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
