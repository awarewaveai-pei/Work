-- Behavioural assertions for 0101 (rotation lists), run by 0101_social_rotation-local-verify.sh after 0096, 0098, 0100,
-- 0101 on a throwaway Postgres. One block per invariant in the 0101 header.
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
  acc uuid; l uuid; i1 uuid; i2 uuid; i3 uuid; mv uuid; v int; n int; slots timestamptz[]; m uuid; c int;
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT id INTO acc FROM public.social_accounts WHERE organization_id = a LIMIT 1;
  INSERT INTO public.social_media (organization_id, kind, file_name, storage_path, created_by) VALUES (a, 'image', 'x.png', 'a/x.png', 'verify') RETURNING id INTO m;
  l := public.social_save_list(a, NULL, 'FAQ', '{1,2,3,4,5,6,7}', '10:00', true, ARRAY[acc], 'ops:owner');

  -- three items in rotation, in order
  SELECT saved_post_id, saved_version INTO i1, v FROM public.social_save_post(a, NULL, NULL, '{"body":"one"}', jsonb_build_array(jsonb_build_object('account_id', acc, 'custom_body', 'one for bsky')), jsonb_build_array(jsonb_build_object('media_id', m, 'alt_text', 'alt')), 'verify');
  PERFORM public.social_set_state(a, i1, v, 'rotation', NULL, l, 0, 'verify', 'to_rotation', NULL);
  SELECT saved_post_id, saved_version INTO i2, v FROM public.social_save_post(a, NULL, NULL, '{"body":"two"}', jsonb_build_array(jsonb_build_object('account_id', acc)), NULL, 'verify');
  PERFORM public.social_set_state(a, i2, v, 'rotation', NULL, l, 1, 'verify', 'to_rotation', NULL);
  SELECT saved_post_id, saved_version INTO i3, v FROM public.social_save_post(a, NULL, NULL, '{"body":"three"}', jsonb_build_array(jsonb_build_object('account_id', acc)), NULL, 'verify');
  PERFORM public.social_set_state(a, i3, v, 'rotation', NULL, l, 2, 'verify', 'to_rotation', NULL);

  -- materialise four slots: items 1,2,3,1 in order, with the item's own text per channel and its media
  slots := ARRAY[now() + interval '1 day', now() + interval '2 days', now() + interval '3 days', now() + interval '4 days'];
  n := public.social_materialize_list(l, slots, 'system:verify');
  ASSERT n = 4, format('four posts (%s)', n);
  ASSERT (SELECT array_agg(body ORDER BY scheduled_at) FROM public.social_posts WHERE list_id = l AND state = 'scheduled') = ARRAY['one','two','three','one'], 'items in order, wrapping';
  ASSERT (SELECT t.custom_body FROM public.social_posts p JOIN public.social_post_targets t ON t.post_id = p.id WHERE p.list_id = l AND p.state = 'scheduled' ORDER BY p.scheduled_at LIMIT 1) = 'one for bsky', 'the item''s own channel text';
  ASSERT (SELECT count(*) FROM public.social_post_media pm JOIN public.social_posts p ON p.id = pm.post_id WHERE p.list_id = l AND p.state = 'scheduled') = 2, 'media copied (item one twice)';
  ASSERT (SELECT cursor FROM public.social_lists WHERE id = l) = 4, 'cursor counts items used';

  -- idempotent: the same slots again add nothing; a past slot is never materialised
  ASSERT public.social_materialize_list(l, slots, 'system:verify') = 0, 'same day twice';
  ASSERT public.social_materialize_list(l, ARRAY[now() - interval '1 hour'], 'system:verify') = 0, 'a past slot';

  -- a person edits one materialised post: it becomes manual (list_id gone) and a list save leaves it alone
  SELECT id, version INTO i1, v FROM public.social_posts WHERE list_id = l AND state = 'scheduled' ORDER BY scheduled_at LIMIT 1;
  PERFORM public.social_save_post(a, i1, v, '{"body":"edited by a person"}', NULL, NULL, 'verify');
  ASSERT (SELECT list_id IS NULL FROM public.social_posts WHERE id = i1), 'an edited materialised post is manual';
  ASSERT (SELECT list_id = l FROM public.social_posts WHERE id = i2), 'an item still in rotation keeps its list';

  -- a re-plan (save while active) never makes the edited slot again (origin_list_id), only the withdrawn ones
  PERFORM public.social_save_list(a, l, 'FAQ', '{1,2,3,4,5,6,7}', '10:00', true, ARRAY[acc], 'ops:owner');
  ASSERT (SELECT cursor FROM public.social_lists WHERE id = l) = 1, 'three items given back';
  ASSERT public.social_materialize_list(l, slots, 'system:verify') = 3, 'the three withdrawn slots again, not the edited one';
  ASSERT (SELECT count(*) FROM public.social_posts WHERE origin_list_id = l AND origin_slot = slots[1]) = 1, 'one post for the edited slot';
  -- a person moves one (list_id cleared, a new time): its slot is still taken on the next re-plan (review 2026-10-15)
  SELECT id, version INTO mv, v FROM public.social_posts WHERE list_id = l AND origin_slot = slots[4];
  PERFORM public.social_set_state(a, mv, v, 'scheduled', slots[4] + interval '3 hours', NULL, NULL, 'verify', 'schedule', NULL);
  PERFORM public.social_save_list(a, l, 'FAQ', '{1,2,3,4,5,6,7}', '10:00', true, ARRAY[acc], 'ops:owner');
  ASSERT public.social_materialize_list(l, slots, 'system:verify') = 2, 'only the two withdrawn slots again, not the edited or the moved one';
  ASSERT (SELECT count(*) FROM public.social_posts WHERE origin_list_id = l AND origin_slot = slots[4]) = 1, 'one post for the moved slot';
  -- a person deletes one (to the bin): its slot is not made again either
  SELECT id, version INTO mv, v FROM public.social_posts WHERE list_id = l AND origin_slot = slots[3];
  PERFORM public.social_set_state(a, mv, v, 'deleted', slots[3], NULL, NULL, 'verify', 'delete', NULL);
  PERFORM public.social_save_list(a, l, 'FAQ', '{1,2,3,4,5,6,7}', '10:00', true, ARRAY[acc], 'ops:owner');
  ASSERT public.social_materialize_list(l, slots, 'system:verify') = 1, 'only slot 2 again: edited, deleted and moved stay theirs';
  -- a due post the sender has not claimed yet is withdrawn too (review 2026-10-15)
  UPDATE public.social_posts SET scheduled_at = now() - interval '1 minute' WHERE list_id = l AND scheduled_at = slots[2];
  -- the schedule follows the list: a pause withdraws the unsent ones and gives their items back
  PERFORM public.social_save_list(a, l, 'FAQ', '{1,2,3,4,5,6,7}', '10:00', false, ARRAY[acc], 'ops:editor');
  ASSERT (SELECT count(*) FROM public.social_posts WHERE list_id = l AND state = 'scheduled') = 0, 'paused: unsent materialised posts withdrawn, the due one included';
  ASSERT (SELECT state FROM public.social_posts WHERE id = i1) = 'scheduled', 'the manual one stays';
  ASSERT (SELECT cursor FROM public.social_lists WHERE id = l) = 3, 'unsent items given back on pause';
  ASSERT public.social_materialize_list(l, slots, 'system:verify') = 0, 'a paused list materialises nothing';
  ASSERT (SELECT actor FROM public.social_audit_log WHERE action = 'list_save' ORDER BY id DESC LIMIT 1) = 'ops:editor', 'the saver is in the log';

  -- reorder: only the exact current items, in one go
  PERFORM public.social_reorder_list(a, l, ARRAY[i3, i2, (SELECT id FROM public.social_posts WHERE list_id = l AND state = 'rotation' AND body = 'one')], 'verify');
  ASSERT (SELECT array_agg(body ORDER BY list_position) FROM public.social_posts WHERE list_id = l AND state = 'rotation') = ARRAY['three','two','one'], 'reordered';
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_reorder_list(%L, %L, %L, 'verify')$q$, a, l, ARRAY[i3, i2]), 'SC409', 'a reorder missing an item');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_reorder_list(%L, %L, %L, 'verify')$q$, '00000000-0000-0000-0000-00000000000b', l, ARRAY[i3]), 'SC404', 'another brand''s list');

  -- delete: refused while it holds items
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_delete_list(%L, %L, 'ops:owner')$q$, a, l), 'SC409', 'deleting a list with items');
  FOR i2, v IN SELECT id, version FROM public.social_posts WHERE list_id = l AND state = 'rotation' LOOP
    PERFORM public.social_set_state(a, i2, v, 'draft', NULL, NULL, NULL, 'verify', 'from_rotation', NULL);
  END LOOP;
  PERFORM public.social_delete_list(a, l, 'ops:owner');
  ASSERT NOT EXISTS (SELECT 1 FROM public.social_lists WHERE id = l), 'deleted once empty';
  ASSERT (SELECT count(*) FROM public.social_audit_log WHERE action = 'list_save' AND detail->>'list_id' = l::text) = 5, 'each list save logged once';
  ASSERT (SELECT count(*) FROM public.social_audit_log WHERE action = 'list_delete' AND detail->>'list_id' = l::text) = 1, 'the delete logged once';
  RAISE NOTICE 'SOCIAL_0101_BEHAVIOUR_OK';
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.social_materialize_list(uuid, timestamptz[], text)', 'execute'), 'anon cannot materialise';
  ASSERT NOT has_function_privilege('authenticated', 'public.social_delete_list(uuid, uuid, text)', 'execute'), 'authenticated cannot delete lists';
  ASSERT (SELECT count(*) FROM pg_proc WHERE proname = 'social_save_list') = 1, 'one social_save_list (no PostgREST overload)';
  RAISE NOTICE 'SOCIAL_0101_ACCESS_OK';
END $$;
