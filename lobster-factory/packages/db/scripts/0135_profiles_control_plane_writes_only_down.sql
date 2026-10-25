-- Back to 0134: restores 0020's profiles_insert_self / profiles_update_self and the default write grants (reopens the hole).
-- Restored in 0020's wording (current_user_id()); apply-splinter-fixes-one-shot.sql's older (select auth.uid())::uuid is equivalent (0019).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0135_profiles_control_plane_writes_only.sql';
  end if;
end $$;
grant insert, update, delete, truncate, references, trigger on public.profiles to anon, authenticated;
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on profiles
for insert
with check (id = current_user_id());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on profiles
for update
using (id = current_user_id())
with check (id = current_user_id());
notify pgrst, 'reload schema';
commit;
