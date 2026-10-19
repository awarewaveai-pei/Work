-- ADR 017 step 2: the control plane owns contracts and grants. No prices or plan seeds.
-- Account#0 verified by slug: awarewave-ops = 39ad4149-5044-4077-8d9a-b6b916de0e21.
-- Existing contracts require an operator-reviewed plan mapping; never guess it.
begin;
set local lock_timeout = '3s';

create table public.plans (
  plan_key text primary key check (length(plan_key) > 0),
  product_key text not null check (product_key in ('cognitive','hci','social','studio','tarot','video','design','content','cs','collect','outreach')),
  kind text not null check (kind in ('base','addon')),
  features jsonb not null default '[]'::jsonb
    check (jsonb_typeof(features) = 'array' and not jsonb_path_exists(features, '$[*] ? (@.type() != "string" || @ == "")')),
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  woo_product_ids integer[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (plan_key, product_key)
);

create table public.organization_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_key text not null check (product_key in ('cognitive','hci','social','studio','tarot','video','design','content','cs','collect','outreach')),
  feature_key text not null check (length(feature_key) > 0),
  source text not null check (source in ('contract','comp')),
  source_ref text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active','suspended','expired')),
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index organization_entitlements_active_idx
  on public.organization_entitlements(organization_id, product_key, feature_key) where status = 'active';

alter table public.organizations add column kind text not null default 'customer'
  check (kind in ('internal','customer'));
update public.organizations set kind = 'internal'
  where id = '39ad4149-5044-4077-8d9a-b6b916de0e21' and slug = 'awarewave-ops';

lock table public.organization_product_subscriptions in access exclusive mode;
do $$ begin
  if exists (select 1 from public.organization_product_subscriptions) then
    raise exception 'existing subscriptions require an explicit verified plan mapping before 0110';
  end if;
end $$;
alter table public.organization_product_subscriptions
  add column plan_key text not null,
  add column source_ref text,
  add column trial_started_at timestamptz,
  add constraint org_product_subs_plan_fk foreign key (plan_key, product_key)
    references public.plans(plan_key, product_key) on delete restrict;
alter table public.organization_product_subscriptions
  drop constraint organization_product_subscriptions_product_key_check,
  add constraint organization_product_subscriptions_product_key_check
    check (product_key in ('cognitive','hci','social','studio','tarot','video','design','content','cs','collect','outreach'));
drop index public.org_product_subs_live_uniq;
create unique index org_product_subs_live_uniq on public.organization_product_subscriptions(organization_id, product_key, plan_key)
  where status <> 'canceled';
create unique index org_product_subs_trial_uniq on public.organization_product_subscriptions(organization_id, product_key)
  where status = 'trial';
create unique index org_product_subs_trial_history_uniq on public.organization_product_subscriptions(organization_id, product_key)
  where trial_started_at is not null;

create function public.org_product_subs_preserve_trial() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.trial_started_at is not null then raise exception 'trial history must be retained'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.trial_started_at is not null and
    (new.trial_started_at is distinct from old.trial_started_at or new.organization_id <> old.organization_id or new.product_key <> old.product_key) then
    raise exception 'trial identity and start are immutable';
  end if;
  if tg_op = 'UPDATE' and old.trial_started_at is not null and old.status <> 'trial' and new.status = 'trial' then
    raise exception 'trial may not be restarted';
  end if;
  if new.status = 'trial' and new.trial_started_at is null then
    new.trial_started_at := now();
  end if;
  return new;
end $$;
revoke all on function public.org_product_subs_preserve_trial() from public, anon, authenticated;
grant execute on function public.org_product_subs_preserve_trial() to service_role;
create trigger org_product_subs_preserve_trial before insert or update or delete
  on public.organization_product_subscriptions for each row execute function public.org_product_subs_preserve_trial();

-- Remove ALL inherited policies (including 0062's explicit authenticated write-denies).
drop policy if exists org_product_subs_select on public.organization_product_subscriptions;
do $$ declare t text; p record; begin
  foreach t in array array['plans','organization_entitlements','organization_product_subscriptions'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_role', t);
  end loop;
end $$;

create or replace function public.portal_complete_signup(
  p_org_id uuid, p_user_id uuid, p_org_name text, p_email text, p_product_key text, p_rate_limit_key text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_slug text := lower(regexp_replace(p_org_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(p_org_id::text, 1, 8);
  v_plan public.plans%rowtype;
  v_subscription_id uuid;
  v_end timestamptz := now() + interval '14 days';
begin
  select * into v_plan from public.plans
    where plan_key = p_product_key || '_trial' and product_key = p_product_key and kind = 'base';
  if not found or jsonb_array_length(v_plan.features) = 0 then
    raise exception 'trial plan is not configured for product %', p_product_key;
  end if;
  insert into public.organizations(id, type, name, slug, status, metadata)
    values (p_org_id, 'client', p_org_name, v_slug, 'active', jsonb_build_object('source','portal_signup','rl_key',p_rate_limit_key));
  insert into public.profiles(id, email, default_organization_id) values (p_user_id, p_email, p_org_id);
  insert into public.organization_memberships(organization_id, user_id, membership_type, status)
    values (p_org_id, p_user_id, 'owner', 'active');
  insert into public.organization_product_subscriptions(organization_id, product_key, plan_key, status, started_at, trial_started_at, current_period_end)
    values (p_org_id, p_product_key, v_plan.plan_key, 'trial', now(), now(), v_end) returning id into v_subscription_id;
  insert into public.organization_entitlements(organization_id, product_key, feature_key, source, source_ref, starts_at, ends_at, limits)
    select p_org_id, p_product_key, feature, 'contract', v_subscription_id::text, now(), v_end + interval '7 days', coalesce(v_plan.limits->feature, '{}'::jsonb)
    from (select distinct jsonb_array_elements_text(v_plan.features) as feature) f;
end $$;
revoke all on function public.portal_complete_signup(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.portal_complete_signup(uuid,uuid,text,text,text,text) to service_role;
comment on function public.portal_complete_signup is 'Atomic organization, profile, owner membership, 14-day trial contract and feature grants (+7-day grace). Caller creates Auth user first and compensates via deleteUser on failure. No plan configured means fail closed; service_role only.';

create function public.entitlement_credit_balance(p_organization_id uuid) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(sum(units), 0)::numeric from public.media_credit_ledger where organization_id = p_organization_id;
$$;
revoke all on function public.entitlement_credit_balance(uuid) from public, anon, authenticated;
grant execute on function public.entitlement_credit_balance(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
