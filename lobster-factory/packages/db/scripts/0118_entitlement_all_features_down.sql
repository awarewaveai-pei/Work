-- Back to 0117: grants written by 0118 stay (audit); expire them by hand if coverage should end too.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0118_entitlement_all_features.sql';
  end if;
end $$;
drop function if exists public.entitlement_ensure_all_features(jsonb);
drop index if exists public.organization_entitlements_all_features_live_uniq;
drop table if exists public.organization_all_features;

create unique index organization_entitlements_comp_live_uniq
  on public.organization_entitlements(organization_id, product_key, feature_key)
  where source = 'comp' and status = 'active' and source_ref = 'internal';
create function public.entitlement_ensure_internal_comp(p_features jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_org uuid;
  v_added integer;
begin
  if jsonb_typeof(p_features) is distinct from 'array' then raise exception 'p_features must be an array'; end if;
  select id into strict v_org from public.organizations where kind = 'internal' and parent_organization_id is null;
  insert into public.organization_entitlements (organization_id, product_key, feature_key, source, source_ref)
  select v_org, f->>'product_key', f->>'feature_key', 'comp', 'internal'
  from jsonb_array_elements(p_features) f
  on conflict (organization_id, product_key, feature_key) where source = 'comp' and status = 'active' and source_ref = 'internal' do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end $$;
revoke all on function public.entitlement_ensure_internal_comp(jsonb) from public, anon, authenticated;
grant execute on function public.entitlement_ensure_internal_comp(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
