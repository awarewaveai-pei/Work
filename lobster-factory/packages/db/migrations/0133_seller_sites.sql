-- 0133: ADR 017 decision #12 (operator 2026-10-25, D1-D5 option A; card agency-os/handoffs/2026-10-16-customer-model-
-- supervisor/cards/step-4-seller.md, 4c-1). A cash register can be any site: one seller_sites row per site, each with
-- its own key (ed25519: the site keeps the private key, this table holds only public keys; hmac-env: the key is in the
-- app's environment, only for aware-wave.com until its plugin moves to ed25519). The seller is an organizations row
-- (AwareWave = the internal account), never a fourth axis: a buyer account records who sold it
-- (sold_by_organization_id, null = AwareWave), a plan may have an owner (owner_organization_id, null = AwareWave's
-- catalog, any site), a WordPress member is unique per site, a payment event records its site.
-- Day one changes nothing: aware-wave.com is the only row, on hmac-env (PAYMENTS_WOO_SECRET / AUTH_WP_HANDOFF_SECRET),
-- and every existing identity and awarewave-wp account is backfilled to it.
-- Which products a seller may sell: a live <product>.resell row on the seller (comp or contract), the same rows every
-- right lives in; billing_apply_payment_event checks it for money from another seller's site, lib/entitlements/can.ts
-- sellerMaySell answers it in the app. A plan never grants one (plans_no_seller_licence).
-- Every id a site sends is unique only within that site: the payment inbox key is (provider, site, event id) and the
-- ledger and contract references built from order and subscription numbers carry the site (aware-wave.com: unchanged).
begin;
set local lock_timeout = '5s';

create table public.seller_sites (
  id uuid primary key default gen_random_uuid(),
  seller_organization_id uuid not null references public.organizations(id) on delete restrict,
  host text not null unique check (host = lower(host) and host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  platform text not null check (platform in ('woo')),
  key_id text not null unique check (key_id ~ '^[a-z0-9][a-z0-9-]{1,23}$'),
  verify_alg text not null check (verify_alg in ('ed25519','hmac-env')),
  public_key text check (public_key ~ '^-----BEGIN PUBLIC KEY-----'),
  env_var text check (env_var ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  handoff_public_key text check (handoff_public_key ~ '^-----BEGIN PUBLIC KEY-----'),
  handoff_env_var text check (handoff_env_var ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now(),
  -- one key per purpose, of the site's own kind: a public key never sits beside an env name, and the reverse
  check ((verify_alg = 'ed25519' and public_key is not null and env_var is null and handoff_env_var is null)
      or (verify_alg = 'hmac-env' and env_var is not null and public_key is null and handoff_public_key is null))
);
create index seller_sites_seller_idx on public.seller_sites(seller_organization_id);

-- A seller, a buyer's seller and a plan's owner are billing accounts: a root organization (ADR 017 §3).
create function public.seller_root_account_check() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_id uuid := (to_jsonb(new)->>tg_argv[0])::uuid;   -- through jsonb: one function for three tables
begin
  if v_id is not null and not exists (select 1 from public.organizations
      where id = v_id and parent_organization_id is null and kind in ('internal','customer')) then
    raise exception '%.% must name a root billing account', tg_table_name, tg_argv[0];
  end if;
  return new;
end $$;
revoke all on function public.seller_root_account_check() from public, anon, authenticated;
create trigger seller_sites_seller_is_root before insert or update of seller_organization_id on public.seller_sites
  for each row execute function public.seller_root_account_check('seller_organization_id');

-- key_id is in ledger and contract keys (woo@<key_id>:<order>) and seller_organization_id is whose buyers a site may
-- bill: once written neither changes, or an old order could no longer be refunded or could be booked twice (Codex
-- 2026-10-25 partialreview-05afd543 finding 3). A new key is a new public key on the same row; a new seller is a new row.
create function public.seller_sites_identity_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.key_id is distinct from old.key_id or new.seller_organization_id is distinct from old.seller_organization_id then
    raise exception 'seller_sites.key_id and seller_organization_id never change';
  end if;
  return new;
end $$;
revoke all on function public.seller_sites_identity_fixed() from public, anon, authenticated;
create trigger seller_sites_identity_fixed before update on public.seller_sites
  for each row execute function public.seller_sites_identity_fixed();

insert into public.seller_sites(seller_organization_id, host, platform, key_id, verify_alg, env_var, handoff_env_var, status)
  select id, 'aware-wave.com', 'woo', 'aware-wave-com', 'hmac-env', 'PAYMENTS_WOO_SECRET', 'AUTH_WP_HANDOFF_SECRET', 'active'
  from public.organizations where kind = 'internal' and parent_organization_id is null;
do $$ begin
  if (select count(*) from public.seller_sites) <> 1 then raise exception 'expected exactly one internal root organization'; end if;
end $$;
-- AwareWave is one account: a second internal root would make every "who is AwareWave" lookup ambiguous (critic M1).
create unique index organizations_one_internal_root on public.organizations ((true)) where kind = 'internal' and parent_organization_id is null;

-- A WordPress user id is unique only within its site (two shops both start at 1).
alter table public.customer_identities add column site_id uuid references public.seller_sites(id) on delete restrict;
update public.customer_identities set site_id = (select id from public.seller_sites where key_id = 'aware-wave-com');
alter table public.customer_identities
  alter column site_id set not null,
  drop constraint customer_identities_provider_external_id_key,
  drop constraint customer_identities_provider_user_id_key,
  add constraint customer_identities_site_external_id_key unique (site_id, external_id),
  add constraint customer_identities_site_user_id_key unique (site_id, user_id),
  drop constraint customer_identities_provider_check,
  add constraint customer_identities_provider_check check (provider in ('awarewave-wp','customer-wp'));
create index customer_identities_site_id_idx on public.customer_identities(site_id);
-- Until 4c-2 the app writes identities without a site (lib/entitlements/identities.ts linkIdentity), and aware-wave.com
-- is the only site: a new identity is its. 4c-2 passes the site and drops this default (Codex 2026-10-25
-- partialreview-05afd543 finding 1: without it a new member's first payment would fail after 0133).
do $$ begin
  execute format('alter table public.customer_identities alter column site_id set default %L::uuid',
    (select id from public.seller_sites where key_id = 'aware-wave-com'));
end $$;
-- awarewave-wp = aware-wave.com and nothing else, so a lookup by (provider, WordPress id) stays unique and a
-- customer-wp identity can never fall into the aware-wave.com default (critic M2).
do $$ begin
  execute format('alter table public.customer_identities add constraint customer_identities_provider_matches_site check ((provider = %L) = (site_id = %L::uuid))',
    'awarewave-wp', (select id from public.seller_sites where key_id = 'aware-wave-com'));
end $$;

alter table public.organizations add column sold_by_organization_id uuid references public.organizations(id) on delete restrict,
  add constraint organizations_sold_by_not_self check (sold_by_organization_id is null or sold_by_organization_id <> id);
create trigger organizations_sold_by_is_root before insert or update of sold_by_organization_id on public.organizations
  for each row execute function public.seller_root_account_check('sold_by_organization_id');
-- Who sold an account is the control plane's to write: organizations_update (0010) lets a member update their own row
-- through PostgREST, which would let a buyer pick a seller (null = AwareWave) and dodge the other site's refunds and
-- chargebacks (critic 2026-10-25 H1).
create function public.organizations_sold_by_control_plane_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon')
      and ((tg_op = 'INSERT' and new.sold_by_organization_id is not null)
        or (tg_op = 'UPDATE' and new.sold_by_organization_id is distinct from old.sold_by_organization_id)) then
    raise exception 'organizations.sold_by_organization_id is written only by the control plane';
  end if;
  return new;
end $$;
revoke all on function public.organizations_sold_by_control_plane_only() from public, anon, authenticated;
create trigger organizations_sold_by_control_plane_only before insert or update of sold_by_organization_id on public.organizations
  for each row execute function public.organizations_sold_by_control_plane_only();
update public.organizations set sold_by_organization_id = (select id from public.organizations where kind = 'internal' and parent_organization_id is null)
  where metadata->>'source' = 'awarewave-wp' and parent_organization_id is null and kind = 'customer';

alter table public.plans add column owner_organization_id uuid references public.organizations(id) on delete restrict,
  -- a buyer who pays for a plan never becomes a seller: licences are rows staff write (critic M4)
  add constraint plans_no_seller_licence check (not jsonb_path_exists(features, '$[*] ? (@ like_regex "[.]resell$")'));
create trigger plans_owner_is_root before insert or update of owner_organization_id on public.plans
  for each row execute function public.seller_root_account_check('owner_organization_id');

-- Every woo event before 0133 came from aware-wave.com: those rows get its site. The one write 0120's write-once
-- trigger is paused for: the fact is true and nothing else in the row changes.
alter table public.payment_events add column site_id uuid references public.seller_sites(id) on delete restrict;
alter table public.payment_events disable trigger payment_events_immutable;
update public.payment_events set site_id = (select id from public.seller_sites where key_id = 'aware-wave-com') where provider <> 'local';
alter table public.payment_events enable trigger payment_events_immutable;
alter table public.payment_events
  drop constraint payment_events_provider_event_id_key,
  add constraint payment_events_site_event_key unique nulls not distinct (provider, site_id, event_id),
  add constraint payment_events_site_matches_provider check ((provider = 'local') = (site_id is null));

alter table public.seller_sites enable row level security;
revoke all on table public.seller_sites from public, anon, authenticated;
revoke all on table public.seller_sites from service_role;
grant select, insert, update on table public.seller_sites to service_role;   -- disable a site; never delete one (payments name it)
create policy seller_sites_service_role on public.seller_sites for all to service_role using (true) with check (true);

-- 0128's text plus the parts marked 0133: the site, the buyer's seller, keys namespaced by site, the plan's owner.
-- A new argument is a new function, so the old one is dropped (PostgREST calls by name; p_site_id defaults to null).
drop function public.billing_apply_payment_event(text, text, jsonb);
create function public.billing_apply_payment_event(p_provider text, p_event_id text, p_event jsonb, p_site_id uuid default null) returns jsonb
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

  -- 0133: another seller's site takes money only for a product it holds the licence for (lib/entitlements/can.ts
  -- sellerMaySell, same rule): a live comp or contract row <product>.resell on the seller. Refunds and chargebacks are
  -- not money in and pass, so a revoked licence never strands a reversal. A pack from such a site names its plan (the
  -- product); a bare pack has no product to license (critic 2026-10-25 M3).
  if v_site.id is not null and v_site.seller_organization_id <> v_internal and v_kind in ('subscription_paid','credit_pack') then
    if v_kind = 'credit_pack' then
      if not (p_event ? 'plan_key') then raise exception 'payment_rejected:seller_pack_needs_plan'; end if;
      select * into v_plan from public.plans where plan_key = p_event->>'plan_key';
      if not found then raise exception 'payment_rejected:unknown_plan'; end if;
    end if;
    if not exists (select 1 from public.organization_entitlements e
        where e.organization_id = v_site.seller_organization_id and e.product_key = v_plan.product_key
          and e.feature_key = v_plan.product_key || '.resell' and e.status = 'active' and e.source in ('comp','contract')
          and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())) then
      raise exception 'payment_rejected:seller_not_licensed';
    end if;
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
    if p_event ? 'plan_key' then
      select * into v_plan from public.plans where plan_key = p_event->>'plan_key';
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
        v_result := v_result || jsonb_build_object('plan_key', v_plan.plan_key, 'pack_rows', 0, 'covered_by_all_features', true);
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
notify pgrst, 'reload schema';
commit;
