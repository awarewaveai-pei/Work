-- 0142: ADR 017 #12 D4. The monthly seller report (0141 billing_seller_month) puts a sale in the month the buyer paid,
-- not the month the control plane heard of it: the store plugin (aware-wave-store 1.2.0) sends paid_at from the
-- WooCommerce order's own payment time, and retries a failed send for about 3.5 days (PaymentSender.php MAX_DELAY), so
-- a payment on the 31st could arrive on the 2nd (Codex 2026-10-29 partialreview-41670a16). paid_at is believed only
-- within 7 days before receipt; otherwise, and for events without it, the month is still received_at.
-- Read-only function; same signature, so create or replace keeps its grants.
begin;
set local lock_timeout = '5s';

-- A time a site sent, or null when it is not one (malformed, or a date that does not exist such as 2026-02-31): a bad
-- value must not break the whole report.
create function public.billing_try_timestamptz(p text) returns timestamptz
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' then return null; end if;
  return p::timestamptz;
exception when others then
  return null;
end $$;
revoke all on function public.billing_try_timestamptz(text) from public, anon, authenticated;
grant execute on function public.billing_try_timestamptz(text) to service_role;

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
    -- the month a sale belongs to: when the shop recorded the payment, believed only within 7 days before receipt
    -- (the store plugin retries about 3.5 days); anything else -- none sent, malformed, outside the window -- is
    -- when the event arrived, so a site cannot move a sale into another month by naming a date
    cross join lateral (select public.billing_try_timestamptz(p.payload->>'paid_at') as paid) pa
    cross join lateral (select case when pa.paid between p.received_at - interval '7 days' and p.received_at
        then pa.paid else p.received_at end as at) t
    where p.processed_at is not null and p.kind in ('subscription_paid', 'credit_pack')
      and t.at >= v_from and t.at < v_to)
  select coalesce(jsonb_agg(jsonb_build_object('seller_id', s.id, 'seller', so.name,
      'subscription_payments', (select count(*) from paid x where x.seller_id = s.id and x.kind = 'subscription_paid'),
      'credit_pack_orders', (select count(*) from paid x where x.seller_id = s.id and x.kind = 'credit_pack' and x.units > 0),
      'credit_pack_units', (select coalesce(sum(x.units), 0) from paid x where x.seller_id = s.id and x.kind = 'credit_pack'))
      order by (s.id = v_internal) desc, so.name, s.id), '[]'::jsonb)
  into v_rows
  from seller s join public.organizations so on so.id = s.id;
  return jsonb_build_object('month', to_char(date_trunc('month', p_month::timestamp), 'YYYY-MM'), 'rows', v_rows);
end $$;

notify pgrst, 'reload schema';
commit;
