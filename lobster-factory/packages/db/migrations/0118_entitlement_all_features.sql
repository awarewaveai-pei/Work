-- 0118: accounts entitled to every registered feature (ADR 017 §0: who pays is per account). One row per account
-- in organization_all_features; the daily /api/internal/entitlements/expire sweep turns it into one grant per
-- feature of apps/next-admin/lib/portal/products.ts, so a feature added later is covered the next day.
-- Replaces 0117's internal-only top-up with the same mechanism for every such account (0117 never ran a top-up).
-- Invariant: one live grant per (account, product, feature, source, source_ref) for rows this mechanism owns
-- (source_ref 'all-features:%'); other grants keep 0110's rules. Grants are never deleted (audit).
-- Ending coverage: delete the organization_all_features row, then set its grants status='expired'. Expiring a
-- grant while the row stays is undone by the next sweep.
-- Seed: internal (ADR 017 §0 自用) and the operator's 2026-10-23 decisions (edd-research comp, soulful contract).
begin;
set local lock_timeout = '5s';

create table public.organization_all_features (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  source text not null check (source in ('contract','comp')),
  source_ref text not null check (source_ref like 'all-features:_%'),
  note text,
  created_at timestamptz not null default now()
);
alter table public.organization_all_features enable row level security;
revoke all on table public.organization_all_features from public, anon, authenticated;
grant all on table public.organization_all_features to service_role;
create policy organization_all_features_service_role on public.organization_all_features
  for all to service_role using (true) with check (true);

drop function public.entitlement_ensure_internal_comp(jsonb);
drop index public.organization_entitlements_comp_live_uniq;
create unique index organization_entitlements_all_features_live_uniq
  on public.organization_entitlements(organization_id, product_key, feature_key, source, source_ref)
  where status = 'active' and source_ref like 'all-features:%';

create function public.entitlement_ensure_all_features(p_features jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_added integer;
begin
  if jsonb_typeof(p_features) is distinct from 'array' then raise exception 'p_features must be an array'; end if;
  insert into public.organization_entitlements (organization_id, product_key, feature_key, source, source_ref)
  select a.organization_id, f->>'product_key', f->>'feature_key', a.source, a.source_ref
  from public.organization_all_features a cross join jsonb_array_elements(p_features) f
  on conflict (organization_id, product_key, feature_key, source, source_ref)
    where status = 'active' and source_ref like 'all-features:%' do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end $$;
revoke all on function public.entitlement_ensure_all_features(jsonb) from public, anon, authenticated;
grant execute on function public.entitlement_ensure_all_features(jsonb) to service_role;
comment on function public.entitlement_ensure_all_features is 'Idempotent top-up: one grant per registered feature for every organization_all_features row (ADR 017 §0). Returns rows added. service_role only.';

do $$
declare n integer;
begin
  insert into public.organization_all_features (organization_id, source, source_ref, note)
  select id, 'comp', 'all-features:internal', 'ADR 017 §0 自用' from public.organizations
  where kind = 'internal' and parent_organization_id is null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected exactly one internal root organization, found %', n; end if;
  insert into public.organization_all_features (organization_id, source, source_ref, note)
  select id, 'comp', 'all-features:edd-research', '操作者 2026-10-23：自己的研究' from public.organizations
  where slug = 'edd-research' and parent_organization_id is null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'edd-research root organization not found'; end if;
  insert into public.organization_all_features (organization_id, source, source_ref, note)
  select id, 'contract', 'all-features:soulful-2026-10-23', '操作者 2026-10-23：代操月費涵蓋全部產品' from public.organizations
  where slug = 'soulful-expression' and parent_organization_id is null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'soulful-expression root organization not found'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
