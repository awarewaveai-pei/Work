-- Back to 0133: restores 0010's organizations_update / organizations_delete and the default write grants (reopens the hole).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0134_organizations_control_plane_writes_only.sql';
  end if;
end $$;
grant insert, update, delete, truncate, references, trigger on public.organizations to anon, authenticated;
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on organizations
for update
using (user_has_org_access(id))
with check (user_has_org_access(id));
drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on organizations
for delete
using (user_has_org_access(id));
notify pgrst, 'reload schema';
commit;
