-- Down for 0103_social_brand_members.sql: drops the member-management functions (member rows stay; 0096 owns the table).
-- ORDER: withdraw the next-admin code calling them first (lib/social/members.ts would answer 500 on a missing function).
--
-- APPLY WITH:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 0103_social_brand_members_down.sql
begin;
set local lock_timeout = '1s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0103_social_brand_members.sql';
  end if;
end $$;

drop function if exists public.social_remove_member(uuid, uuid, text);
drop function if exists public.social_set_member_role(uuid, uuid, text, text);
drop function if exists public.social_lock_members_for_change(uuid, uuid, text);
drop function if exists public.social_add_member(uuid, text, text, text);
drop function if exists public.social_list_members(uuid);
notify pgrst, 'reload schema';
commit;
