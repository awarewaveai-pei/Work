-- Behavioural assertions for 0098 (social writes), run by 0098_social_writes-local-verify.sh after 0096 + 0098 on a
-- throwaway Postgres. One block per promise in the 0098 header.
SET plpgsql.check_asserts = on;

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

SET ROLE service_role;
DO $$
DECLARE
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  acc_a uuid; acc_b uuid; acc_a2 uuid; m_a uuid; p uuid; p2 uuid; t1 uuid; l uuid; v int; v2 int; n int;
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT id INTO acc_a FROM public.social_accounts WHERE organization_id = a LIMIT 1;
  SELECT id INTO acc_b FROM public.social_accounts WHERE organization_id = b LIMIT 1;
  INSERT INTO public.social_media (organization_id, kind, file_name, storage_path, created_by)
    VALUES (a, 'image', 'x.png', 'brand-a/x.png', 'verify') RETURNING id INTO m_a;

  -- create with children: one row, version 1, audit 'create'
  SELECT saved_post_id, saved_version INTO p, v FROM public.social_save_post(a, NULL, NULL, '{"body":"hello"}',
    jsonb_build_array(jsonb_build_object('account_id', acc_a)), jsonb_build_array(jsonb_build_object('media_id', m_a, 'alt_text', 'alt')), 'verify');
  ASSERT v = 1, format('new post version %s', v);
  ASSERT (SELECT count(*) FROM public.social_post_targets WHERE post_id = p) = 1, 'target saved with the post';
  ASSERT (SELECT action FROM public.social_audit_log WHERE post_id = p ORDER BY id DESC LIMIT 1) = 'create', 'create audited';

  -- edit replaces children and bumps version once
  SELECT saved_version INTO v2 FROM public.social_save_post(a, p, v, '{"body":"hello 2"}', '[]', NULL, 'verify');
  ASSERT v2 = v + 1, format('edit bumps version once (%s -> %s)', v, v2);
  ASSERT (SELECT count(*) FROM public.social_post_targets WHERE post_id = p) = 0, 'targets replaced';
  ASSERT (SELECT count(*) FROM public.social_post_media WHERE post_id = p) = 1, 'media left alone when not sent';
  ASSERT (SELECT body FROM public.social_posts WHERE id = p) = 'hello 2', 'body saved';

  -- a stale version is refused (two editors), nothing changes
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{"body":"stale"}', NULL, NULL, 'verify')$q$, a, p, v),
    'SC409', 'stale version');
  ASSERT (SELECT body FROM public.social_posts WHERE id = p) = 'hello 2', 'stale save left the post alone';

  -- another brand cannot save, target or state-change this post
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{"body":"x"}', NULL, NULL, 'verify')$q$, b, p, v2),
    'SC404', 'other brand edit');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{}', %L, NULL, 'verify')$q$,
    a, p, v2, jsonb_build_array(jsonb_build_object('account_id', acc_b))), NULL, 'target on another brand''s account');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_set_state(%L, %L, %s, 'deleted', NULL, NULL, NULL, 'verify', 'delete', NULL)$q$, b, p, v2),
    'SC404', 'other brand state change');

  -- state change with audit; the shape checks of 0096 still hold (scheduled needs a time)
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_set_state(%L, %L, %s, 'scheduled', NULL, NULL, NULL, 'verify', 'schedule', NULL)$q$, a, p, v2),
    '23514', 'scheduled without a time');
  SELECT saved_version INTO v FROM public.social_set_state(a, p, v2, 'scheduled', now() + interval '1 day', NULL, NULL, 'verify', 'schedule', '{"note":"go"}');
  ASSERT (SELECT state FROM public.social_posts WHERE id = p) = 'scheduled', 'scheduled';
  ASSERT (SELECT detail->>'from' FROM public.social_audit_log WHERE post_id = p ORDER BY id DESC LIMIT 1) = 'draft', 'transition audited with from';

  -- delete sets deleted_at; restore clears it
  SELECT saved_version INTO v FROM public.social_set_state(a, p, v, 'deleted', now() + interval '1 day', NULL, NULL, 'verify', 'delete', NULL);
  ASSERT (SELECT deleted_at IS NOT NULL FROM public.social_posts WHERE id = p), 'deleted_at set';
  -- a deleted post is not editable
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{"body":"x"}', NULL, NULL, 'verify')$q$, a, p, v),
    'SC409', 'edit of a deleted post');
  SELECT saved_version INTO v FROM public.social_set_state(a, p, v, 'draft', NULL, NULL, NULL, 'verify', 'restore', NULL);
  ASSERT (SELECT deleted_at IS NULL AND state = 'draft' FROM public.social_posts WHERE id = p), 'restore clears deleted_at';

  -- one open connect attempt per brand
  INSERT INTO public.social_connect_attempts (organization_id, platform, known_integration_ids, started_by) VALUES (a, 'bluesky', '{}', 'verify');
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_connect_attempts (organization_id, platform, known_integration_ids, started_by) VALUES (%L, 'facebook', '{}', 'verify')$q$, a),
    '23505', 'second open attempt');
  UPDATE public.social_connect_attempts SET outcome = 'expired', resolved_at = now() WHERE organization_id = a;
  INSERT INTO public.social_connect_attempts (organization_id, platform, known_integration_ids, started_by) VALUES (a, 'facebook', '{}', 'verify');
  SELECT count(*) INTO n FROM public.social_connect_attempts WHERE organization_id = a;
  ASSERT n = 2, 'a closed attempt frees the brand';
  -- a new channel is matched by time across the whole Postiz workspace: while brand a waits for one, brand b cannot
  -- start one (it would be attached to whichever brand looks first); b may still reconnect its own channel
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_connect_attempts (organization_id, platform, known_integration_ids, started_by) VALUES (%L, 'facebook', '{}', 'verify')$q$, b),
    '23505', 'two brands connecting a new channel at once');
  INSERT INTO public.social_connect_attempts (organization_id, platform, refresh_account_id, known_integration_ids, started_by) VALUES (b, 'facebook', acc_b, '{}', 'verify');
  -- only a connected attempt names an account (a connected one keeps its row when the account is later deleted)
  PERFORM pg_temp.must_fail(format($q$UPDATE public.social_connect_attempts SET outcome = 'expired', resolved_at = now(), account_id = %L WHERE organization_id = %L AND outcome IS NULL$q$, acc_a, a),
    '23514', 'expired attempt naming an account');

  -- a sent target keeps its row and write-back: an unchanged save leaves it alone, changing or removing it is refused,
  -- the post's own text is frozen, the other targets stay editable (review 2026-10-15: delete+insert erased what was sent)
  INSERT INTO public.social_accounts (organization_id, postiz_integration_id, platform, label) VALUES (a, 'int-x-a', 'x', 'x a') RETURNING id INTO acc_a2;
  SELECT saved_post_id, saved_version INTO p2, v FROM public.social_save_post(a, NULL, NULL, '{"body":"two"}',
    jsonb_build_array(jsonb_build_object('account_id', acc_a), jsonb_build_object('account_id', acc_a2)), NULL, 'verify');
  UPDATE public.social_post_targets SET state = 'published', postiz_post_id = 'pz-1', release_url = 'https://x.test/1' WHERE post_id = p2 AND account_id = acc_a;
  SELECT id INTO t1 FROM public.social_post_targets WHERE post_id = p2 AND account_id = acc_a;
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{"body":"two, fixed"}', NULL, NULL, 'verify')$q$, a, p2, v),
    'SC409', 'rewriting text that already went out');
  SELECT saved_version INTO v FROM public.social_save_post(a, p2, v, '{"body":"two","notes":"internal"}',
    jsonb_build_array(jsonb_build_object('account_id', acc_a), jsonb_build_object('account_id', acc_a2, 'custom_body', 'x only')), NULL, 'verify');
  ASSERT (SELECT id = t1 AND postiz_post_id = 'pz-1' AND state = 'published' FROM public.social_post_targets WHERE post_id = p2 AND account_id = acc_a),
    'the sent target kept its row and write-back';
  ASSERT (SELECT custom_body FROM public.social_post_targets WHERE post_id = p2 AND account_id = acc_a2) = 'x only', 'an unsent target stays editable';
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{}', %L, NULL, 'verify')$q$,
    a, p2, v, jsonb_build_array(jsonb_build_object('account_id', acc_a2))), 'SC409', 'removing a sent target');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{}', %L, NULL, 'verify')$q$,
    a, p2, v, jsonb_build_array(jsonb_build_object('account_id', acc_a, 'custom_body', 'rewritten'), jsonb_build_object('account_id', acc_a2))),
    'SC409', 'rewriting a sent target');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{}', %L, NULL, 'verify')$q$,
    a, p2, v, jsonb_build_array(jsonb_build_object('account_id', acc_a), jsonb_build_object('account_id', acc_a, 'custom_body', 'sneaked'))),
    '22023', 'the same account twice (the second copy would rewrite the sent target)');
  -- a failed target stays editable: C5 clears its Postiz post before sending it again (review 2026-10-15 N1)
  UPDATE public.social_post_targets SET state = 'error', postiz_post_id = 'pz-2', error = 'rejected' WHERE post_id = p2 AND account_id = acc_a2;
  SELECT saved_version INTO v FROM public.social_save_post(a, p2, v, '{}',
    jsonb_build_array(jsonb_build_object('account_id', acc_a), jsonb_build_object('account_id', acc_a2, 'custom_body', 'x, shorter')), NULL, 'verify');
  ASSERT (SELECT custom_body FROM public.social_post_targets WHERE post_id = p2 AND account_id = acc_a2) = 'x, shorter', 'a failed target was fixed';
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{}', %L, NULL, 'verify')$q$,
    a, p2, v, jsonb_build_array(jsonb_build_object('account_id', acc_a))), 'SC409', 'removing a failed target that still has its Postiz post');
  PERFORM pg_temp.must_fail(format($q$SELECT * FROM public.social_save_post(%L, %L, %s, '{}', NULL, %L, 'verify')$q$,
    a, p2, v, jsonb_build_array(jsonb_build_object('media_id', m_a))), 'SC409', 'changing the media after it went out');

  -- a list and its accounts save together: a refused account leaves the list exactly as it was
  l := public.social_save_list(a, NULL, 'FAQ', '{1,3}', '10:00', true, ARRAY[acc_a]);
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_list(%L, %L, 'renamed', '{2}', '11:00', true, %L)$q$, a, l, ARRAY[acc_a2, acc_b]),
    '23503', 'a list sending to another brand''s account');
  ASSERT (SELECT name = 'FAQ' AND weekdays = '{1,3}' FROM public.social_lists WHERE id = l), 'the refused save left the list';
  ASSERT (SELECT array_agg(account_id) FROM public.social_list_accounts WHERE list_id = l) = ARRAY[acc_a], 'and its accounts';
  PERFORM public.social_save_list(a, l, 'FAQ 2', '{2}', '11:00', true, ARRAY[acc_a2]);
  ASSERT (SELECT array_agg(account_id) FROM public.social_list_accounts WHERE list_id = l) = ARRAY[acc_a2], 'account set replaced';
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_list(%L, %L, 'x', '{}', '10:00', false, '{}')$q$, b, l), 'SC404', 'another brand''s list');
  RAISE NOTICE 'SOCIAL_0098_BEHAVIOUR_OK';
END $$;
RESET ROLE;

-- nobody but service_role may call the write functions
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.social_save_post(uuid, uuid, integer, jsonb, jsonb, jsonb, text)', 'execute'), 'anon cannot save';
  ASSERT NOT has_function_privilege('authenticated', 'public.social_set_state(uuid, uuid, integer, text, timestamptz, uuid, integer, text, text, jsonb)', 'execute'), 'authenticated cannot change state';
  ASSERT NOT has_function_privilege('anon', 'public.social_save_list(uuid, uuid, text, smallint[], time, boolean, uuid[])', 'execute'), 'anon cannot save a list';
  ASSERT NOT has_table_privilege('anon', 'public.social_connect_attempts', 'select'), 'anon cannot read attempts';
  RAISE NOTICE 'SOCIAL_0098_ACCESS_OK';
END $$;
