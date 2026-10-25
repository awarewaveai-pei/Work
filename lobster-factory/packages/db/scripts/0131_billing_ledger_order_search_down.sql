-- Back to 0130: restores 0130's billing_ledger body (search without payload order_ref / external_ref).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0131_billing_ledger_order_search.sql';
  end if;
end $$;

create or replace function public.billing_ledger(p_filter text default 'all', p_query text default null,
  p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_like text := case when nullif(btrim(p_query), '') is null then null
    else '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_result jsonb;
begin
  if p_filter is null or p_filter not in ('all', 'attention', 'balance', 'contract', 'internal') then
    raise exception 'invalid_filter:%', p_filter;
  end if;
  with bal as (select l.organization_id as id, sum(l.units) as balance,
      coalesce(sum(l.units) filter (where l.units > 0 and l.created_at > now() - interval '30 days'), 0) as granted_30d,
      coalesce(-sum(l.units) filter (where l.units < 0 and l.created_at > now() - interval '30 days'), 0) as spent_30d
    from public.media_credit_ledger l group by 1),
  acc as (
    select o.id, o.name, o.slug, o.kind, coalesce(b.balance, 0) as balance, coalesce(b.granted_30d, 0) as granted_30d,
      coalesce(b.spent_30d, 0) as spent_30d, h.created_at as frozen_since,
      exists (select 1 from public.organization_product_subscriptions s where s.organization_id = o.id and s.status <> 'canceled') as has_contract,
      array_remove(array[
        case when h.organization_id is not null then 'frozen' end,
        case when coalesce(b.balance, 0) < 0 then 'overdrawn' end,
        case when exists (select 1 from public.organization_product_subscriptions s
          where s.organization_id = o.id and s.status = 'past_due') then 'past_due' end,
        case when exists (select 1 from public.organization_entitlements e
          where e.organization_id = o.id and e.status = 'suspended') then 'suspended' end
      ], null) as reasons
    from public.organizations o
    left join bal b on b.id = o.id
    left join public.credit_wallet_holds h on h.organization_id = o.id and h.cleared_at is null
    where o.parent_organization_id is null and (b.id is not null
      or exists (select 1 from public.organization_product_subscriptions s where s.organization_id = o.id)
      or exists (select 1 from public.organization_entitlements e where e.organization_id = o.id)
      or exists (select 1 from public.payment_events p where p.organization_id = o.id))),
  hit as (
    select * from acc a
    where (v_like is null or a.name ilike v_like or a.slug ilike v_like
        or exists (select 1 from public.organization_memberships m join public.profiles pr on pr.id = m.user_id
          join public.organizations mo on mo.id = m.organization_id
          where coalesce(mo.parent_organization_id, mo.id) = a.id and pr.email ilike v_like)
        or exists (select 1 from public.payment_events p where p.organization_id = a.id and p.event_id ilike v_like)
        or exists (select 1 from public.organization_product_subscriptions s where s.organization_id = a.id and s.source_ref ilike v_like))
      and case p_filter when 'attention' then cardinality(a.reasons) > 0 when 'balance' then a.balance > 0
        when 'contract' then a.has_contract when 'internal' then a.kind = 'internal' else true end)
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
        'accounts', count(*),
        'unused_units', coalesce(sum(a.balance) filter (where a.kind = 'customer' and a.balance > 0), 0),
        'unused_accounts', count(*) filter (where a.kind = 'customer' and a.balance > 0),
        'granted_30d', coalesce(sum(a.granted_30d), 0), 'spent_30d', coalesce(sum(a.spent_30d), 0),
        'frozen', count(*) filter (where 'frozen' = any(a.reasons)),
        'overdrawn', count(*) filter (where 'overdrawn' = any(a.reasons)),
        'past_due', count(*) filter (where 'past_due' = any(a.reasons)),
        'suspended', count(*) filter (where 'suspended' = any(a.reasons)),
        'attention', count(*) filter (where cardinality(a.reasons) > 0)) from acc a),
    'matching', (select count(*) from hit),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('organization_id', x.id, 'name', x.name, 'slug', x.slug, 'kind', x.kind,
        'balance', x.balance, 'granted_30d', x.granted_30d, 'spent_30d', x.spent_30d, 'frozen_since', x.frozen_since,
        'reasons', to_jsonb(x.reasons),
        'contracts', (select coalesce(jsonb_agg(jsonb_build_object('product_key', s.product_key, 'plan_key', s.plan_key,
            'status', s.status, 'current_period_end', s.current_period_end) order by s.product_key, s.created_at), '[]'::jsonb)
          from public.organization_product_subscriptions s where s.organization_id = x.id and s.status <> 'canceled'),
        'next_period_end', (select min(s.current_period_end) from public.organization_product_subscriptions s
          where s.organization_id = x.id and s.status <> 'canceled'),
        'last_payment', (select jsonb_build_object('at', p.received_at, 'kind', p.kind, 'provider', p.provider)
          from public.payment_events p where p.organization_id = x.id order by p.received_at desc limit 1))
        order by x.name, x.id), '[]'::jsonb)
      from (select * from hit order by name, id limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) x))
  into v_result;
  return v_result;
end $$;

notify pgrst, 'reload schema';
commit;
