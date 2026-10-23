begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0117_entitlement_internal_comp.sql';
  end if;
end $$;
drop function if exists public.entitlement_ensure_internal_comp(jsonb);
drop index if exists public.organization_entitlements_comp_live_uniq;
commit;
