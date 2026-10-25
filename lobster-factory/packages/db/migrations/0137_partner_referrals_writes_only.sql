-- Partner referrals carry commission and attribution; tenant members retain SELECT only.
begin;
set local lock_timeout = '5s';

drop policy if exists partner_referrals_insert on public.partner_referrals;
drop policy if exists partner_referrals_update on public.partner_referrals;
drop policy if exists partner_referrals_delete on public.partner_referrals;
revoke insert, update, delete, truncate, references, trigger on public.partner_referrals from anon, authenticated;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'partner_referrals' and cmd <> 'SELECT'
  ) then
    raise exception '0137: partner_referrals still has a non-SELECT policy';
  end if;
  if has_table_privilege('authenticated', 'public.partner_referrals', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.partner_referrals', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege('authenticated', 'public.partner_referrals', 'INSERT,UPDATE,REFERENCES')
     or has_any_column_privilege('anon', 'public.partner_referrals', 'INSERT,UPDATE,REFERENCES') then
    raise exception '0137: anon/authenticated can still write partner_referrals';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
