-- 0179: which products each root account holds a live right for, by source -- one grouped read for the member tags
-- (next-admin lib/entitlements/member-tags-reads.ts), so the client rail never pulls hundreds of right rows per account
-- (an all-features account has 300+). Live = the one filter of tables.ts activeRows: active, started, not ended.
-- <product>.resell licences are left out (they are a way of their own). pay = limits->>'pay' ('' when absent): a
-- credit-pack right is not a subscription. Read-only, security invoker, service_role only.
begin;
set local lock_timeout = '5s';

create function public.entitlement_held_products()
returns table (organization_id uuid, product_key text, source text, pay text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select e.organization_id, e.product_key, e.source, coalesce(e.limits->>'pay', '') as pay
  from public.organization_entitlements e
  where e.status = 'active' and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
    and e.feature_key <> e.product_key || '.resell'
  group by e.organization_id, e.product_key, e.source, coalesce(e.limits->>'pay', '')
$$;
revoke all on function public.entitlement_held_products() from public, anon, authenticated;
grant execute on function public.entitlement_held_products() to service_role;

notify pgrst, 'reload schema';
commit;
