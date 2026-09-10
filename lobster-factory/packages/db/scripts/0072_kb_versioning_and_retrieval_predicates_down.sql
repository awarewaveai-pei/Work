-- Down migration for 0072_kb_versioning_and_retrieval_predicates.sql.
--
-- Restores the 0051 state exactly: the old unfiltered cs_match_chunks(uuid, vector, int) comes
-- back, the six-predicate pair goes away, and the added columns/indexes/constraints/table are
-- dropped. Dropping the columns loses whatever was written into them (canonical_url /
-- content_hash / valid_from …) — doc_family_id and source_version themselves survive because they
-- predate 0072, but the values 0072's UPDATE repaired on cs_knowledge_chunks are NOT restored to
-- their previous (wrong) values, which is the desired direction.
--
-- The application code from K1 does NOT work against this state (it calls the six-argument
-- signature), so rolling this back means reverting the next-admin deploy in the same window.
--
-- The restored 0051 function is created fresh, so it picks up Supabase's default anon/authenticated
-- EXECUTE grants; the revoke block below keeps the 0064 lockdown intact through the rollback.
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0072_kb_versioning_and_retrieval_predicates_down.sql

BEGIN;

DROP FUNCTION IF EXISTS public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int);
DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int);

-- Verbatim 0051 definition (0051_cs_core.sql, "Vector retrieval RPC" section).
CREATE OR REPLACE FUNCTION public.cs_match_chunks(
  p_org       uuid,
  p_embedding vector(1536),
  p_limit     int DEFAULT 8
)
RETURNS TABLE (id uuid, source_id uuid, content text, similarity double precision)
LANGUAGE sql STABLE AS $fn$
  SELECT c.id, c.source_id, c.content, 1 - (c.embedding <=> p_embedding) AS similarity
  FROM public.cs_knowledge_chunks c
  WHERE c.organization_id = p_org
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_embedding
  LIMIT GREATEST(p_limit, 1);
$fn$;

REVOKE ALL ON FUNCTION public.cs_match_chunks(uuid, vector, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks(uuid, vector, int) TO service_role;

DROP TABLE IF EXISTS public.kb_document_relations;

ALTER TABLE public.cs_knowledge_chunks
  DROP CONSTRAINT IF EXISTS cs_knowledge_chunks_source_org_fkey;

DROP INDEX IF EXISTS public.idx_cs_chunks_hnsw_te3s;
DROP INDEX IF EXISTS public.uq_cs_sources_id_org;
DROP INDEX IF EXISTS public.uq_cs_sources_family_version;
DROP INDEX IF EXISTS public.idx_cs_sources_space;
DROP INDEX IF EXISTS public.idx_cs_sources_valid;
DROP INDEX IF EXISTS public.idx_cs_sources_hash;
DROP INDEX IF EXISTS public.idx_cs_sources_canonical;

ALTER TABLE public.cs_knowledge_sources
  DROP COLUMN IF EXISTS domain_pack,
  DROP COLUMN IF EXISTS authority_tier,
  DROP COLUMN IF EXISTS doc_type,
  DROP COLUMN IF EXISTS language,
  DROP COLUMN IF EXISTS valid_to,
  DROP COLUMN IF EXISTS valid_from,
  DROP COLUMN IF EXISTS space_id,
  DROP COLUMN IF EXISTS content_hash,
  DROP COLUMN IF EXISTS canonical_url;

NOTIFY pgrst, 'reload schema';

COMMIT;
