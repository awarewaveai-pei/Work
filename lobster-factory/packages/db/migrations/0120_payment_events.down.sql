-- Back to 0119. Refused once a payment event exists: contracts, grants and ledger rows it wrote stay (audit), so after
-- that the fix is forward (ADR 017 step 4 card, Codex C2). Restores 0066's media_credit_reserve and 0110's balance.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.payment_events') is not null and exists (select 1 from public.payment_events) then
    raise exception 'payment_events has rows: 0120 is rolled forward, not down';
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0120_payment_events.sql';
  end if;
end $$;
drop function if exists public.billing_overview(integer, integer);
drop function if exists public.billing_apply_payment_event(text, text, jsonb);
drop table if exists public.credit_wallet_holds;
drop table if exists public.payment_events;
drop function if exists public.payment_audit_rows_immutable();

create or replace function public.media_credit_reserve(
  p_organization_id uuid, p_units integer, p_idempotency_key text,
  p_reference_type text default null, p_reference_id text default null
) returns table(allowed boolean, balance integer, ledger_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_balance integer; inserted_id uuid; hard_limit integer; account_status text;
begin
  if p_units <= 0 then raise exception 'p_units must be positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  if exists (select 1 from public.media_credit_ledger where idempotency_key = p_idempotency_key and organization_id <> p_organization_id) then raise exception 'idempotency key belongs to another organization'; end if;
  select id into inserted_id from public.media_credit_ledger where idempotency_key = p_idempotency_key and organization_id = p_organization_id;
  if inserted_id is not null then
    select coalesce(sum(units), 0)::integer into current_balance from public.media_credit_ledger where organization_id = p_organization_id;
    return query select true, current_balance, inserted_id; return;
  end if;
  select coalesce(sum(units), 0)::integer into current_balance from public.media_credit_ledger where organization_id = p_organization_id;
  select status, hard_credit_limit into account_status, hard_limit from public.media_billing_accounts where organization_id = p_organization_id;
  if account_status is not null and account_status <> 'active' then return query select false, current_balance, null::uuid; return; end if;
  if hard_limit is not null and hard_limit > 0 and current_balance - p_units < -hard_limit then return query select false, current_balance, null::uuid; return; end if;
  if current_balance < p_units then return query select false, current_balance, null::uuid; return; end if;
  insert into public.media_credit_ledger(organization_id, units, entry_type, idempotency_key, reference_type, reference_id)
    values (p_organization_id, -p_units, 'debit', p_idempotency_key, p_reference_type, p_reference_id)
    on conflict (idempotency_key) do nothing returning id into inserted_id;
  if inserted_id is null then select id into inserted_id from public.media_credit_ledger where idempotency_key = p_idempotency_key and organization_id = p_organization_id; end if;
  return query select true, (current_balance - p_units), inserted_id;
end $$;
revoke all on function public.media_credit_reserve(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.media_credit_reserve(uuid, integer, text, text, text) to service_role;

create or replace function public.entitlement_credit_balance(p_organization_id uuid) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(sum(units), 0)::numeric from public.media_credit_ledger where organization_id = p_organization_id;
$$;
revoke all on function public.entitlement_credit_balance(uuid) from public, anon, authenticated;
grant execute on function public.entitlement_credit_balance(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
