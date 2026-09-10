-- 0072 — KB K1: wire versioning + freeze the retrieval predicate at six dimensions.
--
-- WHY NOW (agency-os/docs/knowledge-base/KNOWLEDGE_BASE_PLAN.md §1.5, ADR 011 §決策 16):
--   doc_family_id / source_version exist since 0051 but nothing writes or reads them, and NEITHER
--   retrieval half filters on status / version / space. Adding the missing dimensions later means
--   rebuilding the HNSW index, backfilling, and changing every call site — and valid_from cannot be
--   backfilled at all (nobody records "when did this become true" after the fact).
--
-- SIX PREDICATES (frozen here, §1.2): scope × space × status × sensitive × as_of × embed_model.
--   The predicate text is delimited by KB_VISIBILITY_PREDICATE markers and MUST stay byte-identical
--   in both retrieval halves. Divergence between the vector half and the keyword half is a
--   cross-tenant leak path ("vector cannot see it but keyword can"), so a mechanical test asserts
--   the two blocks are identical: next-admin/lib/kb/__tests__/kb-predicate-parity.test.ts.
--
-- APPLY ORDER — migration FIRST, deploy in the SAME maintenance window:
--   this migration DROPs the 0051 three-argument cs_match_chunks, and the new code calls the
--   six-argument one. Either half deployed alone makes every retrieval return zero chunks with no
--   error (customer service silently hands every conversation to a human). Do not split them.
--
-- ONE-TIME STEP AFTER APPLY — rebuild the family id of documents ingested before K1:
--   this migration repairs the chunk side (the UPDATE below), but a source row written before K1
--   carries a random doc_family_id, while lib/kb/family.ts now derives it as
--   uuidv5(namespace, org + "|" + canonicalKey). Re-ingesting such a document creates a SECOND
--   active document instead of version 2 of the existing one. Production held exactly one source
--   row when this was written, so the supported fix is: delete that document in the ops KB admin
--   and re-add it once, after deploying. If a future environment has many, backfill with a script
--   that calls docFamilyId() — the value cannot be recomputed in SQL.
--
-- DELIBERATELY NOT DONE HERE:
--   * No UNIQUE index on (organization_id, doc_family_id) WHERE status='active' — re-versioning
--     inserts the new version BEFORE archiving the old one (that order is the only protection
--     against a failed embed wiping a document's KB content; supabase-js has no transactions), so
--     two active rows exist for a moment by design. The (org, family, version) unique index below
--     is a different constraint and IS safe: it makes two concurrent ingests of the same document
--     collide on insert instead of racing each other into archiving both versions.
--   * embedding stays vector(1536). This migration only stops SAME-dimension models from polluting
--     each other; a different-dimension model needs its own table/column (K4).
--   * kb_document_relations is created but stays inert until K2b — the table is cheap now and a
--     second migration over a live vector table is not.
--   * No space_id column on cs_knowledge_chunks, although the plan §1.5 listed one. Visibility
--     reads the SOURCE's space (one owner per fact): a copy on the chunk would go stale the first
--     time K2 moves a document between spaces, and the document would then be visible in one space
--     and searchable in the other.
--
-- LOCKING: with production at one source row this is instant. ADD COLUMN (nullable, no default) is
-- catalog-only; the index builds take SHARE (blocking writes, not reads). Past ~100k chunks the
-- HNSW build in this transaction would block writes for minutes — split the index creation out and
-- use CREATE INDEX CONCURRENTLY (outside a transaction) before re-running the rest.
--
-- APPLY WITH (High risk — needs explicit go-ahead, AGENTS.md §3):
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0072_kb_versioning_and_retrieval_predicates.sql
-- Down migration: packages/db/scripts/0072_kb_versioning_and_retrieval_predicates_down.sql
-- Local verification (no prod needed): packages/db/scripts/kb-local-verify.sh

BEGIN;

-- ── §1.5 source columns ───────────────────────────────────────────────────────
-- All nullable ⇒ existing rows keep working with no backfill. NULL space_id means "the default
-- space" and NULL valid_from means "valid since forever"; both are resolved inside the predicate.
ALTER TABLE public.cs_knowledge_sources
  ADD COLUMN IF NOT EXISTS canonical_url  text,
  ADD COLUMN IF NOT EXISTS content_hash   text,
  ADD COLUMN IF NOT EXISTS space_id       uuid,
  ADD COLUMN IF NOT EXISTS valid_from     timestamptz,
  ADD COLUMN IF NOT EXISTS valid_to       timestamptz,
  ADD COLUMN IF NOT EXISTS language       text,
  ADD COLUMN IF NOT EXISTS doc_type       text,
  ADD COLUMN IF NOT EXISTS authority_tier text,
  ADD COLUMN IF NOT EXISTS domain_pack    text;

CREATE INDEX IF NOT EXISTS idx_cs_sources_canonical
  ON public.cs_knowledge_sources(organization_id, canonical_url);
CREATE INDEX IF NOT EXISTS idx_cs_sources_hash
  ON public.cs_knowledge_sources(organization_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_cs_sources_valid
  ON public.cs_knowledge_sources(organization_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_cs_sources_space
  ON public.cs_knowledge_sources(organization_id, space_id);

-- Two concurrent ingests of the same document both read "highest version = N" and both insert
-- N+1; each then archives the other's row, and the document ends up with ZERO active versions —
-- gone from retrieval and from the ops list, with no error anywhere. This index turns that race
-- into a failed insert, which the ingest path already handles by aborting and leaving the previous
-- version active.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cs_sources_family_version
  ON public.cs_knowledge_sources(organization_id, doc_family_id, source_version);

-- A chunk must belong to its source's tenant. The visibility predicate reads the tenant from the
-- chunk and the status/sensitivity/validity from the source, so a mismatched pair would be governed
-- by one tenant's status while being visible to another's scope. Nothing but application discipline
-- prevented that, and RLS on these tables is service_role only — no database backstop.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cs_sources_id_org
  ON public.cs_knowledge_sources(id, organization_id);

DO $$ BEGIN
  ALTER TABLE public.cs_knowledge_chunks
    ADD CONSTRAINT cs_knowledge_chunks_source_org_fkey
    FOREIGN KEY (source_id, organization_id)
    REFERENCES public.cs_knowledge_sources(id, organization_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One partial HNSW per embedding model: distances from different models are not comparable, so
-- mixing them in one index silently degrades retrieval with no error and no alert. 0051's
-- full-table HNSW stays in place for now — whether this partial index is actually chosen depends
-- on how the model name is bound at execution time, which needs an EXPLAIN against realistic data
-- volume before either index is dropped (tracked in TASKS.md).
CREATE INDEX IF NOT EXISTS idx_cs_chunks_hnsw_te3s
  ON public.cs_knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embed_model = 'text-embedding-3-small';

-- ── Repair the pre-K1 chunk rows ──────────────────────────────────────────────
-- Before K1, insertChunks wrote `doc_family_id = source_id` and `source_version = 1`, so the two
-- tables disagreed about which family a chunk belongs to — and no query would ever have raised an
-- error about it. Left alone, every family-scoped query written from K1 onward silently misses
-- these rows.
UPDATE public.cs_knowledge_chunks c
   SET doc_family_id  = s.doc_family_id,
       source_version = s.source_version
  FROM public.cs_knowledge_sources s
 WHERE s.id = c.source_id
   AND (c.doc_family_id IS DISTINCT FROM s.doc_family_id
        OR c.source_version IS DISTINCT FROM s.source_version);

-- ── §1.2c document relations (inert until K2b) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kb_document_relations (
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_doc        uuid        NOT NULL,
  to_doc          uuid        NOT NULL,
  kind            text        NOT NULL
    CHECK (kind IN ('supersedes','translates','cites','retracts','amends')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, from_doc, to_doc, kind)
);
ALTER TABLE public.kb_document_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.kb_document_relations;
CREATE POLICY "service_role only" ON public.kb_document_relations
  TO service_role USING (true) WITH CHECK (true);

-- ── Retrieval: vector half ────────────────────────────────────────────────────
-- The 0051 signature (p_org uuid, p_embedding, p_limit) is DROPPED, not left as an overload: an
-- unfiltered retrieval path that still works is exactly how old-version chunks would keep
-- surfacing after this migration.
DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid, vector, integer);

CREATE OR REPLACE FUNCTION public.cs_match_chunks(
  p_scope     uuid[],       -- tenant inheritance chain; today the caller passes [orgId]
  p_spaces    uuid[],       -- knowledge spaces; NULL ⇒ default space only (fail closed)
  p_viewer    uuid,         -- viewing node, for the sensitive gate
  p_as_of     timestamptz,  -- answer as of this instant; NULL ⇒ now()
  p_model     text,         -- embedding model; cross-model distances are meaningless
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

-- ── Retrieval: keyword half ───────────────────────────────────────────────────
-- Moved out of TypeScript (it used to be a client-side .ilike() with no source-side filters at all)
-- so both halves can carry the same predicate text. strpos() instead of ILIKE '%…%': no wildcard
-- metacharacters to escape, and CJK-safe — Postgres FTS tokenizes CJK poorly, which was the
-- original reason for a substring match. Ordering is deterministic so a replayed query fuses
-- identically.
--
-- `c.embedding IS NOT NULL` inside the shared predicate is deliberate even though the keyword half
-- does not need an embedding: identical visibility is worth more than keyword recall on rows the
-- vector half cannot see. Removing it here would "fix" nothing and break parity.
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

-- ── Grants (0064 house pattern — anon/authenticated, not just PUBLIC) ─────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new public function to anon and
-- authenticated EXPLICITLY, and `REVOKE … FROM PUBLIC` does not touch those grants (0064, verified
-- live against ks-aw-01 via pg_proc.proacl). Both functions here are new object identities — one
-- brand new, one DROP+CREATEd — so both would pick the default grants up. These functions take the
-- tenant scope as a PARAMETER and contain no auth.uid() check: the only thing standing between an
-- anon key holder and cross-tenant reads would be the tables' service_role-only RLS, which
-- 0051 itself says is scheduled to be relaxed in Phase 5.
REVOKE ALL ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
