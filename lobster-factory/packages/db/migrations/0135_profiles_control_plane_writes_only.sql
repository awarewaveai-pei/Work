-- 0135: a profiles row is written only by the control plane (service role, security-definer functions); same
-- invariant as 0134 for organizations. 0020's profiles_insert_self / profiles_update_self (id = current_user_id())
-- plus Supabase's default all-privilege grants let a signed-in user write any column of their own row through
-- PostgREST, including default_organization_id and email -- which lib/entitlements/wp-customers.ts:60-62 reads to
-- decide which account a WordPress member lands in. No app path writes profiles with a user session (all writers:
-- lib/accounts/client-invite.ts via getSupabaseWriteClient; portal_complete_signup is security definer; the browser
-- client only calls auth.updateUser for the password, which is GoTrue's auth.users, not this table -- WORKLOG
-- 2026-10-25), so users keep profiles_select_self and lose every write.
begin;
set local lock_timeout = '5s';
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd <> 'SELECT') then
    raise exception '0135: profiles still has a non-SELECT policy';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,REFERENCES')
     or has_any_column_privilege('anon', 'public.profiles', 'INSERT,UPDATE,REFERENCES') then
    raise exception '0135: anon/authenticated can still write profiles';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
