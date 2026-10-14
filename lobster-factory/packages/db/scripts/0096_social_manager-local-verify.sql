-- Behavioural assertions for 0096 (social manager). Run by 0096_social_manager-local-verify.sh against a throwaway
-- Postgres after the 0011 fixture rows were copied. Each block is one invariant from the 0096 header; the db-expert
-- review of 2026-10-14 (C1, M1 a/b, M2, m1, m5, m6) has a case each.
SET plpgsql.check_asserts = on;

-- a statement that must fail with the given SQLSTATE (or any error when p_state is null)
CREATE FUNCTION pg_temp.must_fail(p_sql text, p_state text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF p_state IS NOT NULL AND SQLSTATE <> p_state THEN
      RAISE EXCEPTION '% failed with % (%), expected %', p_label, SQLSTATE, SQLERRM, p_state;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION '% was accepted but must be refused', p_label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO service_role;

DO $$
DECLARE
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  acc_a uuid; acc_b uuid; post_a uuid; post_b uuid; list_a uuid; media_a uuid; media_b uuid; v int; n int;
BEGIN
  -- the deferred FKs (target->account, media link->media) would only fire at this block's commit; check now so each
  -- refusal is caught by its own case. The brand-delete block below runs with the deferred default.
  SET CONSTRAINTS ALL IMMEDIATE;
  -- data copy from 0011: three rows in (one is X, a one-letter platform), old table untouched
  SELECT count(*) INTO n FROM public.social_accounts;
  ASSERT n = 3, format('expected 3 accounts copied from 0011, got %s', n);
  ASSERT EXISTS (SELECT 1 FROM public.social_accounts WHERE platform = 'x'), 'X (platform ''x'') copied';
  SELECT id INTO acc_a FROM public.social_accounts WHERE organization_id = a AND postiz_integration_id = 'int-bsky';
  SELECT id INTO acc_b FROM public.social_accounts WHERE organization_id = b AND postiz_integration_id = 'int-fb';
  ASSERT acc_a IS NOT NULL AND acc_b IS NOT NULL, 'copied accounts keep their org';
  ASSERT (SELECT status FROM public.social_accounts WHERE id = acc_b) = 'expired', 'status copied';
  ASSERT (SELECT count(*) FROM public.social_postiz_connections) = 3, '0011 rows untouched';

  -- one integration, one brand
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_accounts (organization_id, postiz_integration_id, platform)
    VALUES (%L, 'int-bsky', 'bluesky')$q$, b), '23505', 'same integration under a second brand');
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_accounts (organization_id, postiz_integration_id, platform)
    VALUES (%L, 'x1', 'Bad Platform')$q$, a), '23514', 'platform outside the identifier pattern');

  -- isolation: a brand-A post cannot target a brand-B account, nor use brand-B media
  INSERT INTO public.social_posts (organization_id, body, created_by) VALUES (a, 'hello', 'test') RETURNING id INTO post_a;
  INSERT INTO public.social_posts (organization_id, body, created_by) VALUES (b, 'hi', 'test') RETURNING id INTO post_b;
  INSERT INTO public.social_post_targets (organization_id, post_id, account_id) VALUES (a, post_a, acc_a);
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_post_targets (organization_id, post_id, account_id)
    VALUES (%L, %L, %L)$q$, a, post_a, acc_b), '23503', 'target with another brand''s account (claimed org A)');
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_post_targets (organization_id, post_id, account_id)
    VALUES (%L, %L, %L)$q$, b, post_a, acc_b), '23503', 'target with another brand''s account (claimed org B)');
  INSERT INTO public.social_media (organization_id, kind, file_name, storage_path, created_by)
    VALUES (b, 'image', 'b.jpg', 'social/b.jpg', 'test') RETURNING id INTO media_b;
  INSERT INTO public.social_media (organization_id, kind, file_name, storage_path, created_by)
    VALUES (a, 'image', 'a.jpg', 'social/a.jpg', 'test') RETURNING id INTO media_a;
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_post_media (post_id, media_id, organization_id)
    VALUES (%L, %L, %L)$q$, post_a, media_b, a), '23503', 'post using another brand''s media');
  INSERT INTO public.social_post_media (post_id, media_id, organization_id) VALUES (post_a, media_a, a);
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET organization_id = %L WHERE id = %L$q$, b, post_a),
    NULL, 'moving a post to another brand');

  -- state shape
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET state = 'scheduled' WHERE id = %L$q$, post_a), '23514', 'scheduled without a time');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET state = 'published', published_at = now() WHERE id = %L$q$, post_a), '23514', 'published without a time');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET state = 'published', scheduled_at = now() WHERE id = %L$q$, post_a), '23514', 'published without published_at');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET published_at = now() WHERE id = %L$q$, post_a), '23514', 'a draft carrying published_at');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET state = 'deleted' WHERE id = %L$q$, post_a), '23514', 'deleted without deleted_at');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET state = 'rotation' WHERE id = %L$q$, post_a), '23514', 'rotation without a list');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET link_url = 'javascript:alert(1)' WHERE id = %L$q$, post_a), '23514', 'link that is not http(s)');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET body = repeat('x', 100001) WHERE id = %L$q$, post_a), '23514', 'a body over the size cap');

  -- version goes up on every update
  SELECT version INTO v FROM public.social_posts WHERE id = post_a;
  UPDATE public.social_posts SET body = 'hello 2' WHERE id = post_a;
  ASSERT (SELECT version FROM public.social_posts WHERE id = post_a) = v + 1, 'version increments';
  UPDATE public.social_posts SET body = 'hello 3' WHERE id = post_a AND version = v;   -- stale editor
  ASSERT (SELECT body FROM public.social_posts WHERE id = post_a) = 'hello 2', 'a stale compare-and-set changes nothing';

  -- published is frozen: content, state, targets and media
  UPDATE public.social_posts SET state = 'scheduled', scheduled_at = now() + interval '1 day' WHERE id = post_a;
  UPDATE public.social_posts SET state = 'published', published_at = now() WHERE id = post_a;
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET body = 'edited' WHERE id = %L$q$, post_a), '23514', 'editing a published body');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET state = 'draft', published_at = null WHERE id = %L$q$, post_a), '23514', 'un-publishing');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_post_targets SET custom_body = 'x' WHERE post_id = %L$q$, post_a), '23514', 'editing a published target');
  INSERT INTO public.social_accounts (organization_id, postiz_integration_id, platform) VALUES (a, 'int-a-threads', 'threads');
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_post_targets (organization_id, post_id, account_id) VALUES (%L, %L, %L)$q$,
    a, post_a, (SELECT id FROM public.social_accounts WHERE postiz_integration_id = 'int-a-threads')), '23514', 'adding a target to a published post');
  PERFORM pg_temp.must_fail(format($q$DELETE FROM public.social_post_targets WHERE post_id = %L$q$, post_a), '23514', 'removing a published target');
  PERFORM pg_temp.must_fail(format($q$DELETE FROM public.social_post_media WHERE post_id = %L$q$, post_a), '23514', 'removing published media');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_post_media SET alt_text = 'x' WHERE post_id = %L$q$, post_a), '23514', 'editing published media');
  UPDATE public.social_post_targets SET state = 'published', release_url = 'https://bsky.app/p/1' WHERE post_id = post_a;  -- the sender's write-back
  ASSERT (SELECT release_url FROM public.social_post_targets WHERE post_id = post_a) = 'https://bsky.app/p/1', 'sender write-back allowed';
  -- delete, then restore: only back to published, never an editable draft (review M1 a)
  UPDATE public.social_posts SET state = 'deleted', deleted_at = now() WHERE id = post_a;
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET state = 'draft', deleted_at = null, body = 'EDITED' WHERE id = %L$q$, post_a), '23514', 'restoring a deleted published post as a draft');
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_posts SET body = 'EDITED' WHERE id = %L$q$, post_a), '23514', 'editing a deleted published post');
  UPDATE public.social_posts SET state = 'published', deleted_at = null WHERE id = post_a;
  ASSERT (SELECT state FROM public.social_posts WHERE id = post_a) = 'published', 'restore returns it as published';

  -- rotation lists
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_lists (organization_id, name, active) VALUES (%L, 'x', true)$q$, a), '23514', 'active list with no weekdays');
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_lists (organization_id, name, weekdays) VALUES (%L, 'x', '{0}')$q$, a), '23514', 'weekday 0');
  INSERT INTO public.social_lists (organization_id, name, weekdays, active) VALUES (a, 'FAQ', '{1,3}', true) RETURNING id INTO list_a;
  INSERT INTO public.social_list_accounts (list_id, account_id, organization_id) VALUES (list_a, acc_a, a);
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_list_accounts (list_id, account_id, organization_id) VALUES (%L, %L, %L)$q$, list_a, acc_b, a),
    '23503', 'list sending to another brand''s account');
  INSERT INTO public.social_posts (organization_id, body, state, list_id, list_position, created_by) VALUES (a, 'q1', 'rotation', list_a, 0, 'test');
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_posts (organization_id, body, state, list_id, list_position, created_by)
    VALUES (%L, 'q2', 'rotation', %L, 0, 'test')$q$, a, list_a), '23505', 'two items at one list position');
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_posts (organization_id, body, state, list_id, list_position, created_by)
    VALUES (%L, 'q3', 'rotation', %L, 1, 'test')$q$, b, list_a), '23503', 'item in another brand''s list');
  -- a run materialises a slot once (review m6)
  INSERT INTO public.social_posts (organization_id, body, state, list_id, scheduled_at, created_by) VALUES (a, 'q1', 'scheduled', list_a, '2026-10-19 10:00+08', 'rotation');
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_posts (organization_id, body, state, list_id, scheduled_at, created_by)
    VALUES (%L, 'q1', 'scheduled', %L, '2026-10-19 10:00+08', 'rotation')$q$, a, list_a), '23505', 'the same list slot materialised twice');
  PERFORM pg_temp.must_fail(format($q$DELETE FROM public.social_lists WHERE id = %L$q$, list_a), '23514', 'deleting a list that still holds items');
  DELETE FROM public.social_posts WHERE list_id = list_a AND state = 'rotation';
  DELETE FROM public.social_lists WHERE id = list_a;
  ASSERT (SELECT list_id FROM public.social_posts WHERE body = 'q1' AND state = 'scheduled') IS NULL, 'materialised post outlives its list';

  -- audit log is append-only even for the owner role
  INSERT INTO public.social_audit_log (organization_id, actor, action, post_id) VALUES (a, 'test', 'schedule', post_b);
  PERFORM pg_temp.must_fail($q$UPDATE public.social_audit_log SET actor = 'x'$q$, '42501', 'rewriting the audit log');

  RAISE NOTICE 'SOCIAL_0096_BEHAVIOUR_OK';
END $$;

-- deferred FKs still refuse a lone delete (checked here immediately; at commit otherwise)
DO $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM pg_temp.must_fail($q$DELETE FROM public.social_accounts WHERE postiz_integration_id = 'int-bsky'$q$, '23503', 'deleting a targeted account');
  PERFORM pg_temp.must_fail($q$DELETE FROM public.social_media WHERE file_name = 'a.jpg'$q$, '23503', 'deleting used media');
  RAISE NOTICE 'SOCIAL_0096_DEFERRED_OK';
END $$;

-- the service role (what the app uses) cannot rewrite, delete or truncate the audit log (review m1)
SET ROLE service_role;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.social_audit_log) = 1, 'service_role reads the audit log';
  PERFORM pg_temp.must_fail($q$UPDATE public.social_audit_log SET actor = 'x'$q$, '42501', 'service_role updating the audit log');
  PERFORM pg_temp.must_fail($q$DELETE FROM public.social_audit_log$q$, '42501', 'service_role deleting the audit log');
  PERFORM pg_temp.must_fail($q$TRUNCATE public.social_audit_log$q$, '42501', 'service_role truncating the audit log');
  RAISE NOTICE 'SOCIAL_0096_AUDIT_OK';
END $$;
RESET ROLE;

-- a brand that used the product can be deleted, with everything of its own (review M2)
DO $$
DECLARE c uuid := '00000000-0000-0000-0000-00000000000c'; acc uuid; p uuid; m uuid; t text; n int;
BEGIN
  INSERT INTO public.organizations (id, type, slug, name) VALUES (c, 'client', 'brand-c', 'Brand C');
  INSERT INTO public.social_accounts (organization_id, postiz_integration_id, platform) VALUES (c, 'int-c', 'threads') RETURNING id INTO acc;
  INSERT INTO public.social_posts (organization_id, body, created_by) VALUES (c, 'c', 'test') RETURNING id INTO p;
  INSERT INTO public.social_post_targets (organization_id, post_id, account_id) VALUES (c, p, acc);
  INSERT INTO public.social_media (organization_id, kind, file_name, storage_path, created_by) VALUES (c, 'image', 'c.jpg', 'social/c.jpg', 'test') RETURNING id INTO m;
  INSERT INTO public.social_post_media (post_id, media_id, organization_id) VALUES (p, m, c);
  UPDATE public.social_posts SET state = 'scheduled', scheduled_at = now() WHERE id = p;
  UPDATE public.social_posts SET state = 'published', published_at = now() WHERE id = p;
  INSERT INTO public.social_audit_log (organization_id, actor, action, post_id) VALUES (c, 'test', 'publish', p);
  INSERT INTO public.social_lists (organization_id, name) VALUES (c, 'L');
  INSERT INTO public.social_saved_texts (organization_id, body) VALUES (c, 'x');
  DELETE FROM public.organizations WHERE id = c;
  FOREACH t IN ARRAY array['social_accounts', 'social_lists', 'social_posts', 'social_post_targets', 'social_media',
                           'social_post_media', 'social_saved_texts', 'social_audit_log'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = %L', t, c) INTO n;
    ASSERT n = 0, format('%s kept %s rows of a deleted brand', t, n);
  END LOOP;
  RAISE NOTICE 'SOCIAL_0096_BRAND_DELETE_OK';
END $$;

-- the browser key reaches nothing
DO $$
DECLARE t text; bad text := '';
BEGIN
  FOREACH t IN ARRAY array['social_accounts', 'social_lists', 'social_list_accounts', 'social_posts', 'social_post_targets',
                           'social_media', 'social_post_media', 'social_saved_texts', 'social_brand_members', 'social_audit_log'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN bad := bad || t || ' (no RLS) '; END IF;
    IF has_table_privilege('anon', 'public.' || t, 'select') OR has_table_privilege('authenticated', 'public.' || t, 'insert') THEN
      bad := bad || t || ' (granted) ';
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'select,insert') THEN bad := bad || t || ' (service_role) '; END IF;
  END LOOP;
  ASSERT bad = '', 'access: ' || bad;
  RAISE NOTICE 'SOCIAL_0096_ACCESS_OK';
END $$;
