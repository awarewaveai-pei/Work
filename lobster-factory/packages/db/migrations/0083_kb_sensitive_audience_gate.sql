-- 0083 — is_sensitive gets a caller that can actually say no.
--
-- WHAT WAS WRONG (TASKS.md 2026-09-11, operator-confirmed fix 2026-09-12): the predicate
-- `(NOT s.is_sensitive OR c.organization_id = p_viewer)` was written for a TENANT TREE that does not
-- exist yet -- every real caller passes `viewer = scope[0]` (its own org), so the right side is
-- always true and the predicate is a no-op. The ops UI's "敏感" checkbox and red badge lead an
-- operator to expect it keeps a document out of the customer-service AI's answers; it does not.
--
-- THE FIX IS A NEW PARAMETER, NOT A REPLACEMENT: `p_viewer` still does real work (a sensitive
-- document does not flow DOWN a future tenant chain to a different viewing node) and that check
-- stays exactly as it was -- removing it now would be scope creep unrelated to this complaint, and
-- re-adding it later when tenant-tree work actually starts would just be another migration. What was
-- missing is a SEPARATE axis: even a viewer whose own org matches the document may still want
-- sensitive content excluded (the customer-service AI viewing its own org's KB). `p_include_sensitive`
-- is that axis, defaulted to `true` so every existing caller's behaviour is unchanged unless it
-- explicitly opts out.
--
-- New predicate: `(NOT s.is_sensitive OR (c.organization_id = p_viewer AND p_include_sensitive))`.
-- A sensitive chunk now needs BOTH the existing chain check AND the new opt-in to be visible.
--
-- Argument list changes ⇒ CREATE OR REPLACE cannot reuse the old signature (Postgres identifies a
-- function by name + argument TYPES; adding a parameter creates a new, overloaded signature that
-- PostgREST cannot disambiguate) -- DROP the old signature first, same pattern 0076 used when it
-- changed cs_match_chunks_keyword's RETURNS shape.
--
-- APPLY WITH (Medium risk -- additive parameter with a default, no data touched):
--   node scripts/apply-db-migration.mjs 0083
-- Down migration: packages/db/scripts/0083_kb_sensitive_audience_gate_down.sql (restores the
-- pre-0083 signatures verbatim from 0075/0076).

BEGIN;

DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int);

CREATE OR REPLACE FUNCTION public.cs_match_chunks(
  p_scope             uuid[],
  p_spaces            uuid[],
  p_viewer            uuid,
  p_as_of             timestamptz,
  p_model             text,
  p_embedding         vector(1536),
  p_limit             int DEFAULT 8,
  p_include_sensitive boolean DEFAULT true
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
    AND (NOT s.is_sensitive OR (c.organization_id = p_viewer AND p_include_sensitive))
    AND COALESCE(s.valid_from, '-infinity'::timestamptz) <= COALESCE(p_as_of, now())
    AND (s.valid_to IS NULL OR s.valid_to > COALESCE(p_as_of, now()))
    AND c.embed_model = p_model
    AND c.embedding IS NOT NULL
-- <<< KB_VISIBILITY_PREDICATE
  ORDER BY c.embedding <=> p_embedding
  LIMIT GREATEST(p_limit, 1);
$fn$;

DROP FUNCTION IF EXISTS public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int);

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

-- 0064 house pattern: Supabase grants EXECUTE to anon and authenticated on every NEW function.
REVOKE ALL ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
