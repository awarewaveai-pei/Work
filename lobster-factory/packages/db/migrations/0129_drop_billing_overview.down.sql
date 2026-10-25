-- Back to 0128: restores 0120's billing_overview byte for byte (needed only to roll the app back before 5bdf7f9f9).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0129_drop_billing_overview.sql';
  end if;
end $$;
drop function if exists public.billing_overview(integer, integer);

create function public.billing_overview(p_ledger_rows integer default 20, p_event_rows integer default 10) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  with accounts as (
    select o.id, o.name, o.slug, o.kind from public.organizations o
    where o.parent_organization_id is null and (
      exists (select 1 from public.organization_product_subscriptions s where s.organization_id = o.id)
      or exists (select 1 from public.organization_entitlements e where e.organization_id = o.id)
      or exists (select 1 from public.media_credit_ledger l where l.organization_id = o.id)
      or exists (select 1 from public.payment_events p where p.organization_id = o.id))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'organization_id', a.id, 'name', a.name, 'slug', a.slug, 'kind', a.kind,
    'all_features', (select jsonb_build_object('source', f.source, 'source_ref', f.source_ref, 'note', f.note)
      from public.organization_all_features f where f.organization_id = a.id),
    'balance', (select coalesce(sum(l.units), 0) from public.media_credit_ledger l where l.organization_id = a.id),
    'hold', (select jsonb_build_object('reason', h.reason, 'since', h.created_at)
      from public.credit_wallet_holds h where h.organization_id = a.id and h.cleared_at is null),
    'contracts', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'product_key', s.product_key, 'plan_key', s.plan_key,
        'status', s.status, 'started_at', s.started_at, 'current_period_end', s.current_period_end, 'source_ref', s.source_ref)
        order by s.product_key, s.created_at), '[]'::jsonb)
      from public.organization_product_subscriptions s where s.organization_id = a.id),
    'grants', (select coalesce(jsonb_agg(g.row order by g.product_key, g.source, g.state), '[]'::jsonb) from (
        select x.product_key, x.source, x.state, jsonb_build_object('product_key', x.product_key, 'source', x.source,
          'source_ref', x.source_ref, 'state', x.state, 'features', count(*), 'ends_at', max(x.ends_at)) as row
        from (select e.*, case when e.status = 'active' and e.ends_at is not null and e.ends_at <= now() then 'ended' else e.status end as state
          from public.organization_entitlements e where e.organization_id = a.id and e.status <> 'expired') x
        group by x.product_key, x.source, x.source_ref, x.state) g),
    'expired_grants', (select count(*) from public.organization_entitlements e where e.organization_id = a.id and e.status = 'expired'),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('at', l.created_at, 'units', l.units, 'entry_type', l.entry_type,
        'reference_type', l.reference_type, 'reference_id', l.reference_id) order by l.created_at desc), '[]'::jsonb)
      from (select * from public.media_credit_ledger l where l.organization_id = a.id order by l.created_at desc limit p_ledger_rows) l),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('at', p.received_at, 'provider', p.provider, 'event_id', p.event_id,
        'kind', p.kind, 'result', p.result) order by p.received_at desc), '[]'::jsonb)
      from (select * from public.payment_events p where p.organization_id = a.id order by p.received_at desc limit p_event_rows) p)
  ) order by a.kind, a.name), '[]'::jsonb) from accounts a;
$$;
revoke all on function public.billing_overview(integer, integer) from public, anon, authenticated;
grant execute on function public.billing_overview(integer, integer) to service_role;

notify pgrst, 'reload schema';
commit;
