-- 0120: ADR 017 step 4a. A payment becomes a contract, grant rows and a wallet entry in one transaction.
-- Every provider (4a: local = the operator records a bank transfer; 4b: woo) hands the control plane one PaymentEvent.
-- billing_apply_payment_event writes the inbox row payment_events(provider, event_id) first, so a replay is a no-op, then
-- the contract (0062), the grant rows (0110) and the ledger entry (0066) in the same transaction. A rejected event
-- raises 'payment_rejected:<code>' and leaves nothing, not even its inbox row, so it can be sent again once fixed.
-- Grant state machine (ADR 017 §3): plan change (trial -> paid included) = the contract's live rows end now and the new
-- plan's rows start; renewal = live rows run to period end + grace; cancel = rows end at period end + grace and the
-- contract stays active until the daily sweep (endLapsedTrials) sees its grants gone, so the launcher and can() agree;
-- refund of a subscription = contract canceled, rows end now; refund of a credit pack takes back only its unused part,
-- spending counted first in, first out (the oldest grant is spent first); chargeback = contract past_due, its rows suspended and a wallet hold, all lifted only by a local
-- chargeback_cleared (manual review).
-- Invariant: one live row per (account, product, feature) among customer rows. findActiveEntitlement takes the oldest,
-- so a new contract row ends a customer comp row for its feature here (a paid contract supersedes a comp); a feature
-- another live contract already grants (base and add-on plans sharing a feature) is refused, never silently taken.
-- Contracts are found by (account, product, plan): enough for operator-recorded payments; 4b's Woo events need the
-- provider's subscription id and event time (out-of-order renewals), see cards/step-4.md.
-- Accounts in organization_all_features cannot buy a subscription (the daily top-up would add rows back); they can buy
-- credits. Access: service_role only. payment_events and credit_wallet_holds rows are never deleted (audit).
begin;
set local lock_timeout = '5s';

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('local','woo')),
  event_id text not null check (length(event_id) between 1 and 200),
  kind text not null check (kind in ('subscription_paid','subscription_canceled','credit_pack','refund','chargeback','chargeback_cleared')),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  result jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
create index payment_events_org_idx on public.payment_events(organization_id, received_at desc);

create table public.credit_wallet_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reason text not null check (length(reason) > 0),
  payment_event_id uuid not null references public.payment_events(id) on delete restrict,
  cleared_by uuid references public.payment_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  check ((cleared_at is null) = (cleared_by is null))
);
create unique index credit_wallet_holds_open_uniq on public.credit_wallet_holds(organization_id) where cleared_at is null;

create function public.payment_audit_rows_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception '% rows are an audit record and are never deleted', tg_table_name; end if;
  -- Through jsonb: a record field another table lacks fails even behind a false tg_table_name test.
  if tg_table_name = 'payment_events' then
    if to_jsonb(old)->>'processed_at' is not null
        or (to_jsonb(new) - 'processed_at' - 'result') <> (to_jsonb(old) - 'processed_at' - 'result') then
      raise exception 'payment_events rows are written once';
    end if;
  elsif to_jsonb(old)->>'cleared_at' is not null
      or (to_jsonb(new) - 'cleared_at' - 'cleared_by') <> (to_jsonb(old) - 'cleared_at' - 'cleared_by') then
    raise exception 'a wallet hold changes only by being cleared once';
  end if;
  return new;
end $$;
revoke all on function public.payment_audit_rows_immutable() from public, anon, authenticated;
create trigger payment_events_immutable before update or delete on public.payment_events
  for each row execute function public.payment_audit_rows_immutable();
create trigger credit_wallet_holds_immutable before update or delete on public.credit_wallet_holds
  for each row execute function public.payment_audit_rows_immutable();

do $$ declare t text; begin
  foreach t in array array['payment_events','credit_wallet_holds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    -- No delete/truncate, even for service_role (row triggers do not fire on TRUNCATE); default privileges grant
    -- ALL on new tables, so take it back first.
    execute format('revoke all on table public.%I from service_role', t);
    execute format('grant select, insert, update on table public.%I to service_role', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_role', t);
  end loop;
end $$;

-- 0066's debit, refused while the wallet has an open hold (a chargeback under review).
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
  if exists (select 1 from public.credit_wallet_holds where organization_id = p_organization_id and cleared_at is null) then return query select false, current_balance, null::uuid; return; end if;
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

-- What can() may spend: 0 while the wallet has an open hold. /ops/billing shows the ledger sum itself.
create or replace function public.entitlement_credit_balance(p_organization_id uuid) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select case when exists (select 1 from public.credit_wallet_holds where organization_id = p_organization_id and cleared_at is null) then 0::numeric
    else (select coalesce(sum(units), 0)::numeric from public.media_credit_ledger where organization_id = p_organization_id) end;
$$;
revoke all on function public.entitlement_credit_balance(uuid) from public, anon, authenticated;
grant execute on function public.entitlement_credit_balance(uuid) to service_role;

create function public.billing_apply_payment_event(p_provider text, p_event_id text, p_event jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  c_grace constant interval := interval '7 days';
  v_kind text := p_event->>'kind';
  v_org uuid;
  v_inbox uuid;
  v_prior public.payment_events%rowtype;
  v_plan public.plans%rowtype;
  v_contract public.organization_product_subscriptions%rowtype;
  v_found boolean;
  v_period_end timestamptz;
  v_end timestamptz;
  v_ref text;
  v_units integer;
  v_balance bigint;
  v_newer bigint;
  v_grant_id uuid;
  v_grant_at timestamptz;
  v_ledger uuid;
  v_n integer;
  v_result jsonb;
begin
  if p_provider is null or p_provider not in ('local','woo') then raise exception 'payment_rejected:unknown_provider'; end if;
  if p_event_id is null or length(p_event_id) not between 1 and 200 then raise exception 'payment_rejected:invalid_event_id'; end if;
  if jsonb_typeof(p_event) is distinct from 'object' then raise exception 'payment_rejected:invalid_event'; end if;
  if v_kind is null or v_kind not in ('subscription_paid','subscription_canceled','credit_pack','refund','chargeback','chargeback_cleared') then
    raise exception 'payment_rejected:unknown_kind';
  end if;
  -- Clearing a chargeback is the manual review; no automatic provider may send it.
  if v_kind = 'chargeback_cleared' and p_provider <> 'local' then raise exception 'payment_rejected:manual_review_only'; end if;
  begin
    v_org := (p_event->>'organization_id')::uuid;
  exception when invalid_text_representation then raise exception 'payment_rejected:invalid_organization';
  end;
  if v_org is null or not exists (select 1 from public.organizations where id = v_org and parent_organization_id is null and kind = 'customer') then
    raise exception 'payment_rejected:not_a_customer_billing_account';
  end if;

  -- Same lock as media_credit_reserve (0066): payments and debits on one wallet run one at a time.
  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 0));
  insert into public.payment_events(provider, event_id, kind, organization_id, payload)
    values (p_provider, p_event_id, v_kind, v_org, p_event)
    on conflict (provider, event_id) do nothing returning id into v_inbox;
  if v_inbox is null then
    select * into v_prior from public.payment_events where provider = p_provider and event_id = p_event_id;
    -- An event id reused for a different payment is an operator error, never a silent no-op.
    if v_prior.payload <> p_event then raise exception 'payment_rejected:event_id_reused'; end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'event', v_prior.id);
  end if;

  if v_kind in ('subscription_paid','credit_pack')
      and exists (select 1 from public.credit_wallet_holds where organization_id = v_org and cleared_at is null) then
    raise exception 'payment_rejected:account_frozen';
  end if;

  if v_kind in ('subscription_paid','subscription_canceled') or (v_kind = 'refund' and p_event->>'target' = 'subscription') then
    select * into v_plan from public.plans where plan_key = p_event->>'plan_key';
    if not found then raise exception 'payment_rejected:unknown_plan'; end if;
  end if;

  if v_kind = 'subscription_paid' then
    if coalesce(p_event->>'period_end', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$' then
      raise exception 'payment_rejected:invalid_period_end';
    end if;
    begin
      v_period_end := (p_event->>'period_end')::timestamptz;
    exception when others then raise exception 'payment_rejected:invalid_period_end';
    end;
    if v_period_end is null or v_period_end <= now() or v_period_end > now() + interval '3 years' then
      raise exception 'payment_rejected:invalid_period_end';
    end if;
    if jsonb_array_length(v_plan.features) = 0 then raise exception 'payment_rejected:plan_has_no_features'; end if;
    if exists (select 1 from jsonb_each(v_plan.limits) l where jsonb_typeof(l.value) <> 'object') then
      raise exception 'payment_rejected:invalid_plan_limits';
    end if;
    if exists (select 1 from public.organization_all_features where organization_id = v_org) then
      raise exception 'payment_rejected:account_covers_all_features';
    end if;
    v_ref := p_provider || ':' || coalesce(nullif(p_event->>'external_ref', ''), p_event_id);
    -- A product has at most one base contract (trial included): a base payment updates it in place (ADR 017 §3).
    if v_plan.kind = 'base' then
      select count(*) into v_n from public.organization_product_subscriptions s join public.plans p using (plan_key, product_key)
        where s.organization_id = v_org and s.product_key = v_plan.product_key and s.status <> 'canceled' and p.kind = 'base';
      if v_n > 1 then raise exception 'payment_rejected:multiple_base_contracts'; end if;
      select s.* into v_contract from public.organization_product_subscriptions s join public.plans p using (plan_key, product_key)
        where s.organization_id = v_org and s.product_key = v_plan.product_key and s.status <> 'canceled' and p.kind = 'base' for update of s;
    else
      select * into v_contract from public.organization_product_subscriptions
        where organization_id = v_org and product_key = v_plan.product_key and plan_key = v_plan.plan_key and status <> 'canceled' for update;
    end if;
    v_found := found;
    if not v_found then
      insert into public.organization_product_subscriptions(organization_id, product_key, plan_key, status, started_at, current_period_end, source_ref)
        values (v_org, v_plan.product_key, v_plan.plan_key, 'active', now(), v_period_end, v_ref) returning * into v_contract;
    elsif v_contract.plan_key <> v_plan.plan_key then
      -- Plan change: every live row of the old plan ends now; the new plan's rows are inserted below.
      update public.organization_entitlements e set status = 'expired', ends_at = case when e.starts_at < now() then now() else e.ends_at end
        where e.organization_id = v_org and e.source = 'contract' and e.source_ref = v_contract.id::text and e.status in ('active','suspended') and (e.ends_at is null or e.ends_at > now());
      update public.organization_product_subscriptions set plan_key = v_plan.plan_key, status = 'active', current_period_end = v_period_end, source_ref = v_ref
        where id = v_contract.id returning * into v_contract;
    else
      -- Renewal: a late, older event never shortens the period.
      update public.organization_product_subscriptions
        set status = 'active', current_period_end = greatest(coalesce(current_period_end, v_period_end), v_period_end), source_ref = v_ref
        where id = v_contract.id returning * into v_contract;
    end if;
    v_end := v_contract.current_period_end + c_grace;
    -- This contract's rows: a feature the plan dropped, or whose limits changed, ends now; the rest run to v_end.
    update public.organization_entitlements e set status = 'expired', ends_at = case when e.starts_at < now() then now() else e.ends_at end
      where e.organization_id = v_org and e.source = 'contract' and e.source_ref = v_contract.id::text and e.status = 'active' and (e.ends_at is null or e.ends_at > now())
        and (not (v_plan.features ? e.feature_key) or e.limits is distinct from coalesce(v_plan.limits->e.feature_key, '{}'::jsonb));
    update public.organization_entitlements e set ends_at = v_end
      where e.organization_id = v_org and e.source = 'contract' and e.source_ref = v_contract.id::text and e.status = 'active' and (e.ends_at is null or e.ends_at > now())
        and e.starts_at < v_end;
    -- One live row per (account, product, feature). A feature another live contract grants is plan data to fix (base
    -- and add-on sharing it), not a row to end: ending it would take a paid feature away when this contract ends.
    if exists (select 1 from public.organization_entitlements e
        where e.organization_id = v_org and e.product_key = v_plan.product_key and v_plan.features ? e.feature_key
          and e.source = 'contract' and e.source_ref <> v_contract.id::text and e.status in ('active','suspended')
          and (e.ends_at is null or e.ends_at > now())) then
      raise exception 'payment_rejected:feature_in_another_contract';
    end if;
    -- A customer comp row for a feature this plan grants ends now: the paid contract supersedes it.
    update public.organization_entitlements e set status = 'expired', ends_at = case when e.starts_at < now() then now() else e.ends_at end
      where e.organization_id = v_org and e.product_key = v_plan.product_key and v_plan.features ? e.feature_key
        and e.source = 'comp' and coalesce(e.source_ref, '') not like 'all-features:%'
        and e.status = 'active' and (e.ends_at is null or e.ends_at > now());
    insert into public.organization_entitlements(organization_id, product_key, feature_key, source, source_ref, starts_at, ends_at, limits)
      select v_org, v_plan.product_key, f.feature, 'contract', v_contract.id::text, now(), v_end, coalesce(v_plan.limits->f.feature, '{}'::jsonb)
      from (select distinct jsonb_array_elements_text(v_plan.features) as feature) f
      where not exists (select 1 from public.organization_entitlements e where e.organization_id = v_org and e.source = 'contract' and e.source_ref = v_contract.id::text
        and e.feature_key = f.feature and e.status = 'active' and (e.ends_at is null or e.ends_at > now()));
    select count(*) into v_n from public.organization_entitlements e
      where e.organization_id = v_org and e.source = 'contract' and e.source_ref = v_contract.id::text and e.status = 'active' and (e.ends_at is null or e.ends_at > now());
    v_result := jsonb_build_object('contract', v_contract.id, 'plan_key', v_plan.plan_key, 'current_period_end', v_contract.current_period_end, 'entitlements', v_n);

  elsif v_kind = 'subscription_canceled' then
    select * into v_contract from public.organization_product_subscriptions
      where organization_id = v_org and product_key = v_plan.product_key and plan_key = v_plan.plan_key and status <> 'canceled' for update;
    if not found then
      if not exists (select 1 from public.organization_product_subscriptions where organization_id = v_org and plan_key = v_plan.plan_key) then
        raise exception 'payment_rejected:unknown_contract';
      end if;
      v_result := jsonb_build_object('already_ended', true);
    else
      -- Paid to the end of the period: no new rows, the live ones end at period end + grace. The contract stays as it
      -- is (the launcher keeps the product open while can() does); the daily sweep cancels it once its grants are gone,
      -- and a payment before then simply renews it.
      v_end := coalesce(v_contract.current_period_end, now()) + c_grace;
      update public.organization_entitlements e set
          status = case when v_end > e.starts_at then e.status else 'expired' end,
          ends_at = case when v_end > e.starts_at then least(coalesce(e.ends_at, v_end), v_end) else e.ends_at end
        where e.organization_id = v_org and e.source = 'contract' and e.source_ref = v_contract.id::text and e.status in ('active','suspended') and (e.ends_at is null or e.ends_at > now());
      get diagnostics v_n = row_count;
      v_result := jsonb_build_object('contract', v_contract.id, 'ends_at', v_end, 'entitlements', v_n);
    end if;

  elsif v_kind = 'credit_pack' then
    begin
      v_units := (p_event->>'units')::integer;
    exception when others then raise exception 'payment_rejected:invalid_units';
    end;
    v_ref := p_event->>'order_ref';
    if v_units is null or v_units not between 1 and 10000000 then raise exception 'payment_rejected:invalid_units'; end if;
    if v_ref is null or length(v_ref) not between 1 and 100 then raise exception 'payment_rejected:invalid_order_ref'; end if;
    if exists (select 1 from public.media_credit_ledger where idempotency_key = 'pack:' || p_provider || ':' || v_ref and organization_id <> v_org) then
      raise exception 'payment_rejected:order_belongs_to_another_account';
    end if;
    -- The order id is the idempotency key: a second event for one order grants nothing.
    insert into public.media_credit_ledger(organization_id, units, entry_type, idempotency_key, reference_type, reference_id, metadata)
      values (v_org, v_units, 'grant', 'pack:' || p_provider || ':' || v_ref, 'payment', v_ref, jsonb_build_object('event', v_inbox))
      on conflict (idempotency_key) do nothing returning id into v_ledger;
    if v_ledger is null and exists (select 1 from public.media_credit_ledger
        where idempotency_key = 'pack:' || p_provider || ':' || v_ref and organization_id <> v_org) then
      raise exception 'payment_rejected:order_belongs_to_another_account';   -- the advisory lock is per account
    end if;
    v_result := case when v_ledger is null then jsonb_build_object('units', 0, 'already_granted', true)
      else jsonb_build_object('ledger', v_ledger, 'units', v_units) end;

  elsif v_kind = 'refund' and p_event->>'target' = 'subscription' then
    select * into v_contract from public.organization_product_subscriptions
      where organization_id = v_org and product_key = v_plan.product_key and plan_key = v_plan.plan_key
      order by (status <> 'canceled') desc, created_at desc limit 1 for update;
    if not found then raise exception 'payment_rejected:unknown_contract'; end if;
    update public.organization_product_subscriptions set status = 'canceled' where id = v_contract.id and status <> 'canceled';
    update public.organization_entitlements e set status = 'expired', ends_at = case when e.starts_at < now() then now() else e.ends_at end
      where e.organization_id = v_org and e.source = 'contract' and e.source_ref = v_contract.id::text and e.status in ('active','suspended') and (e.ends_at is null or e.ends_at > now());
    get diagnostics v_n = row_count;
    v_result := jsonb_build_object('contract', v_contract.id, 'entitlements_ended', v_n);

  elsif v_kind = 'refund' and p_event->>'target' = 'credit_pack' then
    v_ref := p_event->>'order_ref';
    select units, id, created_at into v_units, v_grant_id, v_grant_at from public.media_credit_ledger
      where organization_id = v_org and idempotency_key = 'pack:' || p_provider || ':' || coalesce(v_ref, '') and entry_type = 'grant';
    if not found then raise exception 'payment_rejected:unknown_order'; end if;
    if exists (select 1 from public.payment_events where organization_id = v_org and provider = p_provider and kind = 'refund'
        and payload->>'target' = 'credit_pack' and payload->>'order_ref' = v_ref and processed_at is not null and id <> v_inbox) then
      v_result := jsonb_build_object('refunded_units', 0, 'already_refunded', true);
    else
      -- One shared wallet, spent first in, first out: what is left belongs to the newest grants, so this pack's unused
      -- part = the balance beyond every later grant (net of that grant's own refund), up to the pack's size. Refunding
      -- an old, spent pack therefore returns nothing and never takes a newer pack's credits.
      select coalesce(sum(units), 0) into v_balance from public.media_credit_ledger where organization_id = v_org;
      select coalesce(sum(g.units + coalesce((select sum(r.units) from public.media_credit_ledger r
          where r.organization_id = v_org and r.entry_type = 'refund' and r.idempotency_key = 'pack-refund:' || substr(g.idempotency_key, 6)), 0)), 0)
        into v_newer from public.media_credit_ledger g
        where g.organization_id = v_org and g.entry_type = 'grant' and (g.created_at, g.id) > (v_grant_at, v_grant_id);
      v_n := least(v_units::bigint, greatest(v_balance - v_newer, 0))::integer;
      if v_n > 0 then
        insert into public.media_credit_ledger(organization_id, units, entry_type, idempotency_key, reference_type, reference_id, metadata)
          values (v_org, -v_n, 'refund', 'pack-refund:' || p_provider || ':' || v_ref, 'payment', v_ref,
            jsonb_build_object('event', v_inbox, 'granted', v_units, 'spent', v_units - v_n))
          returning id into v_ledger;
      end if;
      v_result := jsonb_build_object('refunded_units', v_n, 'granted_units', v_units, 'ledger', v_ledger);
    end if;

  elsif v_kind = 'refund' then
    raise exception 'payment_rejected:invalid_refund_target';

  elsif v_kind = 'chargeback' then
    insert into public.credit_wallet_holds(organization_id, reason, payment_event_id)
      select v_org, 'chargeback', v_inbox
      where not exists (select 1 from public.credit_wallet_holds where organization_id = v_org and cleared_at is null);
    -- Only rows bought with money; comp rows and organization_all_features rows (re-added daily) are left alone.
    update public.organization_entitlements e set status = 'suspended'
      where e.organization_id = v_org and e.source = 'contract' and e.status = 'active' and (e.ends_at is null or e.ends_at > now())
        and coalesce(e.source_ref, '') not like 'all-features:%';
    get diagnostics v_n = row_count;
    -- The contract says what can() says: not open (the launcher opens only active and trial).
    update public.organization_product_subscriptions s set status = 'past_due'
      where s.organization_id = v_org and s.status = 'active'
        and exists (select 1 from public.organization_entitlements e where e.organization_id = v_org and e.source = 'contract'
          and e.source_ref = s.id::text and e.status = 'suspended');
    v_result := jsonb_build_object('entitlements_suspended', v_n, 'wallet_frozen', true);

  else -- chargeback_cleared
    update public.credit_wallet_holds set cleared_at = now(), cleared_by = v_inbox where organization_id = v_org and cleared_at is null;
    if not found then raise exception 'payment_rejected:no_open_hold'; end if;
    update public.organization_entitlements e set status = 'active'
      where e.organization_id = v_org and e.source = 'contract' and e.status = 'suspended' and (e.ends_at is null or e.ends_at > now());
    get diagnostics v_n = row_count;
    update public.organization_product_subscriptions set status = 'active' where organization_id = v_org and status = 'past_due';
    v_result := jsonb_build_object('entitlements_restored', v_n, 'wallet_frozen', false);
  end if;

  -- Only events that make a row live can make two; checked on the features they touched, with findActiveEntitlement's
  -- own filter (a pre-existing duplicate elsewhere must not block a chargeback's wallet hold).
  if v_kind in ('subscription_paid','chargeback_cleared') and exists (select 1 from public.organization_entitlements e
      where e.organization_id = v_org and e.status = 'active' and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
        and coalesce(e.source_ref, '') not like 'all-features:%'
        and case when v_kind = 'subscription_paid' then e.product_key = v_plan.product_key and v_plan.features ? e.feature_key
                 else e.source = 'contract' end
      group by e.product_key, e.feature_key having count(*) > 1) then
    raise exception 'payment_invariant:more_than_one_live_grant';
  end if;

  v_result := jsonb_build_object('ok', true, 'event', v_inbox, 'kind', v_kind) || v_result;
  update public.payment_events set processed_at = now(), result = v_result where id = v_inbox;
  return v_result;
end $$;
revoke all on function public.billing_apply_payment_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.billing_apply_payment_event(text, text, jsonb) to service_role;
comment on function public.billing_apply_payment_event is 'ADR 017 step 4a: one PaymentEvent -> inbox row, contract, grant rows and ledger entry in one transaction; replay = no-op; rejects raise payment_rejected:<code>. service_role only.';

-- /ops/billing in one call: every root account with billing data. jsonb, so PostgREST's row cap cannot truncate it.
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
