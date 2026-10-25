-- 0133 down: back to 0128. Refused once a second site, a seller other than AwareWave, a seller-owned plan or a
-- payment from another site exists: dropping the columns would lose who sold what (data is never deleted by a down).
begin;
set local lock_timeout = '5s';
do $$
declare v_internal uuid;
begin
  select id into strict v_internal from public.organizations where kind = 'internal' and parent_organization_id is null;
  if exists (select 1 from public.seller_sites where key_id <> 'aware-wave-com')
      or exists (select 1 from public.organizations where sold_by_organization_id is not null and sold_by_organization_id <> v_internal)
      or exists (select 1 from public.plans where owner_organization_id is not null)
      or exists (select 1 from public.customer_identities where provider <> 'awarewave-wp') then
    raise exception '0133 down refused: sellers other than aware-wave.com hold data';
  end if;
  -- 0128's function has no site status: a down must never re-open a cash register someone closed (a leaked key).
  if exists (select 1 from public.seller_sites where key_id = 'aware-wave-com' and status <> 'active') then
    raise exception '0133 down refused: the aware-wave.com site is not active; rotate its key first';
  end if;
end $$;

drop function public.billing_apply_payment_event(text, text, jsonb, uuid);
create or replace function public.billing_apply_payment_event(p_provider text, p_event_id text, p_event jsonb) returns jsonb
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
    -- 0128 (operator decision 6 = A, 2026-10-25): a pack that names its add-on plan also grants the right to use that
    -- plan's features, with NO end -- credits never expire, so the right to spend them must not either. One live
    -- contract per (account, product, plan), period end null (the daily sweep only ends contracts whose period end has
    -- passed); its rows have ends_at null and the plan's limits, which must mark every feature {"pay":"credits"}
    -- (can.ts: only such a row spends the wallet). A feature another live customer row already grants is skipped:
    -- one live row per (account, product, feature) among customer rows (header invariant); that row covers it.
    -- All-features accounts are covered already and get no pack rows. Same order id twice = same rows (idempotent).
    if p_event ? 'plan_key' then
      select * into v_plan from public.plans where plan_key = p_event->>'plan_key';
      if not found then raise exception 'payment_rejected:unknown_plan'; end if;
      if v_plan.kind <> 'addon' then raise exception 'payment_rejected:pack_plan_not_addon'; end if;
      if jsonb_array_length(v_plan.features) = 0 then raise exception 'payment_rejected:plan_has_no_features'; end if;
      if exists (select 1 from jsonb_array_elements_text(v_plan.features) f(feature)
          where jsonb_typeof(v_plan.limits->f.feature) is distinct from 'object' or (v_plan.limits->f.feature->>'pay') is distinct from 'credits') then
        raise exception 'payment_rejected:pack_plan_not_credits';
      end if;
      if exists (select 1 from public.organization_all_features where organization_id = v_org) then
        v_result := v_result || jsonb_build_object('plan_key', v_plan.plan_key, 'pack_rows', 0, 'covered_by_all_features', true);
      else
        select * into v_contract from public.organization_product_subscriptions
          where organization_id = v_org and product_key = v_plan.product_key and plan_key = v_plan.plan_key and status <> 'canceled' for update;
        if not found then
          insert into public.organization_product_subscriptions(organization_id, product_key, plan_key, status, started_at, current_period_end, source_ref)
            values (v_org, v_plan.product_key, v_plan.plan_key, 'active', now(), null, p_provider || ':pack:' || v_ref) returning * into v_contract;
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
        v_result := v_result || jsonb_build_object('plan_key', v_plan.plan_key, 'contract', v_contract.id, 'pack_rows', v_pack_rows);
      end if;
    end if;

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

alter table public.payment_events
  drop constraint payment_events_site_matches_provider,
  drop constraint payment_events_site_event_key,
  add constraint payment_events_provider_event_id_key unique (provider, event_id),
  drop column site_id;
drop trigger plans_owner_is_root on public.plans;
alter table public.plans drop constraint plans_no_seller_licence;
alter table public.plans drop column owner_organization_id;
drop trigger organizations_sold_by_is_root on public.organizations;
drop trigger organizations_sold_by_control_plane_only on public.organizations;
drop function public.organizations_sold_by_control_plane_only();
drop index public.organizations_one_internal_root;
alter table public.organizations drop constraint organizations_sold_by_not_self, drop column sold_by_organization_id;
alter table public.customer_identities
  drop constraint customer_identities_site_external_id_key,
  drop constraint customer_identities_site_user_id_key,
  add constraint customer_identities_provider_external_id_key unique (provider, external_id),
  add constraint customer_identities_provider_user_id_key unique (provider, user_id),
  drop constraint customer_identities_provider_check,
  add constraint customer_identities_provider_check check (provider in ('awarewave-wp'));
alter table public.customer_identities drop constraint customer_identities_provider_matches_site;
drop index public.customer_identities_site_id_idx;
alter table public.customer_identities drop column site_id;
drop table public.seller_sites;
drop function public.seller_root_account_check();
drop function public.seller_sites_identity_fixed();
notify pgrst, 'reload schema';
commit;
