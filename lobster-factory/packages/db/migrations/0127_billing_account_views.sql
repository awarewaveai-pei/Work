-- 0127: /ops/billing scales to thousands of accounts. 0120's billing_overview returns every account with its full
-- detail in one jsonb; two reads whose size does not grow with the number of accounts replace it:
--   billing_account(org)              one account's detail, for the 帳務 tab on /ops/clients/<slug> (a brand resolves to its root)
--   billing_attention(limit, offset)  totals over every root account (computed here, never summed in the app) plus one page
--                                     of accounts that need a person: wallet frozen, overdrawn, contract past_due, grants suspended
-- Read-only, security invoker, service_role only. Expand only: billing_overview stays until the code that calls these is
-- live (the deployed build, or a rollback to it, still calls it); a later migration drops it.
begin;
set local lock_timeout = '5s';

create function public.billing_account(p_organization_id uuid, p_ledger_rows integer default 20, p_event_rows integer default 10)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
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
      from (select * from public.media_credit_ledger l where l.organization_id = a.id
        order by l.created_at desc limit least(greatest(p_ledger_rows, 1), 200)) l),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('at', p.received_at, 'provider', p.provider, 'event_id', p.event_id,
        'kind', p.kind, 'result', p.result) order by p.received_at desc), '[]'::jsonb)
      from (select * from public.payment_events p where p.organization_id = a.id
        order by p.received_at desc limit least(greatest(p_event_rows, 1), 200)) p))
  from public.organizations o
  join public.organizations a on a.id = coalesce(o.parent_organization_id, o.id)
  where o.id = p_organization_id;
$$;

create function public.billing_attention(p_limit integer default 50, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with bal as (select l.organization_id as id, sum(l.units) as balance from public.media_credit_ledger l group by 1),
  acc as (
    select o.id, o.name, o.slug, o.kind, coalesce(b.balance, 0) as balance, h.created_at as frozen_since,
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
    where o.parent_organization_id is null)
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
        'unused_units', coalesce(sum(a.balance) filter (where a.kind = 'customer' and a.balance > 0), 0),
        'unused_accounts', count(*) filter (where a.kind = 'customer' and a.balance > 0),
        'frozen', count(*) filter (where 'frozen' = any(a.reasons)),
        'overdrawn', count(*) filter (where 'overdrawn' = any(a.reasons)),
        'past_due', count(*) filter (where 'past_due' = any(a.reasons)),
        'suspended', count(*) filter (where 'suspended' = any(a.reasons)),
        'attention', count(*) filter (where cardinality(a.reasons) > 0)) from acc a),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('organization_id', x.id, 'name', x.name, 'slug', x.slug, 'kind', x.kind,
        'balance', x.balance, 'frozen_since', x.frozen_since, 'reasons', to_jsonb(x.reasons)) order by x.name, x.id), '[]'::jsonb)
      from (select * from acc where cardinality(reasons) > 0 order by name, id
        limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) x));
$$;

revoke all on function public.billing_account(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.billing_attention(integer, integer) from public, anon, authenticated;
grant execute on function public.billing_account(uuid, integer, integer) to service_role;
grant execute on function public.billing_attention(integer, integer) to service_role;

notify pgrst, 'reload schema';
commit;
