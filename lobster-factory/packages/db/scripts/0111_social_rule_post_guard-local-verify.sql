-- Assertions for 0111 (a post's own auto-reply rule: queued guard + post version), run by
-- 0111_social_rule_post_guard-local-verify.sh after 0096-0103, 0105, 0109 and 0111.
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
  acc uuid; p uuid; v int; v2 int; r uuid; r2 uuid; got record;
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT id INTO acc FROM public.social_accounts WHERE organization_id = a ORDER BY platform LIMIT 1;
  SELECT saved_post_id, saved_version INTO p, v FROM public.social_save_post(a, NULL, NULL, '{"body":"0111"}',
    jsonb_build_array(jsonb_build_object('account_id', acc)), NULL, 'verify');

  -- a draft's own rule: the version the same transaction left is the one returned (one bump per write)
  SELECT * INTO got FROM public.social_save_post_rule(a, NULL, format('{"post_id":"%s","name":"own","trigger":"dm","platforms":["facebook"],"action":"reply"}', p)::jsonb, 'verify');
  r := got.rule_id;
  ASSERT got.post_version = (SELECT version FROM public.social_posts WHERE id = p) AND got.post_version = v + 1, 'create: the post version after the write is returned (+1)';
  SELECT * INTO got FROM public.social_save_post_rule(a, r, '{"name":"own2","trigger":"dm","platforms":["facebook"],"action":"reply"}'::jsonb, 'verify');
  ASSERT got.rule_id = r AND got.post_version = v + 2, 'edit: +1 again';
  v2 := public.social_delete_post_rule(a, r, 'verify');
  ASSERT v2 = v + 3 AND v2 = (SELECT version FROM public.social_posts WHERE id = p), 'delete returns the post version after it';

  -- the brand's rule has no post: null
  SELECT * INTO got FROM public.social_save_post_rule(a, NULL, '{"name":"brand","trigger":"comment","platforms":["instagram"],"action":"dm","reply":"hi"}'::jsonb, 'verify');
  ASSERT got.rule_id IS NOT NULL AND got.post_version IS NULL, 'a brand rule: post_version null';
  ASSERT public.social_delete_post_rule(a, got.rule_id, 'verify') IS NULL, 'deleting a brand rule: null';

  -- a rule that is not there
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_delete_post_rule(%L, %L, 'v')$q$, a, gen_random_uuid()), 'SC404', 'a missing rule');

  -- a claimed (queued) post: its rule can be neither saved, edited nor deleted, and its version does not move
  SELECT * INTO got FROM public.social_save_post_rule(a, NULL, format('{"post_id":"%s","name":"keep","trigger":"dm","platforms":["facebook"],"action":"reply"}', p)::jsonb, 'verify');
  r2 := got.rule_id;
  UPDATE public.social_posts SET state = 'queued', scheduled_at = now() + interval '1 hour' WHERE id = p;
  SELECT version INTO v FROM public.social_posts WHERE id = p;
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post_rule(%L, NULL, '{"post_id":"%s","name":"x","trigger":"dm","platforms":["facebook"],"action":"reply"}', 'v')$q$, a, p), 'SC409', 'a new rule on a queued post');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_post_rule(%L, %L, '{"name":"y","trigger":"dm","platforms":["facebook"],"action":"reply"}', 'v')$q$, a, r2), 'SC409', 'an edit on a queued post');
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_delete_post_rule(%L, %L, 'v')$q$, a, r2), 'SC409', 'a delete on a queued post');
  -- the 0105 functions pick the guard up through the touch function
  PERFORM pg_temp.must_fail(format($q$SELECT public.social_save_auto_rule(%L, %L, '{"name":"z","trigger":"dm","platforms":["facebook"],"action":"reply"}', 'v')$q$, a, r2), 'SC409', '0105 save on a queued post');
  ASSERT (SELECT version FROM public.social_posts WHERE id = p) = v, 'a refused write leaves the version alone';
  ASSERT (SELECT name FROM public.social_auto_rules WHERE id = r2) = 'keep', 'and the rule';
  -- a brand rule is not blocked by any post
  SELECT * INTO got FROM public.social_save_post_rule(a, NULL, '{"name":"b2","trigger":"dm","platforms":["facebook"],"action":"reply"}'::jsonb, 'verify');
  PERFORM public.social_delete_post_rule(a, got.rule_id, 'verify');
  RAISE NOTICE 'SOCIAL_0111_BEHAVIOUR_OK';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.social_save_post_rule(uuid,uuid,jsonb,text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.social_save_post_rule(uuid,uuid,jsonb,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.social_delete_post_rule(uuid,uuid,text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.social_delete_post_rule(uuid,uuid,text)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.social_save_post_rule(uuid,uuid,jsonb,text)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.social_delete_post_rule(uuid,uuid,text)', 'EXECUTE'),
    'service_role only';
  RAISE NOTICE 'SOCIAL_0111_ACCESS_OK';
END $$;
