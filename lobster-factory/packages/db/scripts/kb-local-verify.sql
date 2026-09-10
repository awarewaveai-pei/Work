-- Behavioural verification of migration 0072 (KB K1) against a REAL Postgres.
--
-- Everything here is asserted by querying, never by reading the schema: "the old version is
-- archived" is not the claim that matters, "the old version can no longer be retrieved" is.
-- Run through packages/db/scripts/kb-local-verify.sh (throwaway pgvector container, no prod).
--
-- Fixture: two tenants (A, B) with one document family each, plus the awkward rows —
-- a superseded version, a sensitive document, a non-default space, a foreign embedding model,
-- and a document whose validity window has closed.

\set ON_ERROR_STOP on

-- ASSERT is a no-op when plpgsql.check_asserts is off, and this file would then print
-- KB_VERIFY_OK while verifying nothing. Pin it here rather than trusting the server default.
SET plpgsql.check_asserts = on;

BEGIN;

CREATE TEMP TABLE t_ids (k text PRIMARY KEY, v uuid);
INSERT INTO t_ids (k, v) VALUES
  ('orgA', '11111111-1111-4111-8111-111111111111'),
  ('orgB', '22222222-2222-4222-8222-222222222222'),
  ('famA', '33333333-3333-4333-8333-333333333333'),
  ('famB', '44444444-4444-4444-8444-444444444444'),
  ('space_other', '55555555-5555-4555-8555-555555555555');

CREATE OR REPLACE FUNCTION pg_temp.uid(text) RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT v FROM t_ids WHERE k = $1 $$;

-- A constant 1536-dim vector: this test is about WHICH rows are visible, not about ranking.
CREATE OR REPLACE FUNCTION pg_temp.vec() RETURNS vector
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('[' || array_to_string(array_fill(0.1::float8, ARRAY[1536]), ',') || ']')::vector
$$;

CREATE OR REPLACE FUNCTION pg_temp.add_doc(
  p_org uuid, p_family uuid, p_version int, p_status text, p_title text, p_content text,
  p_sensitive boolean DEFAULT false, p_space uuid DEFAULT NULL,
  p_valid_from timestamptz DEFAULT NULL, p_valid_to timestamptz DEFAULT NULL,
  p_model text DEFAULT 'text-embedding-3-small', p_embedding vector DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_src uuid;
BEGIN
  INSERT INTO public.cs_knowledge_sources
    (organization_id, kind, title, doc_family_id, source_version, status, is_sensitive,
     space_id, valid_from, valid_to)
  VALUES (p_org, 'doc', p_title, p_family, p_version, p_status, p_sensitive,
          p_space, p_valid_from, p_valid_to)
  RETURNING id INTO v_src;

  -- No space_id on chunks: the source owns the space (one owner per fact).
  INSERT INTO public.cs_knowledge_chunks
    (organization_id, source_id, doc_family_id, source_version, content, embedding, embed_model)
  VALUES (p_org, v_src, p_family, p_version, p_content,
          COALESCE(p_embedding, pg_temp.vec()), p_model);

  RETURN v_src;
END $$;

-- ── Fixture ───────────────────────────────────────────────────────────────────
INSERT INTO public.organizations (id, slug, name) VALUES
  (pg_temp.uid('orgA'), 'kb-verify-a', 'KB verify A'),
  (pg_temp.uid('orgB'), 'kb-verify-b', 'KB verify B');

SELECT pg_temp.add_doc(pg_temp.uid('orgA'), pg_temp.uid('famA'), 1, 'archived', 'policy v1', 'kbmarker 退貨期限 7 天');
SELECT pg_temp.add_doc(pg_temp.uid('orgA'), pg_temp.uid('famA'), 2, 'active',   'policy v2', 'kbmarker 退貨期限 14 天');
SELECT pg_temp.add_doc(pg_temp.uid('orgB'), pg_temp.uid('famB'), 1, 'active',   'B policy',  'kbmarker B 家的政策');
SELECT pg_temp.add_doc(pg_temp.uid('orgB'), gen_random_uuid(), 1, 'active', 'B secret', 'kbmarker B 的機密',
                       true);
SELECT pg_temp.add_doc(pg_temp.uid('orgA'), gen_random_uuid(), 1, 'active', 'academic', 'kbmarker 學術論文',
                       false, pg_temp.uid('space_other'));
SELECT pg_temp.add_doc(pg_temp.uid('orgA'), gen_random_uuid(), 1, 'active', 'other model', 'kbmarker 別的模型',
                       false, NULL, NULL, NULL, 'bge-m3');
SELECT pg_temp.add_doc(pg_temp.uid('orgA'), gen_random_uuid(), 1, 'active', 'expired', 'kbmarker 已失效條款',
                       false, NULL, now() - interval '10 days', now() - interval '1 day');

-- ── Helpers that call the two halves exactly as lib/kb/db.ts does ─────────────
CREATE OR REPLACE FUNCTION pg_temp.vec_titles(
  p_scope uuid[], p_spaces uuid[], p_viewer uuid, p_as_of timestamptz, p_model text
) RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(s.title ORDER BY s.title), ARRAY[]::text[])
  FROM public.cs_match_chunks(p_scope, p_spaces, p_viewer, p_as_of, p_model, pg_temp.vec(), 50) m
  JOIN public.cs_knowledge_sources s ON s.id = m.source_id
$$;

CREATE OR REPLACE FUNCTION pg_temp.kw_titles(
  p_scope uuid[], p_spaces uuid[], p_viewer uuid, p_as_of timestamptz, p_model text, p_term text DEFAULT 'kbmarker'
) RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(s.title ORDER BY s.title), ARRAY[]::text[])
  FROM public.cs_match_chunks_keyword(p_scope, p_spaces, p_viewer, p_as_of, p_model, p_term, 50) m
  JOIN public.cs_knowledge_sources s ON s.id = m.source_id
$$;

-- ── Assertions ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  a       uuid := pg_temp.uid('orgA');
  b       uuid := pg_temp.uid('orgB');
  m       text := 'text-embedding-3-small';
  titles  text[];
  kw      text[];
BEGIN
  -- 1. Superseded version is genuinely unreachable, not merely flagged.
  titles := pg_temp.vec_titles(ARRAY[a], NULL, a, NULL, m);
  ASSERT titles @> ARRAY['policy v2'], format('v2 must be retrievable, got %s', titles);
  ASSERT NOT (titles @> ARRAY['policy v1']), format('archived v1 must NOT be retrievable, got %s', titles);

  -- 2. Scope chain: one node sees only itself; two nodes see both, and nothing else.
  ASSERT NOT (pg_temp.vec_titles(ARRAY[a], NULL, a, NULL, m) @> ARRAY['B policy']), 'orgA must not see orgB';
  titles := pg_temp.vec_titles(ARRAY[a, b], NULL, a, NULL, m);
  ASSERT titles @> ARRAY['policy v2', 'B policy'], format('chain must see both nodes, got %s', titles);

  -- 3. Sensitive documents do not travel along the chain to another viewer.
  ASSERT NOT (pg_temp.vec_titles(ARRAY[a, b], NULL, a, NULL, m) @> ARRAY['B secret']),
    'sensitive doc of orgB leaked to viewer orgA';
  ASSERT pg_temp.vec_titles(ARRAY[a, b], NULL, b, NULL, m) @> ARRAY['B secret'],
    'orgB must still see its own sensitive doc';

  -- 4. Space is fail-closed: no space requested ⇒ default space only.
  ASSERT NOT (pg_temp.vec_titles(ARRAY[a], NULL, a, NULL, m) @> ARRAY['academic']),
    'non-default space must not leak into an unqualified search';
  ASSERT pg_temp.vec_titles(ARRAY[a], ARRAY[pg_temp.uid('space_other')], a, NULL, m) @> ARRAY['academic'],
    'requested space must be searchable';

  -- 5. A chunk embedded by another model is not comparable and must not be returned.
  ASSERT NOT (pg_temp.vec_titles(ARRAY[a], NULL, a, NULL, m) @> ARRAY['other model']),
    'foreign embed_model leaked into the result set';
  ASSERT pg_temp.vec_titles(ARRAY[a], NULL, a, NULL, 'bge-m3') @> ARRAY['other model'],
    'the other model must be searchable when asked for';

  -- 6. as_of: an expired document is invisible now and visible as of a past instant.
  ASSERT NOT (pg_temp.vec_titles(ARRAY[a], NULL, a, NULL, m) @> ARRAY['expired']),
    'expired document is still being retrieved';
  ASSERT pg_temp.vec_titles(ARRAY[a], NULL, a, now() - interval '5 days', m) @> ARRAY['expired'],
    'as_of in the past must reach the document that was valid then';

  -- 7. THE leak class: both halves must see exactly the same documents, under every combination
  --    above. A mismatch means one half can be reached through a phrasing the other cannot.
  FOR titles, kw IN
    SELECT pg_temp.vec_titles(sc.scope, sc.spaces, sc.viewer, sc.as_of, sc.model),
           pg_temp.kw_titles(sc.scope, sc.spaces, sc.viewer, sc.as_of, sc.model)
    FROM (VALUES
      (ARRAY[a],    NULL::uuid[],                            a, NULL::timestamptz,          m),
      (ARRAY[a, b], NULL::uuid[],                            a, NULL::timestamptz,          m),
      (ARRAY[a, b], NULL::uuid[],                            b, NULL::timestamptz,          m),
      (ARRAY[a],    ARRAY[pg_temp.uid('space_other')],       a, NULL::timestamptz,          m),
      (ARRAY[a],    NULL::uuid[],                            a, now() - interval '5 days',  m),
      (ARRAY[a],    NULL::uuid[],                            a, NULL::timestamptz,          'bge-m3')
    ) AS sc(scope, spaces, viewer, as_of, model)
  LOOP
    ASSERT titles = kw, format('vector/keyword visibility diverged: vector=%s keyword=%s', titles, kw);
  END LOOP;

  -- 8. The unfiltered 0051 signature must be gone, not shadowed by an overload.
  -- Compared on argument TYPES, not on pg_get_function_identity_arguments(): that function
  -- includes parameter NAMES, so a string match against 'uuid, vector, integer' can never be true
  -- and the assertion would pass whether or not the old function still existed.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cs_match_chunks'
      AND replace(oidvectortypes(p.proargtypes), ' ', '') = 'uuid,vector,integer'
  ), 'the unfiltered cs_match_chunks(uuid, vector, integer) still exists';

  RAISE NOTICE 'KB_VERIFY_OK — all retrieval assertions passed';
END $$;

-- ── Constraints that turn silent corruption into a failed write ───────────────
DO $$
DECLARE
  a uuid := pg_temp.uid('orgA');
  b uuid := pg_temp.uid('orgB');
  ok boolean;
BEGIN
  -- 9. Two concurrent ingests of the same document both insert version N+1; without this
  --    constraint each then archives the other and the document loses every active version.
  BEGIN
    PERFORM pg_temp.add_doc(a, pg_temp.uid('famA'), 2, 'active', 'racing duplicate', 'kbmarker 競態');
    ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  ASSERT ok, 'a second source row with the same (org, family, version) was accepted';

  -- 10. A chunk must belong to its source's tenant, enforced by the database rather than by
  --     application discipline (RLS here is service_role only — nothing else would catch it).
  BEGIN
    INSERT INTO public.cs_knowledge_chunks
      (organization_id, source_id, doc_family_id, source_version, content, embedding, embed_model)
    SELECT b, s.id, s.doc_family_id, s.source_version, 'kbmarker 跨租戶 chunk', pg_temp.vec(),
           'text-embedding-3-small'
    FROM public.cs_knowledge_sources s
    WHERE s.organization_id = a LIMIT 1;
    ok := false;
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  ASSERT ok, 'a chunk was allowed to belong to a different tenant than its source';

  -- 11. The 0064 lockdown: these RPCs take the tenant scope as a parameter and check no identity,
  --     so an anon-key holder must not be able to execute them. kb-local-verify.sh reproduces
  --     Supabase's ALTER DEFAULT PRIVILEGES before applying the migration, which is what makes
  --     this assertion able to fail.
  ASSERT NOT has_function_privilege('anon', 'public.cs_match_chunks(uuid[],uuid[],uuid,timestamptz,text,vector,int)', 'EXECUTE'),
    'anon can execute cs_match_chunks';
  ASSERT NOT has_function_privilege('anon', 'public.cs_match_chunks_keyword(uuid[],uuid[],uuid,timestamptz,text,text,int)', 'EXECUTE'),
    'anon can execute cs_match_chunks_keyword';
  ASSERT NOT has_function_privilege('authenticated', 'public.cs_match_chunks(uuid[],uuid[],uuid,timestamptz,text,vector,int)', 'EXECUTE'),
    'authenticated can execute cs_match_chunks';

  RAISE NOTICE 'KB_VERIFY_CONSTRAINTS_OK — versioning, tenancy and grant assertions passed';
END $$;

ROLLBACK;
