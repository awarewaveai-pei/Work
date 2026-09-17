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
  ('space_other', '55555555-5555-4555-8555-555555555555'),
  -- 0076 keyword-retrieval fixtures
  ('kwfam1', '66666666-6666-4666-8666-666666666666'),
  ('kwfam2', '77777777-7777-4777-8777-777777777777'),
  ('kwfam3', '88888888-8888-4888-8888-888888888888'),
  ('kwfam4', '99999999-9999-4999-8999-999999999999');

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
-- p_include_sensitive DEFAULT true: every existing call site below predates migration 0083 and
-- exercises the pre-0083 behaviour (a viewer sees its own org's sensitive docs) -- assertion block 16
-- below is the only one that passes false explicitly.
CREATE OR REPLACE FUNCTION pg_temp.vec_titles(
  p_scope uuid[], p_spaces uuid[], p_viewer uuid, p_as_of timestamptz, p_model text,
  p_include_sensitive boolean DEFAULT true
) RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(s.title ORDER BY s.title), ARRAY[]::text[])
  FROM public.cs_match_chunks(p_scope, p_spaces, p_viewer, p_as_of, p_model, pg_temp.vec(), 50, p_include_sensitive) m
  JOIN public.cs_knowledge_sources s ON s.id = m.source_id
$$;

-- p_raw_query DEFAULT '' (0086): every call site before that migration's own assertion block passes
-- only p_term, exercising documents whose keyword_mode stays at the column default ('inherit') with
-- no tenant default set -- exact_mode evaluates to false for all of them, so the added p_raw_query
-- gate is a no-op and every assertion above keeps testing exactly what it always has.
CREATE OR REPLACE FUNCTION pg_temp.kw_titles(
  p_scope uuid[], p_spaces uuid[], p_viewer uuid, p_as_of timestamptz, p_model text, p_term text DEFAULT 'kbmarker',
  p_include_sensitive boolean DEFAULT true, p_raw_query text DEFAULT ''
) RETURNS text[] LANGUAGE sql AS $$
  SELECT COALESCE(array_agg(s.title ORDER BY s.title), ARRAY[]::text[])
  FROM public.cs_match_chunks_keyword(p_scope, p_spaces, p_viewer, p_as_of, p_model, p_term, 50, p_include_sensitive, p_raw_query) m
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
  --     this assertion able to fail. Signature includes 0083's trailing `boolean` -- the pre-0083
  --     7-arg signature no longer exists once 0083 is applied, and has_function_privilege() on a
  --     nonexistent signature raises an error rather than returning false.
  --     cs_match_chunks_keyword's signature below is the POST-0086 9-arg one (trailing `,text` for
  --     p_raw_query) -- 0086 drops the 8-arg signature this assertion used to name, same reasoning.
  ASSERT NOT has_function_privilege('anon', 'public.cs_match_chunks(uuid[],uuid[],uuid,timestamptz,text,vector,int,boolean)', 'EXECUTE'),
    'anon can execute cs_match_chunks';
  ASSERT NOT has_function_privilege('anon', 'public.cs_match_chunks_keyword(uuid[],uuid[],uuid,timestamptz,text,text,int,boolean,text)', 'EXECUTE'),
    'anon can execute cs_match_chunks_keyword';
  ASSERT NOT has_function_privilege('authenticated', 'public.cs_match_chunks(uuid[],uuid[],uuid,timestamptz,text,vector,int,boolean)', 'EXECUTE'),
    'authenticated can execute cs_match_chunks';

  RAISE NOTICE 'KB_VERIFY_CONSTRAINTS_OK — versioning, tenancy and grant assertions passed';
END $$;

-- ── 0083: is_sensitive gets a real audience gate ──────────────────────────────
DO $$
DECLARE
  a       uuid := pg_temp.uid('orgA');
  b       uuid := pg_temp.uid('orgB');
  m       text := 'text-embedding-3-small';
  titles  text[];
  kw      text[];
BEGIN
  -- 16. Every existing caller (p_include_sensitive omitted ⇒ SQL default true) sees EXACTLY what it
  --     saw before 0083 -- this is the "additive parameter, zero behaviour change for callers who
  --     don't ask" contract the migration's header promises.
  ASSERT pg_temp.vec_titles(ARRAY[a, b], NULL, b, NULL, m) @> ARRAY['B secret'],
    '0083 regression: omitting p_include_sensitive must keep pre-0083 behaviour (own sensitive doc visible)';

  -- 17. THE fix: a caller viewing ITS OWN org's sensitive doc, but explicitly declining sensitive
  --     content, must not receive it. Before 0083 there was no way to express this at all -- the
  --     predicate's only gate was `c.organization_id = p_viewer`, true for every real caller.
  titles := pg_temp.vec_titles(ARRAY[b], NULL, b, NULL, m, false);
  ASSERT NOT (titles @> ARRAY['B secret']),
    'includeSensitive=false did not exclude a sensitive doc from its own org''s viewer';

  -- 18. Non-sensitive documents are never affected by the flag either direction.
  ASSERT pg_temp.vec_titles(ARRAY[a], NULL, a, NULL, m, false) @> ARRAY['policy v2'],
    'includeSensitive=false incorrectly hid a non-sensitive document';

  -- 19. The existing tenant-chain protection (assertion 3) still composes correctly UNDER the new
  --     flag: true does not resurrect a cross-tenant leak that p_viewer was already blocking.
  ASSERT NOT (pg_temp.vec_titles(ARRAY[a, b], NULL, a, NULL, m, true) @> ARRAY['B secret']),
    'includeSensitive=true reopened the cross-tenant leak that p_viewer=own-org was already blocking';

  -- 20. Both retrieval halves agree under the new flag too -- same leak class as assertion 7.
  titles := pg_temp.vec_titles(ARRAY[b], NULL, b, NULL, m, false);
  kw := pg_temp.kw_titles(ARRAY[b], NULL, b, NULL, m, 'kbmarker', false);
  ASSERT titles = kw, format('vector/keyword sensitivity-gate visibility diverged: vector=%s keyword=%s', titles, kw);

  -- 21. The pre-0083 (7-arg) signatures must be gone, not shadowed by an overload -- same reasoning
  --     as assertion 8: PostgREST cannot disambiguate two functions with the same name if both exist.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cs_match_chunks'
      AND replace(oidvectortypes(p.proargtypes), ' ', '') = 'uuid,uuid,uuid,timestamptz,text,vector,int4'
  ), 'the pre-0083 cs_match_chunks(uuid,uuid,uuid,timestamptz,text,vector,int) still exists';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cs_match_chunks_keyword'
      AND replace(oidvectortypes(p.proargtypes), ' ', '') = 'uuid,uuid,uuid,timestamptz,text,text,int4'
  ), 'the pre-0083 cs_match_chunks_keyword(uuid,uuid,uuid,timestamptz,text,text,int) still exists';

  RAISE NOTICE 'KB_VERIFY_SENSITIVE_GATE_OK — is_sensitive audience gate (migration 0083) passed';
END $$;

-- ── Provenance, citation and the lock (0075) ─────────────────────────────────
DO $$
DECLARE
  a   uuid := pg_temp.uid('orgA');
  m   text := 'text-embedding-3-small';
  rec record;
  ok  boolean;
BEGIN
  -- 12. A crawled document keeps its label all the way to retrieval. Without this, a consumer
  --     cannot tell a vendor's marketing claim from a policy the operator wrote, and cannot wrap
  --     the quoted one before it reaches a prompt.
  UPDATE public.cs_knowledge_sources
     SET epistemic_type = 'EVIDENCE', authorship_state = 'SOURCE_QUOTATION',
         author = '客服中心', venue = 'shop.example.com', doi = NULL,
         canonical_url = 'https://shop.example.com/faq/returns'
   WHERE organization_id = a AND title = 'policy v2';

  SELECT * INTO rec FROM public.cs_match_chunks(ARRAY[a], NULL, a, NULL, m, pg_temp.vec(), 50) mc
  JOIN public.cs_knowledge_sources s ON s.id = mc.source_id
  WHERE s.title = 'policy v2' LIMIT 1;
  ASSERT rec.epistemic_type = 'EVIDENCE', 'retrieval lost the epistemic label';
  ASSERT rec.authorship_state = 'SOURCE_QUOTATION', 'retrieval lost the authorship label';
  ASSERT rec.author = '客服中心', 'retrieval lost the byline';
  ASSERT rec.canonical_url = 'https://shop.example.com/faq/returns', 'retrieval lost the citation url';

  -- 13. The keyword half returns the same attribution. One half that can quote and one that cannot
  --     would make a passage's usability depend on how the question was phrased.
  SELECT * INTO rec FROM public.cs_match_chunks_keyword(ARRAY[a], NULL, a, NULL, m, 'kbmarker', 50) mc
  JOIN public.cs_knowledge_sources s ON s.id = mc.source_id
  WHERE s.title = 'policy v2' LIMIT 1;
  ASSERT rec.epistemic_type = 'EVIDENCE', 'the keyword half returns no provenance';
  ASSERT rec.author = '客服中心', 'the keyword half returns no byline';

  -- 14. The vocabulary is enforced by the database, not by whoever is writing today.
  BEGIN
    UPDATE public.cs_knowledge_sources SET epistemic_type = 'PROBABLY_TRUE'
     WHERE organization_id = a AND title = 'policy v2';
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'an invented epistemic type was accepted';

  -- 15. LOCKED_FACT is only meaningful on a SOURCE_FACT; the pairing is a constraint because the
  --     thing it protects (a hand-written authoritative policy) is exactly what gets overwritten.
  BEGIN
    UPDATE public.cs_knowledge_sources SET locked = 'LOCKED_FACT'
     WHERE organization_id = a AND title = 'policy v2';  -- still EVIDENCE
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  ASSERT ok, 'a lock was accepted on a document that is not a SOURCE_FACT';

  UPDATE public.cs_knowledge_sources
     SET epistemic_type = 'SOURCE_FACT', authorship_state = 'HUMAN_ORIGINAL', locked = 'LOCKED_FACT'
   WHERE organization_id = a AND title = 'policy v2';
  SELECT * INTO rec FROM public.cs_match_chunks(ARRAY[a], NULL, a, NULL, m, pg_temp.vec(), 50) mc
  JOIN public.cs_knowledge_sources s ON s.id = mc.source_id WHERE s.title = 'policy v2' LIMIT 1;
  ASSERT rec.locked = 'LOCKED_FACT', 'retrieval does not report the lock, so no consumer can honour it';

  RAISE NOTICE 'KB_VERIFY_PROVENANCE_OK';
END $$;

-- ── 0076: the keyword half retrieves a real question, and ranks by relevance ──
DO $$
DECLARE
  a       uuid := pg_temp.uid('orgA');
  m       text := 'text-embedding-3-small';
  fam1    uuid := pg_temp.uid('kwfam1');
  fam2    uuid := pg_temp.uid('kwfam2');
  q       text;
  hits    int;
  top     text;
  topscore double precision;
BEGIN
  PERFORM pg_temp.add_doc(a, fam1, 1, 'active', 'returns',
    '客製化商品除瑕疵外恕不退換，退貨運費由買方負擔，瑕疵品由本店負擔退貨運費。');
  PERFORM pg_temp.add_doc(a, fam2, 1, 'active', 'hours',
    '我們的營業時間是週一到週五早上九點到下午六點，例假日不營業。');

  -- The bigram OR that lib/kb/keyword-query.ts builds from 「請問退貨運費要怎麼算」. Written out
  -- rather than generated so this file states the contract the TypeScript side must keep.
  q := '請問 OR 問退 OR 退貨 OR 貨運 OR 運費 OR 費要 OR 要怎 OR 怎麼 OR 麼算';

  SELECT count(*) INTO hits
  FROM public.cs_match_chunks_keyword(ARRAY[a], NULL, a, NULL, m, q, 50);
  -- Before 0076 this was 0: the whole question was matched as one literal string.
  ASSERT hits > 0, 'the keyword half found nothing for a question a person would actually ask';

  -- ORDER BY here, not just trusted from the function: the exact same anti-pattern this batch
  -- fixed in lib/kb/db.ts (matchChunksKeyword used to trust RPC row order instead of sorting
  -- explicitly) -- a JOIN can reorder rows regardless of the function's own internal ORDER BY,
  -- and this assertion is supposed to be proving ranking correctness, not planner behavior.
  SELECT s.title, k.score INTO top, topscore
  FROM public.cs_match_chunks_keyword(ARRAY[a], NULL, a, NULL, m, q, 50) k
  JOIN public.cs_knowledge_sources s ON s.id = k.source_id
  ORDER BY k.score DESC
  LIMIT 1;
  ASSERT top = 'returns', 'the most relevant document is not first: got ' || COALESCE(top, 'null');
  -- The score must reflect how many query terms the chunk actually contains. This assertion caught
  -- the first implementation, which used pgroonga_score() and returned 0 for every row whenever the
  -- planner chose a sequential scan -- i.e. always, on a table this size.
  ASSERT topscore >= 3, 'keyword ranking lost its score: got ' || COALESCE(topscore::text, 'null');

  -- A question with no term in common returns nothing, rather than everything.
  SELECT count(*) INTO hits
  FROM public.cs_match_chunks_keyword(ARRAY[a], NULL, a, NULL, m, '完全 OR 全無 OR 無關', 50);
  ASSERT hits = 0, 'an unrelated question matched documents';

  -- Latin still works: PGroonga keeps words whole, so this is not bigrammed.
  PERFORM pg_temp.add_doc(a, pg_temp.uid('kwfam3'), 1, 'active', 'shipping',
    'Shipping policy: orders ship within two business days worldwide.');
  SELECT count(*) INTO hits
  FROM public.cs_match_chunks_keyword(ARRAY[a], NULL, a, NULL, m, 'shipping OR policy', 50);
  ASSERT hits > 0, 'a Latin query found nothing';

  -- The whole reason this file exists: prove PGroonga is actually doing the matching, not a
  -- disguised substring scan that happens to produce the same rows on small fixtures. A half-width
  -- query can only match this full-width content through PGroonga's normalizer (verified against
  -- this exact image: pgroonga_normalize('ＳＨＩＰＰＩＮＧ') = 'shipping'); strpos()/ILIKE never
  -- would. If someone quietly swaps `&@~` for a substring check, this goes to 0 and says so.
  PERFORM pg_temp.add_doc(a, pg_temp.uid('kwfam4'), 1, 'active', 'fullwidth',
    '訂單 ＳＨＩＰＰＩＮＧ 已出貨，感謝您的耐心等候。');
  SELECT count(*) INTO hits
  FROM public.cs_match_chunks_keyword(ARRAY[a], NULL, a, NULL, m, 'shipping', 50);
  ASSERT hits > 0, 'a half-width query missed full-width content -- PGroonga is not the one matching';

  -- Ranking must use the SAME normalizer as matching. Isolated to just this one document (rather
  -- than comparing rank against the 'shipping' fixture above) because both would score 1 under
  -- EITHER normalizer -- "Shipping policy" is a plain ASCII substring even without folding, so that
  -- comparison would pass for the wrong reason. This one can only score >0 via pgroonga_normalize().
  SELECT k.score INTO topscore
  FROM public.cs_match_chunks_keyword(ARRAY[a], NULL, a, NULL, m, 'shipping', 50) k
  JOIN public.cs_knowledge_sources s ON s.id = k.source_id
  WHERE s.title = 'fullwidth';
  ASSERT topscore > 0, 'ranking used a different normalizer than matching -- a full-width-only match scored 0';

  RAISE NOTICE 'KB_VERIFY_KEYWORD_OK';
END $$;

-- ── 0085: nested KB folders (K2h) ───────────────────────────────────────────────
DO $$
DECLARE
  a        uuid := pg_temp.uid('orgA');
  b        uuid := pg_temp.uid('orgB');
  root_id  uuid;
  child_id uuid;
  gc_id    uuid;
  doc_id   uuid;
  desc_ids uuid[];
  ok       boolean;
BEGIN
  INSERT INTO public.cs_knowledge_folders (organization_id, name) VALUES (a, 'root') RETURNING id INTO root_id;
  INSERT INTO public.cs_knowledge_folders (organization_id, parent_id, name) VALUES (a, root_id, 'child') RETURNING id INTO child_id;
  INSERT INTO public.cs_knowledge_folders (organization_id, parent_id, name) VALUES (a, child_id, 'grandchild') RETURNING id INTO gc_id;

  -- 28. Cross-level filtering (K2h's own DoD, "資料夾巢狀可跨階層過濾"): root's descendants include
  --     itself and every level below it.
  SELECT array_agg(id) INTO desc_ids FROM public.cs_folder_descendants(a, root_id);
  ASSERT desc_ids @> ARRAY[root_id, child_id, gc_id], 'cs_folder_descendants(root) missed a level';

  -- 29. child's descendants do not leak its own ancestor.
  SELECT array_agg(id) INTO desc_ids FROM public.cs_folder_descendants(a, child_id);
  ASSERT desc_ids @> ARRAY[child_id, gc_id] AND NOT (desc_ids @> ARRAY[root_id]),
    'cs_folder_descendants(child) leaked an ancestor or missed a descendant';

  -- 30. Cross-tenant: a different org can never walk into this org's folder tree (base case of the
  --     recursive CTE requires organization_id to match, so it matches nothing and array_agg is NULL).
  SELECT array_agg(id) INTO desc_ids FROM public.cs_folder_descendants(b, root_id);
  ASSERT desc_ids IS NULL, 'a different tenant could read into this org''s folder tree';

  -- 31. UNIQUE NULLS NOT DISTINCT actually rejects a duplicate sibling name, not just documented to.
  BEGIN
    INSERT INTO public.cs_knowledge_folders (organization_id, parent_id, name) VALUES (a, root_id, 'child');
    ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  ASSERT ok, 'a duplicate sibling folder name was accepted';

  -- 32. A document filed into 'child' survives that folder being deleted -- unfiled (ON DELETE SET
  --     NULL), never removed; the folder's own empty subtree DOES cascade (ON DELETE CASCADE) -- two
  --     different ON DELETE actions on the same migration, both real, not just written down.
  doc_id := pg_temp.add_doc(a, gen_random_uuid(), 1, 'active', 'foldered doc', 'kbmarker 資料夾測試文件');
  UPDATE public.cs_knowledge_sources SET folder_id = child_id WHERE id = doc_id;
  DELETE FROM public.cs_knowledge_folders WHERE id = child_id;
  ASSERT (SELECT folder_id FROM public.cs_knowledge_sources WHERE id = doc_id) IS NULL,
    'deleting a folder left the document inside it dangling instead of unfiling it';
  ASSERT NOT EXISTS (SELECT 1 FROM public.cs_knowledge_folders WHERE id = gc_id),
    'deleting a folder did not cascade-delete its own empty subfolder';

  RAISE NOTICE 'KB_VERIFY_FOLDERS_OK';
END $$;

-- ── 0085: cs_folder_move — atomic check-and-write, cycle guard (K2h; critic finding 2026-09-17: a
--    prior JS-orchestrated read-then-write had a TOCTOU window where two concurrent moves could each
--    pass a cycle check before either write landed) ─────────────────────────────
DO $$
DECLARE
  a   uuid := pg_temp.uid('orgA');
  f1  uuid;
  f2  uuid;
  f3  uuid;
  res text;
BEGIN
  INSERT INTO public.cs_knowledge_folders (organization_id, name) VALUES (a, 'mv-1') RETURNING id INTO f1;
  INSERT INTO public.cs_knowledge_folders (organization_id, name) VALUES (a, 'mv-2') RETURNING id INTO f2;
  INSERT INTO public.cs_knowledge_folders (organization_id, parent_id, name) VALUES (a, f1, 'mv-3') RETURNING id INTO f3;

  -- 33. A legitimate move succeeds AND is actually persisted (not just reported ok).
  res := public.cs_folder_move(a, f2, f1);
  ASSERT res = 'ok', 'a legitimate move was refused: ' || res;
  ASSERT (SELECT parent_id FROM public.cs_knowledge_folders WHERE id = f2) = f1,
    'cs_folder_move reported ok but did not persist the new parent';

  -- 34. Self-move is refused.
  res := public.cs_folder_move(a, f1, f1);
  ASSERT res = 'would_create_cycle', 'a self-move was not refused: ' || res;

  -- 35. Moving an ancestor under its own descendant is refused (f1 is f3's parent via f1 -> f3), and
  --     the refused call did not mutate anything.
  res := public.cs_folder_move(a, f1, f3);
  ASSERT res = 'would_create_cycle', 'moving a folder under its own descendant was not refused: ' || res;
  ASSERT (SELECT parent_id FROM public.cs_knowledge_folders WHERE id = f1) IS NULL,
    'a refused move still mutated parent_id';

  -- 36. A nonexistent target parent is reported distinctly from a cycle.
  res := public.cs_folder_move(a, f1, gen_random_uuid());
  ASSERT res = 'parent_not_found', 'a nonexistent parent was not reported: ' || res;

  -- 37. A nonexistent folder-to-move is reported distinctly too.
  res := public.cs_folder_move(a, gen_random_uuid(), f1);
  ASSERT res = 'not_found', 'a nonexistent folder-to-move was not reported: ' || res;

  RAISE NOTICE 'KB_VERIFY_FOLDER_MOVE_OK';
END $$;

-- ── 0086: precise ("exact") vs long-tail ("fuzzy") keyword matching, per document (K2i) ──
DO $$
DECLARE
  a      uuid := pg_temp.uid('orgA');
  m      text := 'text-embedding-3-small';
  q      text := '請問 OR 問退 OR 退貨 OR 貨運 OR 運費 OR 費要 OR 要怎 OR 怎麼 OR 麼算';
  titles text[];
BEGIN
  -- 'returns' (added in the 0076 block above) contains "退貨運費" but never the full literal
  -- question "請問退貨運費要怎麼算" -- exactly the real-world "shares a bigram, not the whole phrase"
  -- case the operator described (2026-09-17: "有時候我要精確關鍵字").
  UPDATE public.cs_knowledge_sources SET keyword_mode = 'exact' WHERE organization_id = a AND title = 'returns';

  -- 22. Bigram overlap alone (q matches "退貨"/"貨運"/"運費" as literal substrings) is NOT enough in
  --     exact mode when the raw question itself never appears contiguously in the content.
  titles := pg_temp.kw_titles(ARRAY[a], NULL, a, NULL, m, q, true, '請問退貨運費要怎麼算');
  ASSERT NOT (titles @> ARRAY['returns']), 'exact mode matched on bigram overlap alone, without the literal phrase';

  -- 23. The same document DOES match once the raw query is a phrase actually present in its content.
  titles := pg_temp.kw_titles(ARRAY[a], NULL, a, NULL, m, q, true, '退貨運費');
  ASSERT titles @> ARRAY['returns'], 'exact mode failed to match a phrase that is literally in the content';

  -- 24. Empty raw query excludes an exact-mode document rather than matching everything -- guards the
  --     strpos(x, '') = 1 trap this migration's own header calls out explicitly.
  titles := pg_temp.kw_titles(ARRAY[a], NULL, a, NULL, m, q, true, '');
  ASSERT NOT (titles @> ARRAY['returns']), 'an empty raw query matched an exact-mode document';

  -- 25. Tenant default: reset 'returns' to 'inherit', opt orgA into an 'exact' tenant-wide default,
  --     and confirm the SAME exact-vs-fuzzy distinction now applies with zero change to the document.
  UPDATE public.cs_knowledge_sources SET keyword_mode = 'inherit' WHERE organization_id = a AND title = 'returns';
  -- jsonb_set only ever creates the LAST path element when missing -- an org whose metadata has no
  -- 'client_config' key at all (true here: this fixture's organizations rows were inserted with no
  -- metadata argument) makes a two-level jsonb_set({client_config,kbKeywordModeDefault}) a silent
  -- no-op, caught live running this exact assertion before this fix. One hop instead, merging
  -- whatever client_config already exists rather than assuming it's empty.
  UPDATE public.organizations
     SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{client_config}',
                               COALESCE(metadata -> 'client_config', '{}'::jsonb) || '{"kbKeywordModeDefault": "exact"}'::jsonb)
   WHERE id = a;
  titles := pg_temp.kw_titles(ARRAY[a], NULL, a, NULL, m, q, true, '請問退貨運費要怎麼算');
  ASSERT NOT (titles @> ARRAY['returns']), 'tenant-wide exact default did not apply to an inherit-mode document';
  titles := pg_temp.kw_titles(ARRAY[a], NULL, a, NULL, m, q, true, '退貨運費');
  ASSERT titles @> ARRAY['returns'], 'tenant-wide exact default did not match a phrase actually in the content';

  -- 26. A per-document override still wins over the tenant default: 'fuzzy' on 'returns' while the
  --     tenant default is still 'exact' from assertion 25.
  UPDATE public.cs_knowledge_sources SET keyword_mode = 'fuzzy' WHERE organization_id = a AND title = 'returns';
  titles := pg_temp.kw_titles(ARRAY[a], NULL, a, NULL, m, q, true, '');
  ASSERT titles @> ARRAY['returns'], 'a per-document fuzzy override did not win over the tenant exact default';

  RAISE NOTICE 'KB_VERIFY_KEYWORD_MODE_OK';
END $$;

ROLLBACK;
