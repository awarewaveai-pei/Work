-- Down migration for 0075_kb_provenance_and_citation.sql.
--
-- Restores the 0072 retrieval signatures (which return no citation columns) and drops the
-- provenance and citation fields. What is lost is the labelling itself: after this, a passage from
-- a crawled vendor page is indistinguishable from an operator-written policy again, so the K1 code
-- may run against this state but the C1 collection path should not be left pointed at it.
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0075_kb_provenance_and_citation_down.sql

BEGIN;

DROP FUNCTION IF EXISTS public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int);
DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int);

-- Verbatim 0072 definitions.
CREATE OR REPLACE FUNCTION public.cs_match_chunks(
  p_scope     uuid[],
  p_spaces    uuid[],
  p_viewer    uuid,
  p_as_of     timestamptz,
  p_model     text,
  p_embedding vector(1536),
  p_limit     int DEFAULT 8
)
RETURNS TABLE (id uuid, source_id uuid, content text, similarity double precision)
LANGUAGE sql STABLE AS $fn$
  SELECT c.id, c.source_id, c.content, 1 - (c.embedding <=> p_embedding) AS similarity
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
  ORDER BY c.embedding <=> p_embedding
  LIMIT GREATEST(p_limit, 1);
$fn$;

CREATE OR REPLACE FUNCTION public.cs_match_chunks_keyword(
  p_scope  uuid[],
  p_spaces uuid[],
  p_viewer uuid,
  p_as_of  timestamptz,
  p_model  text,
  p_term   text,
  p_limit  int DEFAULT 8
)
RETURNS TABLE (id uuid, source_id uuid, content text)
LANGUAGE sql STABLE AS $fn$
  SELECT c.id, c.source_id, c.content
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

REVOKE ALL ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int) TO service_role;

DROP INDEX IF EXISTS public.idx_cs_sources_locked;
DROP INDEX IF EXISTS public.idx_cs_sources_doi;

ALTER TABLE public.cs_knowledge_sources
  DROP CONSTRAINT IF EXISTS cs_knowledge_sources_locked_check,
  DROP CONSTRAINT IF EXISTS cs_knowledge_sources_authorship_state_check,
  DROP CONSTRAINT IF EXISTS cs_knowledge_sources_epistemic_type_check;

ALTER TABLE public.cs_knowledge_sources
  DROP COLUMN IF EXISTS doi,
  DROP COLUMN IF EXISTS venue,
  DROP COLUMN IF EXISTS published_at,
  DROP COLUMN IF EXISTS author,
  DROP COLUMN IF EXISTS locked,
  DROP COLUMN IF EXISTS authorship_state,
  DROP COLUMN IF EXISTS epistemic_type;

NOTIFY pgrst, 'reload schema';

COMMIT;
