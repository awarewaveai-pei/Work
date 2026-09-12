-- Down migration for 0083_kb_sensitive_audience_gate.sql.
-- Restores the pre-0083 signatures verbatim (0075's cs_match_chunks, 0076's cs_match_chunks_keyword).
BEGIN;

DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int, boolean);

CREATE OR REPLACE FUNCTION public.cs_match_chunks(
  p_scope     uuid[],
  p_spaces    uuid[],
  p_viewer    uuid,
  p_as_of     timestamptz,
  p_model     text,
  p_embedding vector(1536),
  p_limit     int DEFAULT 8
)
RETURNS TABLE (
  id uuid, source_id uuid, content text, similarity double precision,
  title text, canonical_url text, author text, published_at timestamptz, venue text, doi text,
  epistemic_type text, authorship_state text, locked text
)
LANGUAGE sql STABLE AS $fn$
  SELECT c.id, c.source_id, c.content, 1 - (c.embedding <=> p_embedding) AS similarity,
         s.title, s.canonical_url, s.author, s.published_at, s.venue, s.doi,
         s.epistemic_type, s.authorship_state, s.locked
  FROM public.cs_knowledge_chunks c
  JOIN public.cs_knowledge_sources s ON s.id = c.source_id
  WHERE c.organization_id = ANY(p_scope)
    AND COALESCE(s.space_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = ANY(COALESCE(p_spaces, ARRAY['00000000-0000-0000-0000-000000000000'::uuid]))
    AND s.status = 'active'
    AND (NOT s.is_sensitive OR c.organization_id = p_viewer)
    AND COALESCE(s.valid_from, '-infinity'::timestamptz) <= COALESCE(p_as_of, now())
    AND (s.valid_to IS NULL OR s.valid_to > COALESCE(p_as_of, now()))
    AND c.embed_model = p_model
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_embedding
  LIMIT GREATEST(p_limit, 1);
$fn$;

DROP FUNCTION IF EXISTS public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int, boolean);

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
  WHERE c.organization_id = ANY(p_scope)
    AND COALESCE(s.space_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = ANY(COALESCE(p_spaces, ARRAY['00000000-0000-0000-0000-000000000000'::uuid]))
    AND s.status = 'active'
    AND (NOT s.is_sensitive OR c.organization_id = p_viewer)
    AND COALESCE(s.valid_from, '-infinity'::timestamptz) <= COALESCE(p_as_of, now())
    AND (s.valid_to IS NULL OR s.valid_to > COALESCE(p_as_of, now()))
    AND c.embed_model = p_model
    AND c.embedding IS NOT NULL
    AND length(btrim(p_term)) > 0
    AND c.content &@~ btrim(p_term)
  ORDER BY hit.n DESC, c.last_modified DESC, c.id
  LIMIT GREATEST(p_limit, 1);
$fn$;

REVOKE ALL ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
