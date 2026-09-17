-- Down migration for 0086_kb_keyword_mode.sql. Restores cs_match_chunks_keyword's pre-0086
-- signature and body VERBATIM from 0083_kb_sensitive_audience_gate.sql, and drops the keyword_mode
-- column. K2i's own rollback row: "移除覆蓋欄位" — no document's stored text or version history is
-- touched, only the keyword-matching behaviour reverts to pure bigram-OR for everyone.

BEGIN;

ALTER TABLE public.cs_knowledge_sources DROP COLUMN IF EXISTS keyword_mode;

DROP FUNCTION IF EXISTS public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int, boolean, text);

CREATE OR REPLACE FUNCTION public.cs_match_chunks_keyword(
  p_scope             uuid[],
  p_spaces            uuid[],
  p_viewer            uuid,
  p_as_of             timestamptz,
  p_model             text,
  p_term              text,
  p_limit             int DEFAULT 8,
  p_include_sensitive boolean DEFAULT true
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
  CROSS JOIN LATERAL (
    SELECT count(*)::double precision AS n
    FROM unnest(string_to_array(btrim(p_term), ' OR ')) AS q(term)
    WHERE btrim(q.term) <> '' AND strpos(pgroonga_normalize(c.content), pgroonga_normalize(btrim(q.term))) > 0
  ) hit
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
  ORDER BY hit.n DESC, c.last_modified DESC, c.id
  LIMIT GREATEST(p_limit, 1);
$fn$;

REVOKE ALL ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
