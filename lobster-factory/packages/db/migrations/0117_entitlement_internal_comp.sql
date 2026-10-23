-- 0117: the internal account (organizations.kind = 'internal', ADR 017 §0 way 1 自用) holds one comp grant per
-- registered feature, computed from apps/next-admin/lib/portal/products.ts and topped up by the daily
-- /api/internal/entitlements/expire sweep, so a new feature is covered the next day without a hand-written row.
-- Invariant: at most one live comp row per (organization, product, feature); the partial unique index makes the
-- top-up idempotent under concurrent runs. Rows are never deleted (audit). Suspending or expiring one is undone by
-- the next sweep: to take a feature away from internal, remove it from products.ts.
-- The index covers only these rows (source_ref 'internal'): customer comp/contract rows keep 0110's plan-change rules.
-- Access: service_role only, like the rest of 0110.
begin;
set local lock_timeout = '5s';

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
  -- STRICT: zero or two internal root accounts is a data error to surface, never a row to guess.
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
comment on function public.entitlement_ensure_internal_comp is 'Idempotent top-up of the internal account''s comp grants from the product registry (ADR 017 §0 自用). Returns rows added. service_role only.';
notify pgrst, 'reload schema';
commit;
