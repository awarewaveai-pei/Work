-- Restore the three 0010 write policies and default write grants.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0137_partner_referrals_writes_only.sql';
  end if;
end $$;

grant insert, update, delete, truncate, references, trigger on public.partner_referrals to anon, authenticated;
drop policy if exists partner_referrals_insert on public.partner_referrals;
create policy partner_referrals_insert on partner_referrals
for insert
with check (user_has_org_access(organization_id));
drop policy if exists partner_referrals_update on public.partner_referrals;
create policy partner_referrals_update on partner_referrals
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists partner_referrals_delete on public.partner_referrals;
create policy partner_referrals_delete on partner_referrals
for delete
using (user_has_org_access(organization_id));
notify pgrst, 'reload schema';
commit;
