-- 0148: ADR 017 4b-12. A priced call's credits are held before it runs (next-admin lib/entitlements/can.ts Grant.hold)
-- and settled once it is known what was delivered. The hold is a row written in the same transaction as its debit, so
-- a hold the app loses -- a timeout after the debit, a restart mid-call, a failed settle -- is still on record: the
-- daily sweep (media_credit_expire_holds, from /api/internal/entitlements/expire) gives every hold older than the
-- given age back whole. Settling is one call: keep part, give back the rest, close the row; a replay changes nothing.
-- A give-back is ledger entry_type 'refund' with reference_type 'hold_release' and positive units (a pack refund is
-- 'refund' with negative units, 0120/0146) and can never exceed the hold it closes; /ops/billing's 30-day figures net it
-- against its debit (billing_ledger, re-stated from 0141). Lock order everywhere: the account's advisory lock, then the
-- hold row. A closed hold changes no more (trigger). Access: service_role only.
begin;
set local lock_timeout = '5s';

create table public.credit_call_holds (
  idempotency_key text primary key check (length(idempotency_key) between 8 and 120),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  feature_key text not null check (length(feature_key) between 1 and 120),
  units integer not null check (units > 0),
  opened_at timestamptz not null default now(),
  settled_at timestamptz,
  kept integer check (kept is null or (kept >= 0 and kept <= units)),
  check ((settled_at is null) = (kept is null))
);
create index credit_call_holds_open_idx on public.credit_call_holds(opened_at) where settled_at is null;
create index credit_call_holds_org_idx on public.credit_call_holds(organization_id);

-- A hold is closed once (settled_at and kept set together) and never deleted: reopening one would give it back twice.
create function public.credit_call_holds_close_once() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' or old.settled_at is not null or new.settled_at is null
    or (new.idempotency_key, new.organization_id, new.feature_key, new.units, new.opened_at)
       is distinct from (old.idempotency_key, old.organization_id, old.feature_key, old.units, old.opened_at) then
    raise exception 'a credit hold changes only by being closed once';
  end if;
  return new;
end $$;
revoke all on function public.credit_call_holds_close_once() from public, anon, authenticated;
create trigger credit_call_holds_close_once before update or delete on public.credit_call_holds
  for each row execute function public.credit_call_holds_close_once();
alter table public.credit_call_holds enable row level security;
revoke all on table public.credit_call_holds from public, anon, authenticated;
revoke all on table public.credit_call_holds from service_role;
grant select, insert, update on table public.credit_call_holds to service_role;
create policy credit_call_holds_service_role on public.credit_call_holds for all to service_role using (true) with check (true);

-- The debit (0120 media_credit_reserve: advisory lock, wallet holds, hard limit, idempotent on the key) plus the hold row.
create function public.media_credit_hold(p_organization_id uuid, p_units integer, p_idempotency_key text, p_feature_key text)
returns table(allowed boolean, balance integer)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare r record;
begin
  if length(p_idempotency_key) > 120 then raise exception 'hold key too long'; end if;
  -- A key is one call: a reused key would find its debit already made and run a second call free.
  if exists (select 1 from public.credit_call_holds where idempotency_key = p_idempotency_key and settled_at is not null) then
    raise exception 'hold_key_reused';
  end if;
  select * into r from public.media_credit_reserve(p_organization_id, p_units, p_idempotency_key, 'entitlement', p_feature_key);
  if r.allowed and not exists (select 1 from public.media_credit_ledger where idempotency_key = p_idempotency_key
      and organization_id = p_organization_id and entry_type = 'debit' and units = -p_units) then
    raise exception 'hold key names another debit';
  end if;
  if r.allowed then
    insert into public.credit_call_holds(idempotency_key, organization_id, feature_key, units)
      values (p_idempotency_key, p_organization_id, p_feature_key, p_units)
      on conflict (idempotency_key) do nothing;
  end if;
  return query select r.allowed, r.balance;
end $$;

-- Keep p_kept of the hold, give the rest back, close it. Returns the units given back.
create function public.media_credit_settle_hold(p_idempotency_key text, p_kept integer) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare h public.credit_call_holds%rowtype; org uuid; back integer; wrote uuid;
begin
  select organization_id into org from public.credit_call_holds where idempotency_key = p_idempotency_key;
  if not found then raise exception 'hold_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text, 0));
  select * into h from public.credit_call_holds where idempotency_key = p_idempotency_key for update;
  -- A replay (or a hold the sweep closed first) answers what was given back; the caller charges what it still owes.
  if h.settled_at is not null then return h.units - h.kept; end if;
  if p_kept is null or p_kept < 0 or p_kept > h.units then raise exception 'hold_invalid_kept'; end if;
  back := h.units - p_kept;
  if back > 0 then
    insert into public.media_credit_ledger(organization_id, units, entry_type, idempotency_key, reference_type, reference_id)
      values (h.organization_id, back, 'refund', p_idempotency_key || ':release', 'hold_release', h.feature_key)
      on conflict (idempotency_key) do nothing returning id into wrote;
    if wrote is null and not exists (select 1 from public.media_credit_ledger where idempotency_key = p_idempotency_key || ':release'
        and organization_id = h.organization_id and units = back) then
      raise exception 'hold release key belongs to another entry';
    end if;
  end if;
  update public.credit_call_holds set settled_at = now(), kept = p_kept where idempotency_key = p_idempotency_key;
  return back;
end $$;

-- Every hold still open after p_older_than goes back whole (the call's outcome was lost). Returns how many. Each hold is
-- its own subtransaction: one that fails (a lock conflict with a late settle) is skipped and retried tomorrow.
create function public.media_credit_expire_holds(p_older_than interval) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare k text; n integer := 0;
begin
  if p_older_than < interval '30 minutes' then raise exception 'p_older_than must be at least 30 minutes'; end if;
  -- At most 500 a run (the account locks taken are held to commit), each in its own subtransaction. No row lock here:
  -- settle takes the account lock first, then the row, the same order as a late settle from the app.
  for k in select idempotency_key from public.credit_call_holds where settled_at is null and opened_at < now() - p_older_than
      order by opened_at limit 500 loop
    begin
      perform public.media_credit_settle_hold(k, 0);
      n := n + 1;
    exception when others then
      raise warning 'media_credit_expire_holds: % not released: %', k, sqlerrm;
    end;
  end loop;
  return n;
end $$;

revoke all on function public.media_credit_hold(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.media_credit_settle_hold(text, integer) from public, anon, authenticated;
revoke all on function public.media_credit_expire_holds(interval) from public, anon, authenticated;
grant execute on function public.media_credit_hold(uuid, integer, text, text) to service_role;
grant execute on function public.media_credit_settle_hold(text, integer) to service_role;
grant execute on function public.media_credit_expire_holds(interval) to service_role;

-- 0146's billing_apply_payment_event; only the pack refund's balance differs (open holds count as unspent).
create or replace function public.billing_apply_payment_event(p_provider text, p_event_id text, p_event jsonb, p_site_id uuid default null) returns jsonb
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
  v_pack_rows integer;
  v_site public.seller_sites%rowtype;
  v_internal uuid;
  v_ns text;
  v_pack_plans text[] := '{}';
  v_pk text;
  v_plans_out jsonb := '[]'::jsonb;
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
  -- 0133 (ADR 017 #12): the cash register is the site whose key the caller verified, never one the event names. local
  -- = the operator's own recording, no site. woo with none = the aware-wave.com row (the store plugin before 4c-2).
  -- A buyer account belongs to the seller that sold it (null = AwareWave, the internal account).
  if p_provider = 'local' and p_site_id is not null then raise exception 'payment_rejected:local_has_no_site'; end if;
  if p_provider <> 'local' then
    if p_site_id is null then
      select * into v_site from public.seller_sites where key_id = 'aware-wave-com';
    else
      select * into v_site from public.seller_sites where id = p_site_id;
    end if;
    if not found or v_site.status <> 'active' then raise exception 'payment_rejected:site_disabled'; end if;
    -- AwareWave = the seller of the aware-wave.com row (fixed by seller_sites_identity_fixed), not a kind lookup.
    select seller_organization_id into strict v_internal from public.seller_sites where key_id = 'aware-wave-com';
    if (select coalesce(sold_by_organization_id, v_internal) from public.organizations where id = v_org) <> v_site.seller_organization_id then
      raise exception 'payment_rejected:buyer_belongs_to_another_seller';
    end if;
  end if;
  -- Every id a site sends (event id, order number, subscription number) is unique only within that site, so a key built
  -- from one is namespaced by the site; aware-wave.com keeps the bare provider, so its existing keys do not change.
  v_ns := case when v_site.id is null or v_site.key_id = 'aware-wave-com' then p_provider else p_provider || '@' || v_site.key_id end;

  -- Same lock as media_credit_reserve (0066): payments and debits on one wallet run one at a time.
  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 0));
  insert into public.payment_events(provider, event_id, kind, organization_id, payload, site_id)
    values (p_provider, p_event_id, v_kind, v_org, p_event, v_site.id)
    on conflict (provider, site_id, event_id) do nothing returning id into v_inbox;
  if v_inbox is null then
    select * into v_prior from public.payment_events where provider = p_provider and site_id is not distinct from v_site.id and event_id = p_event_id;
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
    if v_site.id is not null and v_plan.owner_organization_id is not null and v_plan.owner_organization_id is distinct from v_site.seller_organization_id then
      -- a seller's own plan sells only on its own sites; the operator's own recording (local, no site) may still cancel
      -- or refund it (Codex 2026-10-25 partialreview-05afd543 finding 2)
      raise exception 'payment_rejected:plan_not_sellable_here';
    end if;
  end if;

  -- 0146: a credit pack names its add-on plans in plan_keys (1-20, distinct; the sign-up gift opens every live product
  -- at once); a single plan_key is still read, so events queued before 0146 apply unchanged. Never both.
  if v_kind = 'credit_pack' then
    if p_event ? 'plan_key' and p_event ? 'plan_keys' then raise exception 'payment_rejected:plan_key_and_plan_keys'; end if;
    if p_event ? 'plan_keys' then
      if jsonb_typeof(p_event->'plan_keys') is distinct from 'array' or jsonb_array_length(p_event->'plan_keys') not between 1 and 20
          or jsonb_path_exists(p_event->'plan_keys', '$[*] ? (@.type() != "string" || @ == "")') then
        raise exception 'payment_rejected:invalid_plan_keys';
      end if;
      select array_agg(distinct k order by k) into v_pack_plans from jsonb_array_elements_text(p_event->'plan_keys') k;
      if cardinality(v_pack_plans) <> jsonb_array_length(p_event->'plan_keys') then raise exception 'payment_rejected:invalid_plan_keys'; end if;
    elsif p_event ? 'plan_key' then
      v_pack_plans := array[p_event->>'plan_key'];
    end if;
  end if;

  -- 0133: another seller's site takes money only for a product it holds the licence for (lib/entitlements/can.ts
  -- sellerMaySell, same rule): a live comp or contract row <product>.resell on the seller. Refunds and chargebacks are
  -- not money in and pass, so a revoked licence never strands a reversal. A pack from such a site names its plan (the
  -- product); a bare pack has no product to license (critic 2026-10-25 M3).
  if v_site.id is not null and v_site.seller_organization_id <> v_internal and v_kind in ('subscription_paid','credit_pack') then
    if v_kind = 'credit_pack' and cardinality(v_pack_plans) = 0 then raise exception 'payment_rejected:seller_pack_needs_plan'; end if;
    -- every product the money opens needs the licence (a subscription has its one plan, loaded above)
    foreach v_pk in array case when v_kind = 'credit_pack' then v_pack_plans else array[v_plan.plan_key] end loop
      select * into v_plan from public.plans where plan_key = v_pk;
      if not found then raise exception 'payment_rejected:unknown_plan'; end if;
      if not exists (select 1 from public.organization_entitlements e
          where e.organization_id = v_site.seller_organization_id and e.product_key = v_plan.product_key
            and e.feature_key = v_plan.product_key || '.resell' and e.status = 'active' and e.source in ('comp','contract')
            and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())) then
        raise exception 'payment_rejected:seller_not_licensed';
      end if;
    end loop;
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
    v_ref := v_ns || ':' || coalesce(nullif(p_event->>'external_ref', ''), p_event_id);
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
    if length('pack-refund:' || v_ns || ':' || v_ref) > 128 then raise exception 'payment_rejected:invalid_order_ref'; end if;   -- ledger key limit (0066)
    if exists (select 1 from public.media_credit_ledger where idempotency_key = 'pack:' || v_ns || ':' || v_ref and organization_id <> v_org) then
      raise exception 'payment_rejected:order_belongs_to_another_account';
    end if;
    -- The order id is the idempotency key: a second event for one order grants nothing.
    insert into public.media_credit_ledger(organization_id, units, entry_type, idempotency_key, reference_type, reference_id, metadata)
      values (v_org, v_units, 'grant', 'pack:' || v_ns || ':' || v_ref, 'payment', v_ref, jsonb_build_object('event', v_inbox))
      on conflict (idempotency_key) do nothing returning id into v_ledger;
    if v_ledger is null and exists (select 1 from public.media_credit_ledger
        where idempotency_key = 'pack:' || v_ns || ':' || v_ref and organization_id <> v_org) then
      raise exception 'payment_rejected:order_belongs_to_another_account';   -- the advisory lock is per account
    end if;
    v_result := case when v_ledger is null then jsonb_build_object('units', 0, 'already_granted', true)
      else jsonb_build_object('ledger', v_ledger, 'units', v_units) end;
    -- 0128 (operator decision 6 = A, 2026-10-25): a pack that names its add-on plan also grants the right to use that
    -- plan's features, with NO end -- credits never expire, so the right to spend them must not either. One live
    -- contract per (account, product, plan), period end null (the daily sweep only ends contracts whose period end has
    -- passed); its rows have ends_at null and the plan's limits, which must mark every feature {"pay":"credits"}
    -- (can.ts: only such a row spends the wallet). A feature another live customer row already grants is skipped:
    -- one live row per (account, product, feature) among customer rows (header invariant); that row covers it.
    -- All-features accounts are covered already and get no pack rows. Same order id twice = same rows (idempotent).
    -- 0146: each named plan in turn (sorted, distinct); the result lists them under "plans".
    foreach v_pk in array v_pack_plans loop
      select * into v_plan from public.plans where plan_key = v_pk;
      if not found then raise exception 'payment_rejected:unknown_plan'; end if;
      if v_site.id is not null and v_plan.owner_organization_id is not null and v_plan.owner_organization_id is distinct from v_site.seller_organization_id then
        -- a seller's own plan sells only on its own sites; the operator's own recording (local, no site) may still cancel
        -- or refund it (Codex 2026-10-25 partialreview-05afd543 finding 2)
        raise exception 'payment_rejected:plan_not_sellable_here';
      end if;
      if v_plan.kind <> 'addon' then raise exception 'payment_rejected:pack_plan_not_addon'; end if;
      if jsonb_array_length(v_plan.features) = 0 then raise exception 'payment_rejected:plan_has_no_features'; end if;
      if exists (select 1 from jsonb_array_elements_text(v_plan.features) f(feature)
          where jsonb_typeof(v_plan.limits->f.feature) is distinct from 'object' or (v_plan.limits->f.feature->>'pay') is distinct from 'credits') then
        raise exception 'payment_rejected:pack_plan_not_credits';
      end if;
      if exists (select 1 from public.organization_all_features where organization_id = v_org) then
        v_plans_out := v_plans_out || jsonb_build_array(jsonb_build_object('plan_key', v_plan.plan_key, 'pack_rows', 0, 'covered_by_all_features', true));
      else
        select * into v_contract from public.organization_product_subscriptions
          where organization_id = v_org and product_key = v_plan.product_key and plan_key = v_plan.plan_key and status <> 'canceled' for update;
        if not found then
          insert into public.organization_product_subscriptions(organization_id, product_key, plan_key, status, started_at, current_period_end, source_ref)
            values (v_org, v_plan.product_key, v_plan.plan_key, 'active', now(), null, v_ns || ':pack:' || v_ref) returning * into v_contract;
        elsif v_contract.current_period_end is not null then
          -- the plan was bought another way before (a dated subscription): a pack makes its right open-ended
          update public.organization_product_subscriptions set current_period_end = null, status = 'active' where id = v_contract.id returning * into v_contract;
          update public.organization_entitlements e set ends_at = null
            where e.organization_id = v_org and e.source = 'contract' and e.source_ref = v_contract.id::text and e.status = 'active' and (e.ends_at is null or e.ends_at > now());
        end if;
        insert into public.organization_entitlements(organization_id, product_key, feature_key, source, source_ref, starts_at, ends_at, limits)
          select v_org, v_plan.product_key, f.feature, 'contract', v_contract.id::text, now(), null, v_plan.limits->f.feature
          from (select distinct jsonb_array_elements_text(v_plan.features) as feature) f
          where not exists (select 1 from public.organization_entitlements e where e.organization_id = v_org and e.product_key = v_plan.product_key
            and e.feature_key = f.feature and e.status in ('active','suspended') and (e.ends_at is null or e.ends_at > now()));
        get diagnostics v_pack_rows = row_count;
        v_plans_out := v_plans_out || jsonb_build_array(jsonb_build_object('plan_key', v_plan.plan_key, 'contract', v_contract.id, 'pack_rows', v_pack_rows));
      end if;
    end loop;
    if cardinality(v_pack_plans) > 0 then v_result := v_result || jsonb_build_object('plans', v_plans_out); end if;

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
    if length('pack-refund:' || v_ns || ':' || v_ref) > 128 then raise exception 'payment_rejected:invalid_order_ref'; end if;   -- ledger key limit (0066)
    select units, id, created_at into v_units, v_grant_id, v_grant_at from public.media_credit_ledger
      where organization_id = v_org and idempotency_key = 'pack:' || v_ns || ':' || coalesce(v_ref, '') and entry_type = 'grant';
    if not found then raise exception 'payment_rejected:unknown_order'; end if;
    if exists (select 1 from public.payment_events where organization_id = v_org and provider = p_provider and site_id is not distinct from v_site.id and kind = 'refund'
        and payload->>'target' = 'credit_pack' and payload->>'order_ref' = v_ref and processed_at is not null and id <> v_inbox) then
      v_result := jsonb_build_object('refunded_units', 0, 'already_refunded', true);
    else
      -- One shared wallet, spent first in, first out: what is left belongs to the newest grants, so this pack's unused
      -- part = the balance beyond every later grant (net of that grant's own refund), up to the pack's size. Refunding
      -- an old, spent pack therefore returns nothing and never takes a newer pack's credits.
      select coalesce(sum(units), 0) into v_balance from public.media_credit_ledger where organization_id = v_org;
      -- 0148: a hold still open is not spent yet (its call may give it back): count it as balance, or a refund made
      -- while it is open takes back nothing and the later give-back leaves the customer both the money and the credits.
      v_balance := v_balance + (select coalesce(sum(units), 0) from public.credit_call_holds where organization_id = v_org and settled_at is null);
      select coalesce(sum(g.units + coalesce((select sum(r.units) from public.media_credit_ledger r
          where r.organization_id = v_org and r.entry_type = 'refund' and r.idempotency_key = 'pack-refund:' || substr(g.idempotency_key, 6)), 0)), 0)
        into v_newer from public.media_credit_ledger g
        where g.organization_id = v_org and g.entry_type = 'grant' and (g.created_at, g.id) > (v_grant_at, v_grant_id);
      v_n := least(v_units::bigint, greatest(v_balance - v_newer, 0))::integer;
      if v_n > 0 then
        insert into public.media_credit_ledger(organization_id, units, entry_type, idempotency_key, reference_type, reference_id, metadata)
          values (v_org, -v_n, 'refund', 'pack-refund:' || v_ns || ':' || v_ref, 'payment', v_ref,
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
revoke all on function public.billing_apply_payment_event(text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.billing_apply_payment_event(text, text, jsonb, uuid) to service_role;

-- 0141's billing_ledger with the 30-day figures netting a hold's give-back against its debit (only those two lines differ).
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
      coalesce(sum(l.units) filter (where l.units > 0 and l.reference_type is distinct from 'hold_release' and l.created_at > now() - interval '30 days'), 0) as granted_30d,
      coalesce(-sum(l.units) filter (where (l.units < 0 or l.reference_type = 'hold_release') and l.created_at > now() - interval '30 days'), 0) as spent_30d
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

notify pgrst, 'reload schema';
commit;
