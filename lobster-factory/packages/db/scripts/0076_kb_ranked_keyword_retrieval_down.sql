-- Down for 0076 — restore the 0075 keyword function (substring match, no ranking, no `score`).
--
-- The extension is NOT dropped: other work may come to depend on it, and DROP EXTENSION would take
-- every PGroonga index with it. The index IS dropped, because this migration created it.
--
-- The real app/DB coupling is NOT "app selects a column that stops existing" — lib/kb/db.ts calls
-- this RPC with `.rpc()` and no named `.select()`, so a missing `score` column breaks nothing at
-- the wire level. The coupling that matters is the QUERY STRING FORMAT: lib/kb/rag.ts sends
-- `buildKeywordQuery()`'s bigram-OR string (e.g. "請問 OR 問退 OR 退貨 OR ..."), and this down
-- migration's restored function matches with `strpos(lower(content), lower(btrim(p_term)))` — the
-- SAME substring-of-the-whole-string check that returned zero rows for any real question before
-- 0076 existed. Roll back the app to the commit before lib/kb/keyword-query.ts (which sent the raw
-- question) in the SAME window as this script, or the keyword half goes silently back to zero
-- results with no error anywhere — the original bug this migration was written to fix.

BEGIN;

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
  id uuid, source_id uuid, content text,
  title text, canonical_url text, author text, published_at timestamptz, venue text, doi text,
  epistemic_type text, authorship_state text, locked text
)
LANGUAGE sql STABLE AS $fn$
  SELECT c.id, c.source_id, c.content,
         s.title, s.canonical_url, s.author, s.published_at, s.venue, s.doi,
         s.epistemic_type, s.authorship_state, s.locked
  FROM public.cs_knowledge_chunks c
  JOIN public.cs_knowledge_sources s ON s.id = c.source_id
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
    AND strpos(lower(c.content), lower(btrim(p_term))) > 0
  ORDER BY c.last_modified DESC, c.id
  LIMIT GREATEST(p_limit, 1);
$fn$;

REVOKE ALL ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int)
  TO service_role;

DROP INDEX IF EXISTS public.idx_cs_chunks_pgroonga;

NOTIFY pgrst, 'reload schema';

COMMIT;
