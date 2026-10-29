-- 0141: /ops/billing shows who sold each account (ADR 017 #12, cards/step-4-seller.md 4c-2, decision D4: the wholesale
-- bill between AwareWave and a seller is settled by a monthly report and an invoice outside the control plane).
-- billing_ledger (0131's text) keeps its signature and gains: every row carries sold_by_id / sold_by (organizations.sold_by_organization_id,
-- null = AwareWave direct, shown as the internal root account), and p_filter accepts 'seller:<uuid>' (accounts that seller sold;
-- the AwareWave uuid matches the direct sales). totals stay over every account. New billing_seller_month(p_month):
-- per seller, the month's subscription payments and credit packs sold (orders and credits), by Asia/Taipei calendar month,
-- from processed payment_events; a sale is the seller whose site sent it (payment_events.site_id -> seller_sites), so an
-- operator-recorded local entry for a seller's buyer is no seller's sale (critic 2026-10-29 M3). Refunds are not netted.
-- The month is when the control plane received the event (received_at): the event carries no paid-at time, and the store
-- plugin retries for about 3.5 days (PaymentSender.php MAX_DELAY), so a sale in a month's last days can land in the next.
-- Read-only, security invoker, service_role only.
begin;
set local lock_timeout = '5s';

create or replace function public.billing_ledger(p_filter text default 'all', p_query text default null,
  p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_like text := case when nullif(btrim(p_query), '') is null then null
    else '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  v_internal uuid := (select id from public.organizations where kind = 'internal' and parent_organization_id is null);
  v_seller uuid;
  v_result jsonb;
begin
  if p_filter like 'seller:%' then
    begin
      v_seller := substr(p_filter, 8)::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_filter:%', p_filter;
    end;
  elsif p_filter is null or p_filter not in ('all', 'attention', 'balance', 'contract', 'internal') then
    raise exception 'invalid_filter:%', p_filter;
  end if;
  with bal as (select l.organization_id as id, sum(l.units) as balance,
      coalesce(sum(l.units) filter (where l.units > 0 and l.created_at > now() - interval '30 days'), 0) as granted_30d,
      coalesce(-sum(l.units) filter (where l.units < 0 and l.created_at > now() - interval '30 days'), 0) as spent_30d
    from public.media_credit_ledger l group by 1),
  acc as (
    select o.id, o.name, o.slug, o.kind, coalesce(b.balance, 0) as balance, coalesce(b.granted_30d, 0) as granted_30d,
      coalesce(b.spent_30d, 0) as spent_30d, h.created_at as frozen_since,
      coalesce(o.sold_by_organization_id, v_internal) as sold_by_id, sb.name as sold_by,
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
    left join public.organizations sb on sb.id = coalesce(o.sold_by_organization_id, v_internal)
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
        or exists (select 1 from public.payment_events p where p.organization_id = a.id
          and (p.event_id ilike v_like or p.payload->>'order_ref' ilike v_like or p.payload->>'external_ref' ilike v_like))
        or exists (select 1 from public.organization_product_subscriptions s where s.organization_id = a.id and s.source_ref ilike v_like))
      and case when v_seller is not null then a.sold_by_id = v_seller
        when p_filter = 'attention' then cardinality(a.reasons) > 0 when p_filter = 'balance' then a.balance > 0
        when p_filter = 'contract' then a.has_contract when p_filter = 'internal' then a.kind = 'internal' else true end)
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
        'sold_by_id', x.sold_by_id, 'sold_by', x.sold_by,
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

revoke all on function public.billing_ledger(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.billing_ledger(text, text, integer, integer) to service_role;

create function public.billing_seller_month(p_month date)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_internal uuid := (select id from public.organizations where kind = 'internal' and parent_organization_id is null);
  v_from timestamptz;
  v_to timestamptz;
  v_rows jsonb;
begin
  if p_month is null then raise exception 'invalid_month'; end if;
  v_from := date_trunc('month', p_month::timestamp) at time zone 'Asia/Taipei';
  v_to := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'Asia/Taipei';
  with seller as (
    select v_internal as id
    union select seller_organization_id from public.seller_sites
    union select sold_by_organization_id from public.organizations where sold_by_organization_id is not null),
  paid as (
    select ss.seller_organization_id as seller_id, p.kind,
      case when p.kind = 'credit_pack' then coalesce((p.result->>'units')::bigint, 0) else 0 end as units
    from public.payment_events p join public.seller_sites ss on ss.id = p.site_id
    where p.processed_at is not null and p.kind in ('subscription_paid', 'credit_pack')
      and p.received_at >= v_from and p.received_at < v_to)
  select coalesce(jsonb_agg(jsonb_build_object('seller_id', s.id, 'seller', so.name,
      'subscription_payments', (select count(*) from paid x where x.seller_id = s.id and x.kind = 'subscription_paid'),
      'credit_pack_orders', (select count(*) from paid x where x.seller_id = s.id and x.kind = 'credit_pack' and x.units > 0),
      'credit_pack_units', (select coalesce(sum(x.units), 0) from paid x where x.seller_id = s.id and x.kind = 'credit_pack'))
      order by (s.id = v_internal) desc, so.name, s.id), '[]'::jsonb)
  into v_rows
  from seller s join public.organizations so on so.id = s.id;
  return jsonb_build_object('month', to_char(date_trunc('month', p_month::timestamp), 'YYYY-MM'), 'rows', v_rows);
end $$;

revoke all on function public.billing_seller_month(date) from public, anon, authenticated;
grant execute on function public.billing_seller_month(date) to service_role;

notify pgrst, 'reload schema';
commit;
