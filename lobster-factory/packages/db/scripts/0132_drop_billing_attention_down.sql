-- Back to 0131: restores 0127's billing_attention byte for byte (needed only to roll the app back before 44dd16561).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0132_drop_billing_attention.sql';
  end if;
end $$;
drop function if exists public.billing_attention(integer, integer);

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

revoke all on function public.billing_attention(integer, integer) from public, anon, authenticated;
grant execute on function public.billing_attention(integer, integer) to service_role;

notify pgrst, 'reload schema';
commit;
