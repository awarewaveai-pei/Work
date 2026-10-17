-- Assertions for 0109 (social_repeat_materialize refuses slots from an older template version), run by
-- 0105_social_v16-local-verify.sh after 0105 and 0109.
SET plpgsql.check_asserts = on;
SET ROLE service_role;
DO $$
DECLARE
  a uuid := '00000000-0000-0000-0000-00000000000a';
  acc uuid; tpl uuid; v int;
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT id INTO acc FROM public.social_accounts WHERE organization_id = a ORDER BY platform LIMIT 1;
  SELECT saved_post_id, saved_version INTO tpl, v FROM public.social_save_post(a, NULL, NULL, '{"body":"0109","repeat":{"freq":"day","end":"never"}}',
    jsonb_build_array(jsonb_build_object('account_id', acc)), NULL, 'verify');
  SELECT saved_version INTO v FROM public.social_set_state(a, tpl, v, 'scheduled', now() + interval '1 hour', NULL, NULL, 'verify', 'schedule', NULL);
  ASSERT public.social_repeat_materialize(a, tpl, ARRAY[now() + interval '1 day'], false, 'system:verify', v - 1) = -1, 'slots from an older version: -1';
  ASSERT NOT EXISTS (SELECT 1 FROM public.social_posts WHERE repeat_of = tpl), 'and no child made from them';
  ASSERT public.social_repeat_materialize(a, tpl, ARRAY[now() + interval '1 day'], false, 'system:verify', v) = 1, 'the current version: made';
  ASSERT public.social_repeat_materialize(a, tpl, ARRAY[now() + interval '2 days'], false, 'system:verify') = 1, 'no version: no check';
  ASSERT to_regprocedure('public.social_repeat_materialize(uuid,uuid,timestamptz[],boolean,text)') IS NULL, 'one overload (PGRST203)';
  RAISE NOTICE 'SOCIAL_0109_BEHAVIOUR_OK';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.social_repeat_materialize(uuid,uuid,timestamptz[],boolean,text,integer)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.social_repeat_materialize(uuid,uuid,timestamptz[],boolean,text,integer)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.social_repeat_materialize(uuid,uuid,timestamptz[],boolean,text,integer)', 'EXECUTE'),
    'service_role only';
  RAISE NOTICE 'SOCIAL_0109_ACCESS_OK';
END $$;
