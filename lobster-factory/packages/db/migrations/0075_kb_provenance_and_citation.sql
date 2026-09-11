-- 0075 — KB K2/K2e: carry provenance and a citation, so what the knowledge base returns can be
-- attributed and can be quoted safely.
--
-- TWO GAPS, one cause. Collection stamps every fetched document EVIDENCE / SOURCE_QUOTATION and
-- records its byline (lib/collect/provenance.ts, collectors/*), and both stopped dead at the sink
-- because `cs_knowledge_sources` had nowhere to put them. The consequences are not cosmetic:
--
--   * WITHOUT PROVENANCE a consumer cannot tell a vendor's marketing claim, crawled off the open
--     web, from a policy the operator wrote. DATA_COLLECTION_PLAN §1.3b requires the label to
--     survive all the way to the passage, precisely so untrusted quoted text can be wrapped before
--     it reaches a prompt. An unlabelled corpus makes that impossible to do correctly.
--   * WITHOUT A CITATION the academic source added this week is unusable for the thing it was added
--     for. "Some paper says 7 days" is not an answer anybody can check.
--
-- The three-axis vocabulary is NOT invented here: it is
-- agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/governance/epistemic-label.schema.yaml
-- (ADR-004, ACCEPTED), the same one HCI uses. Four incompatible vocabularies for this already
-- existed once; this is the agreed one.
--
-- APPLY WITH (High risk — needs explicit go-ahead, AGENTS.md §3):
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0075_kb_provenance_and_citation.sql
-- Down migration: packages/db/scripts/0075_kb_provenance_and_citation_down.sql
-- Local verification: packages/db/scripts/kb-local-verify.sh

BEGIN;

ALTER TABLE public.cs_knowledge_sources
  -- The three axes, stored as their own columns rather than inside metadata: a label that can be
  -- dropped by forgetting a jsonb key is not a safety label.
  ADD COLUMN IF NOT EXISTS epistemic_type   text,
  ADD COLUMN IF NOT EXISTS authorship_state text,
  ADD COLUMN IF NOT EXISTS locked           text,
  -- Citation fields. `author` and `published_at` cannot be recovered after collection: nobody can
  -- reconstruct who wrote a page or when, once the page has changed.
  ADD COLUMN IF NOT EXISTS author           text,
  ADD COLUMN IF NOT EXISTS published_at     timestamptz,
  ADD COLUMN IF NOT EXISTS venue            text,
  ADD COLUMN IF NOT EXISTS doi              text;

-- The vocabulary, enforced. A free-text label drifts into four spellings of the same thing, which
-- is the exact failure epistemic-label.schema.yaml was written to end.
DO $$ BEGIN
  ALTER TABLE public.cs_knowledge_sources
    ADD CONSTRAINT cs_knowledge_sources_epistemic_type_check
    CHECK (epistemic_type IS NULL OR epistemic_type IN (
      'SOURCE_FACT','EVIDENCE','ASSUMPTION','HYPOTHESIS','AI_INFERENCE','AI_SUGGESTION',
      'HUMAN_OPINION','CALCULATED_RESULT','SIMULATED_RESULT','UNKNOWN','DECISION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.cs_knowledge_sources
    ADD CONSTRAINT cs_knowledge_sources_authorship_state_check
    CHECK (authorship_state IS NULL OR authorship_state IN (
      'HUMAN_ORIGINAL','AI_GENERATED','AI_SUGGESTED','HUMAN_EDITED','HUMAN_APPROVED','SOURCE_QUOTATION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `locked` is the operator's "automation may not touch this". The schema allows LOCKED_FACT only on
-- a SOURCE_FACT and LOCKED_DECISION only on a DECISION, and that pairing is enforced here rather
-- than in application code, because the failure it prevents is a crawler overwriting a
-- hand-written authoritative policy with a stale copy from the public site — silently.
DO $$ BEGIN
  ALTER TABLE public.cs_knowledge_sources
    ADD CONSTRAINT cs_knowledge_sources_locked_check
    CHECK (
      locked IS NULL
      OR (locked = 'LOCKED_FACT' AND epistemic_type = 'SOURCE_FACT')
      OR (locked = 'LOCKED_DECISION' AND epistemic_type = 'DECISION')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cs_sources_doi
  ON public.cs_knowledge_sources(organization_id, doi) WHERE doi IS NOT NULL;
-- Locked documents are looked up on every re-ingest, and there are few of them.
CREATE INDEX IF NOT EXISTS idx_cs_sources_locked
  ON public.cs_knowledge_sources(organization_id, doc_family_id) WHERE locked IS NOT NULL;

-- Retrieval must hand the caller the citation with the passage. Adding the columns to the RETURN
-- shape of both halves keeps the one-predicate rule (0072) intact: the WHERE clause below is still
-- byte-identical between them, and still the only thing deciding visibility.
DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int);
DROP FUNCTION IF EXISTS public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int);

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

-- 0064 house pattern: Supabase grants EXECUTE to anon and authenticated on every NEW function, and
-- these were just re-created. Revoking from PUBLIC alone does not remove those grants.
REVOKE ALL ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
