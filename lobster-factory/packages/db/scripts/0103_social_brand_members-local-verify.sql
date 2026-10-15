-- Behavioural assertions for 0103 (brand members), run by 0103_social_brand_members-local-verify.sh after 0096 and 0103
-- on a throwaway Postgres. One block per invariant in the 0103 header.
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
  ann uuid := '10000000-0000-0000-0000-000000000001';
  bob uuid := '10000000-0000-0000-0000-000000000002';
  u uuid; r text; n int;
BEGIN
  -- 1. found by email, case-insensitive; unknown, deleted, anonymous and ambiguous emails refused; no duplicate member
  u := public.social_add_member(a, '  ANN@Example.com ', 'owner', 'ops:owner:x');
  ASSERT u = ann, 'ann found by email regardless of case and spaces';
  PERFORM pg_temp.must_fail(format('SELECT public.social_add_member(%L, %L, %L, %L)', a, 'nobody@example.com', 'editor', 'x'), 'SC404', 'unknown email');
  PERFORM pg_temp.must_fail(format('SELECT public.social_add_member(%L, %L, %L, %L)', a, 'gone@example.com', 'editor', 'x'), 'SC404', 'deleted account');
  PERFORM pg_temp.must_fail(format('SELECT public.social_add_member(%L, %L, %L, %L)', a, 'anon@example.com', 'editor', 'x'), 'SC404', 'anonymous account');
  PERFORM pg_temp.must_fail(format('SELECT public.social_add_member(%L, %L, %L, %L)', a, 'unconfirmed@example.com', 'editor', 'x'), 'SC404', 'email not confirmed');
  PERFORM pg_temp.must_fail(format('SELECT public.social_add_member(%L, %L, %L, %L)', a, 'twin@example.com', 'editor', 'x'), '22023', 'email of two accounts');
  PERFORM pg_temp.must_fail(format('SELECT public.social_add_member(%L, %L, %L, %L)', a, 'ann@example.com', 'editor', 'x'), 'SC409', 'already a member');
  PERFORM pg_temp.must_fail(format('SELECT public.social_add_member(%L, %L, %L, %L)', a, 'bob@example.com', 'boss', 'x'), '22023', 'unknown role');
  u := public.social_add_member(a, 'bob@example.com', 'editor', 'ops:owner:x');
  SELECT count(*) INTO n FROM public.social_list_members(a);
  ASSERT n = 2, 'two members listed';
  SELECT role INTO r FROM public.social_list_members(a) WHERE email = 'Bob@Example.com';   -- the account's own spelling
  ASSERT r = 'editor', 'bob listed with his role and email';
  SELECT count(*) INTO n FROM public.social_list_members(b);
  ASSERT n = 0, 'another brand lists nobody';

  -- 2. the last owner stays; with a second owner the first may go
  PERFORM pg_temp.must_fail(format('SELECT public.social_set_member_role(%L, %L, %L, %L)', a, ann, 'editor', 'x'), 'SC409', 'demote the last owner');
  PERFORM pg_temp.must_fail(format('SELECT public.social_remove_member(%L, %L, %L)', a, ann, 'x'), 'SC409', 'remove the last owner');
  PERFORM pg_temp.must_fail(format('SELECT public.social_remove_member(%L, %L, %L)', b, ann, 'x'), 'SC404', 'remove from a brand ann is not in');
  r := public.social_set_member_role(a, bob, 'owner', 'ops:owner:x');
  ASSERT r = 'owner', 'bob promoted';
  r := public.social_set_member_role(a, ann, 'reviewer', 'ops:owner:x');
  ASSERT r = 'reviewer', 'ann demoted now that bob owns';
  PERFORM public.social_remove_member(a, ann, 'ops:owner:x');
  PERFORM pg_temp.must_fail(format('SELECT public.social_remove_member(%L, %L, %L)', a, bob, 'x'), 'SC409', 'remove the new last owner');
  -- a brand with no owner row at all (staff-run): non-owner changes are free
  u := public.social_add_member(b, 'ann@example.com', 'editor', 'x');
  PERFORM public.social_remove_member(b, ann, 'x');

  -- 3. every change wrote its row, with ids and roles, never the email
  SELECT count(*) INTO n FROM public.social_audit_log WHERE organization_id = a AND action IN ('member_add', 'member_role', 'member_remove');
  ASSERT n = 5, format('five audit rows on brand a (add ann, add bob, promote bob, demote ann, remove ann), got %s', n);
  ASSERT NOT EXISTS (SELECT 1 FROM public.social_audit_log WHERE detail::text ILIKE '%@example.com%'), 'no email in the log';
  ASSERT (SELECT detail->>'from' FROM public.social_audit_log WHERE organization_id = a AND action = 'member_role' ORDER BY id LIMIT 1) = 'editor', 'role change logs from';
  RAISE NOTICE 'SOCIAL_0103_BEHAVIOUR_OK';
END $$;
RESET ROLE;

-- 4. service_role only
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.social_list_members(uuid)', 'public.social_add_member(uuid,text,text,text)',
    'public.social_lock_members_for_change(uuid,uuid,text)', 'public.social_set_member_role(uuid,uuid,text,text)',
    'public.social_remove_member(uuid,uuid,text)'] LOOP
    ASSERT has_function_privilege('service_role', f, 'EXECUTE'), f || ' executable by service_role';
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), f || ' not executable by anon';
    ASSERT NOT has_function_privilege('authenticated', f, 'EXECUTE'), f || ' not executable by authenticated';
  END LOOP;
  RAISE NOTICE 'SOCIAL_0103_ACCESS_OK';
END $$;
