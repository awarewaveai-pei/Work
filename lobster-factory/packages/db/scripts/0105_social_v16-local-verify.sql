-- Behavioural assertions for 0105 (V1.5 schema), run by 0105_social_v16-local-verify.sh after 0096-0103, a seed of
-- pre-0105 rows, and 0105 on a throwaway Postgres. One block per invariant in the 0105 header.
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

-- a third brand that the cascade block deletes at the end (every run makes its own)
INSERT INTO public.organizations (id, type, slug, name, default_timezone)
VALUES ('00000000-0000-0000-0000-0000000000cc', 'client', 'brand-c-' || floor(random() * 1e9)::text, 'Brand C', 'Asia/Taipei')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.social_accounts (organization_id, postiz_integration_id, platform, label)
VALUES ('00000000-0000-0000-0000-0000000000cc', 'int-c-' || floor(random() * 1e9)::text, 'facebook', 'c on fb');

SET ROLE service_role;
DO $$
DECLARE
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  acc uuid; acc_b uuid; med_b uuid; t1 uuid; t_b uuid; p uuid; v int; tpl uuid; tv int; c1 uuid; c2 uuid; n int; l uuid; item uuid;
  w int; slots timestamptz[]; rule uuid; rep uuid; it_a uuid; it_b uuid;
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT id INTO acc FROM public.social_accounts WHERE organization_id = a ORDER BY platform LIMIT 1;
  SELECT id INTO acc_b FROM public.social_accounts WHERE organization_id = b LIMIT 1;

  -- backfill: first_comment -> position 0 (the published post too), weekdays x send_time -> slots
  ASSERT (SELECT c.body FROM public.social_post_comments c JOIN public.social_posts q ON q.id = c.post_id
          WHERE q.body = 'seed-draft' AND c.position = 0) = 'first!', 'a draft''s first_comment is comment 0';
  ASSERT EXISTS (SELECT 1 FROM public.social_post_comments c JOIN public.social_posts q ON q.id = c.post_id
                 WHERE q.body = 'seed-published' AND q.published_at IS NOT NULL), 'a published post''s first_comment is comment 0';
  ASSERT (SELECT array_agg(s.weekday ORDER BY s.weekday) FROM public.social_list_slots s JOIN public.social_lists q ON q.id = s.list_id
          WHERE q.name = 'seed-list' AND s.send_time = '10:00') = ARRAY[1, 4]::smallint[], 'list weekdays x send_time are slots';

  -- old callers (7 / 8 arguments by position, the code deployed today) still work, and first_comment <-> comment 0
  SELECT saved_post_id, saved_version INTO p, v FROM public.social_save_post(a, NULL, NULL, '{"body":"old shape","first_comment":"hello"}',
    jsonb_build_array(jsonb_build_object('account_id', acc)), NULL, 'verify');
  ASSERT public.social_comments_json(p) = '[{"body":"hello","delay_minutes":0,"media_id":null}]'::jsonb, 'old first_comment makes comment 0';
  SELECT saved_version INTO v FROM public.social_save_post(a, p, v, '{}', NULL, NULL, 'verify',
    '[{"body":"one"},{"body":"two","delay_minutes":5}]'::jsonb, NULL);
  ASSERT (SELECT first_comment FROM public.social_posts WHERE id = p) = 'one', 'first_comment follows comment 0';
  ASSERT (SELECT delay_minutes FROM public.social_post_comments WHERE post_id = p AND position = 1) = 5, 'comment 1 keeps its delay';
  SELECT saved_version INTO v FROM public.social_save_post(a, p, v, '{"first_comment":"ONE"}', NULL, NULL, 'verify');
  ASSERT public.social_comments_json(p) = '[{"body":"ONE","delay_minutes":0,"media_id":null},{"body":"two","delay_minutes":5,"media_id":null}]'::jsonb,
    'an old caller edits comment 0 only';
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post(%L, %L, %s, '{}', NULL, NULL, 'v', '[{"body":"x","delay_minutes":2}]', NULL)$q$, a, p, v),
    '23514', 'a delay that is not 0/1/5/60');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post(%L, %L, %s, '{}', NULL, NULL, 'v', '[{"body":"  "}]', NULL)$q$, a, p, v),
    '23514', 'an empty comment');
  l := public.social_save_list(a, NULL, 'old list', '{2}', '09:00', true, ARRAY[acc], 'verify');
  ASSERT (SELECT count(*) FROM public.social_list_slots WHERE list_id = l AND weekday = 2 AND send_time = '09:00') = 1, 'an old list save makes its slot';
  RAISE NOTICE 'SOCIAL_0105_COMPAT_OK';

  -- comments are content: frozen once a target went out; a published post's rows cannot be touched
  UPDATE public.social_post_targets SET state = 'queued' WHERE post_id = p;
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post(%L, %L, %s, '{}', NULL, NULL, 'v', '[{"body":"changed"}]', NULL)$q$, a, p, v),
    'SC409', 'comments changed after a target went out');
  SELECT saved_version INTO v FROM public.social_save_post(a, p, v, '{"notes":"ok"}', NULL, NULL, 'verify',
    '[{"body":"ONE"},{"body":"two","delay_minutes":5}]'::jsonb, NULL);   -- the same comments: not a change
  PERFORM pg_temp.must_fail(format($q$INSERT INTO public.social_post_comments (organization_id, post_id, position, body)
    SELECT organization_id, id, 9, 'late' FROM public.social_posts WHERE body = 'seed-published'$q$), '23514', 'a comment on a published post');

  -- isolation: another brand's tag or comment media is refused (composite keys)
  t1 := public.social_save_tag(a, NULL, 'Promo', 'b', 'verify');
  t_b := public.social_save_tag(b, NULL, 'Promo', 'c', 'verify');   -- the same name in another brand is fine
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_tag(%L, NULL, ' promo ', 'a', 'v')$q$, a), '23505', 'a tag name twice in a brand');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_tag(%L, NULL, 'x', 'red', 'v')$q$, a), '23514', 'a colour that is not a token key');
  SELECT saved_post_id, saved_version INTO c1, w FROM public.social_save_post(a, NULL, NULL, '{"body":"tagged"}', NULL, NULL, 'verify', NULL, ARRAY[t1, t1]);
  ASSERT (SELECT array_agg(tag_id) FROM public.social_post_tags WHERE post_id = c1) = ARRAY[t1], 'tags saved once';
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post(%L, %L, %s, '{}', NULL, NULL, 'v', NULL, ARRAY[%L]::uuid[])$q$, a, c1, w, t_b),
    '23503', 'another brand''s tag');
  INSERT INTO public.social_media (organization_id, kind, file_name, storage_path, created_by) VALUES (b, 'image', 'b.png', 'b/b.png', 'verify') RETURNING id INTO med_b;
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post(%L, %L, %s, '{}', NULL, NULL, 'v', '[{"body":"x","media_id":"%s"}]', NULL)$q$, a, c1, w, med_b),
    '23503', 'another brand''s media in a comment');
  SELECT saved_version INTO w FROM public.social_save_post(a, c1, w, '{}', NULL, NULL, 'verify', NULL, '{}');
  ASSERT NOT EXISTS (SELECT 1 FROM public.social_post_tags WHERE post_id = c1), 'tags cleared';
  PERFORM public.social_delete_tag(b, t_b, 'verify');
  ASSERT (SELECT count(*) FROM public.social_audit_log WHERE action = 'tag' AND detail->>'tag_id' = t_b::text) = 2, 'tag create + delete logged';
  RAISE NOTICE 'SOCIAL_0105_CONTENT_OK';

  -- repeat series
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post(%L, NULL, NULL, '{"repeat":{"freq":"week","days":[],"end":"never"}}', NULL, NULL, 'v')$q$, a),
    '23514', 'a weekly series without days');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post(%L, NULL, NULL, '{"repeat":{"freq":"hourly","end":"never"}}', NULL, NULL, 'v')$q$, a),
    '23514', 'an unknown freq');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post(%L, NULL, NULL, '{"repeat":{"freq":"day","end":"count"}}', NULL, NULL, 'v')$q$, a),
    '23514', 'end=count without a count');
  -- the mock's own shape (social-manager-mock.html: every key present)
  SELECT saved_post_id, saved_version INTO tpl, tv FROM public.social_save_post(a, NULL, NULL,
    '{"body":"weekly","repeat":{"freq":"week","days":[2,4],"mday":13,"end":"never","count":8}}',
    jsonb_build_array(jsonb_build_object('account_id', acc, 'custom_body', 'own text')), NULL, 'verify', '[{"body":"c0"}]', ARRAY[t1]);
  slots := ARRAY[now() + interval '1 day', now() + interval '2 days', now() - interval '1 hour', now() + interval '30 minutes'];
  ASSERT public.social_repeat_materialize(a, tpl, slots, false, 'system:verify') = 0, 'a draft template makes no children';
  SELECT saved_version INTO tv FROM public.social_set_state(a, tpl, tv, 'scheduled', now() + interval '1 hour', NULL, NULL, 'verify', 'schedule', NULL);
  ASSERT public.social_repeat_materialize(a, tpl, slots, false, 'system:verify') = 2, 'two future slots after the template';
  ASSERT public.social_repeat_materialize(a, tpl, slots, false, 'system:verify') = 0, 'the same slots twice: once';
  SELECT id INTO c1 FROM public.social_posts WHERE repeat_of = tpl ORDER BY origin_slot LIMIT 1;
  SELECT id INTO c2 FROM public.social_posts WHERE repeat_of = tpl ORDER BY origin_slot DESC LIMIT 1;
  ASSERT (SELECT state = 'scheduled' AND version = 1 AND repeat IS NULL AND body = 'weekly' AND first_comment = 'c0' FROM public.social_posts WHERE id = c1),
    'a child is a scheduled copy';
  ASSERT (SELECT custom_body FROM public.social_post_targets WHERE post_id = c1) = 'own text', 'a child has the template''s targets';
  ASSERT public.social_comments_json(c1) = public.social_comments_json(tpl), 'a child has its comments';
  ASSERT EXISTS (SELECT 1 FROM public.social_post_tags WHERE post_id = c1 AND tag_id = t1), 'a child has its tags';
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post(%L, %L, 1, '{"repeat":{"freq":"day","end":"never"}}', NULL, NULL, 'v')$q$, a, c1),
    '23514', 'a child made a template');
  -- a person edits child 2; the template is saved: the untouched child goes, the edited one stays, its slot is never made again
  PERFORM public.social_save_post(a, c2, 1, '{"body":"edited child"}', NULL, NULL, 'verify');
  SELECT saved_version INTO tv FROM public.social_save_post(a, tpl, tv, '{"body":"weekly v2"}', NULL, NULL, 'verify');
  ASSERT NOT EXISTS (SELECT 1 FROM public.social_posts WHERE id = c1), 'the untouched child follows the template save';
  ASSERT (SELECT body FROM public.social_posts WHERE id = c2) = 'edited child', 'an edited child stays';
  ASSERT public.social_repeat_materialize(a, tpl, slots, true, 'system:verify') = 1, 'the refresh makes the withdrawn slot again';
  ASSERT (SELECT body FROM public.social_posts WHERE repeat_of = tpl AND id <> c2) = 'weekly v2', 'with the saved content';
  -- unscheduling the template (a state change) takes the untouched children back and makes no new ones
  SELECT saved_version INTO tv FROM public.social_set_state(a, tpl, tv, 'draft', NULL, NULL, NULL, 'verify', 'unschedule', NULL);
  ASSERT (SELECT count(*) FROM public.social_posts WHERE repeat_of = tpl) = 1, 'only the edited child left';
  ASSERT public.social_repeat_materialize(a, tpl, slots, true, 'system:verify') = 0, 'a draft template again makes none';
  -- stop the series (「全部」): the rule goes, untouched children with it
  SELECT saved_version INTO tv FROM public.social_set_state(a, tpl, tv, 'scheduled', now() + interval '1 hour', NULL, NULL, 'verify', 'schedule', NULL);
  ASSERT public.social_repeat_materialize(a, tpl, slots, true, 'system:verify') = 1, 'scheduled again';
  SELECT withdrawn INTO n FROM public.social_stop_repeat(a, tpl, tv, 'verify');
  ASSERT n = 1 AND (SELECT repeat IS NULL FROM public.social_posts WHERE id = tpl), 'stopped: rule gone, one withdrawn';
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_stop_repeat(%L, %L, %s, 'v')$q$, a, tpl, tv), 'SC409', 'a stale version');
  -- db-expert 2026-10-17: a post's own rule is its child (touches it); a child carries the template's rules; a series
  -- is not stopped while its template is being sent
  SELECT saved_post_id, saved_version INTO tpl, tv FROM public.social_save_post(a, NULL, NULL, '{"body":"rules","repeat":{"freq":"day","end":"never"}}',
    jsonb_build_array(jsonb_build_object('account_id', acc)), NULL, 'verify');
  PERFORM public.social_save_auto_rule(a, NULL, format('{"post_id":"%s","name":"own","trigger":"dm","platforms":["facebook"],"action":"reply"}', tpl)::jsonb, 'verify');
  ASSERT (SELECT version FROM public.social_posts WHERE id = tpl) = tv + 1, 'a rule touches its post';
  SELECT saved_version INTO tv FROM public.social_set_state(a, tpl, tv + 1, 'scheduled', now() + interval '1 hour', NULL, NULL, 'verify', 'schedule', NULL);
  ASSERT public.social_repeat_materialize(a, tpl, ARRAY[now() + interval '1 day', now() + interval '2 days'], false, 'system:verify') = 2, 'two children';
  SELECT id INTO c1 FROM public.social_posts WHERE repeat_of = tpl ORDER BY origin_slot LIMIT 1;
  ASSERT (SELECT name FROM public.social_auto_rules WHERE post_id = c1) = 'own', 'a child carries the template''s rules';
  PERFORM public.social_save_auto_rule(a, NULL, format('{"post_id":"%s","name":"child","trigger":"dm","platforms":["facebook"],"action":"reply"}', c1)::jsonb, 'verify');
  SELECT saved_version INTO tv FROM public.social_save_post(a, tpl, tv, '{"body":"rules v2"}', NULL, NULL, 'verify');
  ASSERT EXISTS (SELECT 1 FROM public.social_posts WHERE id = c1) AND (SELECT count(*) FROM public.social_posts WHERE repeat_of = tpl) = 1
    AND (SELECT count(*) FROM public.social_auto_rules WHERE post_id = c1) = 2, 'the child given a rule stays with both rules; the untouched one went';
  UPDATE public.social_posts SET state = 'queued' WHERE id = tpl;
  SELECT version INTO tv FROM public.social_posts WHERE id = tpl;
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_stop_repeat(%L, %L, %s, 'v')$q$, a, tpl, tv), 'SC409', 'stopping a series while its template is being sent');
  RAISE NOTICE 'SOCIAL_0105_REPEAT_OK';

  -- list slots: the grid; weekdays / send_time follow; materialised rotation posts get the item's comments and tags
  l := public.social_save_list(a, NULL, 'grid', NULL, NULL, true, ARRAY[acc], 'verify',
    '[{"weekday":1,"send_time":"18:00"},{"weekday":1,"send_time":"08:00"},{"weekday":3,"send_time":"12:00"}]');
  ASSERT (SELECT count(*) FROM public.social_list_slots WHERE list_id = l) = 3, 'three slots';
  ASSERT (SELECT weekdays = '{1,3}' AND send_time = '08:00' FROM public.social_lists WHERE id = l), 'legacy columns follow the slots';
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_list(%L, %L, 'grid', NULL, NULL, true, ARRAY[%L]::uuid[], 'v', '[]')$q$, a, l, acc),
    '23514', 'an active list without slots');
  SELECT saved_post_id, saved_version INTO item, w FROM public.social_save_post(a, NULL, NULL, '{"body":"item"}',
    jsonb_build_array(jsonb_build_object('account_id', acc)), NULL, 'verify', '[{"body":"item comment"}]', ARRAY[t1]);
  PERFORM public.social_set_state(a, item, w, 'rotation', NULL, l, 0, 'verify', 'to_rotation', NULL);
  ASSERT public.social_materialize_list(l, ARRAY[now() + interval '1 day'], 'system:verify') = 1, 'one materialised';
  SELECT id INTO p FROM public.social_posts WHERE origin_list_id = l;
  ASSERT public.social_comments_json(p) = '[{"body":"item comment","delay_minutes":0,"media_id":null}]'::jsonb
     AND EXISTS (SELECT 1 FROM public.social_post_tags WHERE post_id = p AND tag_id = t1), 'rotation copies comments and tags';
  RAISE NOTICE 'SOCIAL_0105_LISTS_OK';

  -- auto-reply rules
  rule := public.social_save_auto_rule(a, NULL, '{"name":"報名","trigger":"comment","keywords":[" 報名 ","", "怎麼報"],"platforms":["instagram","facebook","instagram"],"action":"dm","reply":"表單在這"}', 'verify');
  ASSERT (SELECT keywords = '{報名,怎麼報}' AND platforms = '{facebook,instagram}' FROM public.social_auto_rules WHERE id = rule), 'keywords trimmed, platforms once';
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_auto_rule(%L, NULL, '{"trigger":"comment","platforms":["bluesky"],"action":"reply"}', 'v')$q$, a),
    '23514', 'a platform the rules do not cover');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_auto_rule(%L, NULL, '{"post_id":"%s","trigger":"dm","platforms":["facebook"],"action":"reply"}', 'v')$q$, b, tpl),
    '23503', 'a rule on another brand''s post');
  ASSERT public.social_auto_rule_hit(a, rule, 'system:verify', '{"comment":"c1"}') = 1, 'a hit counts';
  PERFORM public.social_save_auto_rule(a, rule, '{"name":"報名","trigger":"comment","platforms":["facebook"],"action":"dm","active":false}', 'verify');
  ASSERT public.social_auto_rule_hit(a, rule, 'system:verify', NULL) IS NULL, 'an off rule does not count';
  ASSERT public.social_auto_rule_hit(b, rule, 'system:verify', NULL) IS NULL, 'another brand cannot count it';
  RAISE NOTICE 'SOCIAL_0105_RULES_OK';

  -- smart links: slug rule, unique across brands, clicks per brand day, only on a published page
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_smart_link(%L, '{"slug":"Soulful"}', NULL, 'v')$q$, a), '23514', 'an upper-case slug');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_smart_link(%L, '{"slug":"api"}', NULL, 'v')$q$, a), '23514', 'a reserved slug');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_smart_link(%L, '{"slug":"-art"}', NULL, 'v')$q$, a), '23514', 'a slug starting with -');
  PERFORM public.social_save_smart_link(a, '{"slug":"soulful-art","title":"Soulful"}',
    '[{"title":"官網","url":"https://soulful.example"},{"title":"報名","url":"https://soulful.example/join"}]', 'verify');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_smart_link(%L, '{"slug":"soulful-art"}', NULL, 'v')$q$, b), '23505', 'a slug another brand has');
  SELECT id INTO it_a FROM public.social_smart_link_items WHERE organization_id = a AND position = 0;
  ASSERT public.social_smart_link_click('soulful-art', it_a) IS NULL, 'an unpublished page sends nobody anywhere';
  PERFORM public.social_save_smart_link(a, '{"slug":"soulful-art","title":"Soulful","published":true}', NULL, 'verify');
  ASSERT public.social_smart_link_click('soulful-art', it_a) = 'https://soulful.example', 'a click returns the url';
  PERFORM public.social_smart_link_click('soulful-art', it_a);
  ASSERT (SELECT k.n FROM public.social_smart_link_clicks k WHERE k.item_id = it_a) = 2, 'two clicks, one row per day';
  PERFORM public.social_save_smart_link(b, '{"slug":"brand-b"}', '[{"title":"b","url":"https://b.example"}]', 'verify');
  SELECT id INTO it_b FROM public.social_smart_link_items WHERE organization_id = b;
  ASSERT public.social_smart_link_click('soulful-art', it_b) IS NULL, 'another brand''s item through this page';
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_smart_link(%L, '{"slug":"soulful-art"}', '[{"id":"%s","title":"x","url":"https://x.example"}]', 'v')$q$, a, it_b),
    'SC404', 'editing another brand''s item');
  PERFORM public.social_save_smart_link(a, '{"slug":"soulful-art","published":true}', format('[{"id":"%s","title":"官網","url":"https://soulful.example"}]', it_a)::jsonb, 'verify');
  ASSERT (SELECT count(*) FROM public.social_smart_link_items WHERE organization_id = a) = 1, 'an item left out is removed';
  RAISE NOTICE 'SOCIAL_0105_SMARTLINK_OK';

  -- reports: another brand's account refused (an array has no foreign key); PDF only
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_create_report(%L, '{"name":"x","period_from":"2026-10-01","period_to":"2026-10-31","account_ids":["%s"]}', 'v')$q$, a, acc_b),
    'SC404', 'another brand''s account in a report');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_create_report(%L, '{"name":"x","period_from":"2026-10-01","period_to":"2026-10-31","format":"pptx"}', 'v')$q$, a),
    '23514', 'a format that is not PDF');
  rep := public.social_create_report(a, format('{"name":"十月","period_from":"2026-10-01","period_to":"2026-10-31","account_ids":["%s"],"sections":["sum","top"]}', acc)::jsonb, 'verify');
  PERFORM public.social_delete_report(a, rep, 'verify');
  ASSERT (SELECT count(*) FROM public.social_audit_log WHERE action = 'report' AND detail->>'report_id' = rep::text) = 2, 'report create + delete logged';

  -- metrics: null = not given, never a made-up number
  INSERT INTO public.social_metrics_daily (account_id, day, followers) VALUES (acc, '2026-10-16', 120);
  INSERT INTO public.social_metrics_daily (account_id, day, followers, reach) VALUES (acc, '2026-10-16', 121, 40)
    ON CONFLICT (account_id, day) DO UPDATE SET followers = excluded.followers, reach = excluded.reach;
  ASSERT (SELECT followers = 121 AND impressions IS NULL FROM public.social_metrics_daily WHERE account_id = acc), 'same day overwrites, unknown stays null';
  RAISE NOTICE 'SOCIAL_0105_BEHAVIOUR_OK';
END $$;
RESET ROLE;

-- a brand can still be deleted with all of it (series, comments, tags, rules, smart link, clicks, metrics, report)
SET ROLE service_role;
DO $$
DECLARE
  c uuid := '00000000-0000-0000-0000-0000000000cc';
  acc uuid; tpl uuid; v int; tg uuid; it uuid; tgt uuid;
BEGIN
  SELECT id INTO acc FROM public.social_accounts WHERE organization_id = c;
  tg := public.social_save_tag(c, NULL, 'x', 'a', 'verify');
  SELECT saved_post_id, saved_version INTO tpl, v FROM public.social_save_post(c, NULL, NULL, '{"body":"c","repeat":{"freq":"day","end":"never"}}',
    jsonb_build_array(jsonb_build_object('account_id', acc)), NULL, 'verify', '[{"body":"cc"}]', ARRAY[tg]);
  PERFORM public.social_set_state(c, tpl, v, 'scheduled', now() + interval '1 hour', NULL, NULL, 'verify', 'schedule', NULL);
  ASSERT public.social_repeat_materialize(c, tpl, ARRAY[now() + interval '1 day'], false, 'verify') = 1, 'c has a child';
  PERFORM public.social_save_auto_rule(c, NULL, format('{"post_id":"%s","trigger":"dm","platforms":["facebook"],"action":"reply"}', tpl)::jsonb, 'verify');
  PERFORM public.social_save_smart_link(c, format('{"slug":"c-%s","published":true}', substr(md5(random()::text), 1, 8))::jsonb,
    '[{"title":"c","url":"https://c.example"}]', 'verify');
  SELECT id INTO it FROM public.social_smart_link_items WHERE organization_id = c;
  INSERT INTO public.social_smart_link_clicks (item_id, day, n) VALUES (it, current_date, 3);
  INSERT INTO public.social_metrics_daily (account_id, day, followers) VALUES (acc, current_date, 1);
  SELECT id INTO tgt FROM public.social_post_targets WHERE post_id = tpl;
  INSERT INTO public.social_post_metrics (target_id, reach) VALUES (tgt, 5);
  PERFORM public.social_create_report(c, '{"name":"c","period_from":"2026-10-01","period_to":"2026-10-02"}', 'verify');
END $$;
RESET ROLE;
DELETE FROM public.organizations WHERE id = '00000000-0000-0000-0000-0000000000cc';
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.social_posts WHERE organization_id = '00000000-0000-0000-0000-0000000000cc'), 'brand c posts gone';
  ASSERT NOT EXISTS (SELECT 1 FROM public.social_smart_links WHERE organization_id = '00000000-0000-0000-0000-0000000000cc'), 'brand c link gone';
  RAISE NOTICE 'SOCIAL_0105_CASCADE_OK';
END $$;

-- service_role only: RLS on, anon and authenticated hold nothing on the new tables and functions
DO $$
DECLARE
  t text; f text;
BEGIN
  FOREACH t IN ARRAY ARRAY['social_tags', 'social_post_tags', 'social_post_comments', 'social_list_slots', 'social_auto_rules',
                           'social_smart_links', 'social_smart_link_items', 'social_smart_link_clicks', 'social_metrics_daily',
                           'social_post_metrics', 'social_reports'] LOOP
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass), t || ' has RLS';
    ASSERT NOT has_table_privilege('anon', 'public.' || t, 'SELECT') AND NOT has_table_privilege('authenticated', 'public.' || t, 'INSERT'),
      t || ' is closed to anon and authenticated';
    ASSERT has_table_privilege('service_role', 'public.' || t, 'SELECT'), t || ' is open to service_role';
  END LOOP;
  FOREACH f IN ARRAY ARRAY['social_comments_json(uuid)', 'social_repeat_ok(jsonb)', 'social_withdraw_repeat(uuid,uuid,text,text)',
                           'social_repeat_materialize(uuid,uuid,timestamptz[],boolean,text)', 'social_stop_repeat(uuid,uuid,integer,text)',
                           'social_save_post(uuid,uuid,integer,jsonb,jsonb,jsonb,text,jsonb,uuid[])',
                           'social_set_state(uuid,uuid,integer,text,timestamptz,uuid,integer,text,text,jsonb)',
                           'social_materialize_list(uuid,timestamptz[],text)',
                           'social_save_list(uuid,uuid,text,smallint[],time,boolean,uuid[],text,jsonb)',
                           'social_save_tag(uuid,uuid,text,text,text)', 'social_delete_tag(uuid,uuid,text)',
                           'social_save_auto_rule(uuid,uuid,jsonb,text)', 'social_delete_auto_rule(uuid,uuid,text)',
                           'social_auto_rule_hit(uuid,uuid,text,jsonb)', 'social_save_smart_link(uuid,jsonb,jsonb,text)',
                           'social_smart_link_click(text,uuid)', 'social_create_report(uuid,jsonb,text)', 'social_delete_report(uuid,uuid,text)',
                           'social_touch_post_rules(uuid,uuid,text)'] LOOP
    ASSERT NOT has_function_privilege('anon', 'public.' || f, 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.' || f, 'EXECUTE'),
      f || ' is closed to anon and authenticated';
  END LOOP;
  ASSERT to_regprocedure('public.social_save_post(uuid,uuid,integer,jsonb,jsonb,jsonb,text)') IS NULL, 'one social_save_post (PGRST203)';
  ASSERT to_regprocedure('public.social_save_list(uuid,uuid,text,smallint[],time,boolean,uuid[],text)') IS NULL, 'one social_save_list (PGRST203)';
  RAISE NOTICE 'SOCIAL_0105_ACCESS_OK';
END $$;
