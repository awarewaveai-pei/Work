-- 0142 down: billing_seller_month back to 0141's text (month by received_at). Read-only function, no data.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0142_billing_seller_month_paid_at.sql';
  end if;
end $$;

create or replace function public.billing_seller_month(p_month date)
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

drop function if exists public.billing_try_timestamptz(text);

notify pgrst, 'reload schema';
commit;
