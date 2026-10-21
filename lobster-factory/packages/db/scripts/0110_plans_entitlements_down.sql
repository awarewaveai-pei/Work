-- ADR 017 rollback is only safe before any plan, contract or grant is written.
begin;
set local lock_timeout = '3s';
lock table public.plans, public.organization_entitlements, public.organization_product_subscriptions in access exclusive mode;
do $$ begin
  if exists (select 1 from public.plans) or exists (select 1 from public.organization_entitlements)
    or exists (select 1 from public.organization_product_subscriptions) then
    raise exception 'tables not empty: forward-fix only';
  end if;
end $$;
drop function public.entitlement_credit_balance(uuid);
drop trigger org_product_subs_preserve_trial on public.organization_product_subscriptions;
drop function public.org_product_subs_preserve_trial();
drop index public.org_product_subs_trial_history_uniq;
drop index public.org_product_subs_trial_uniq;
drop index public.org_product_subs_live_uniq;
alter table public.organization_product_subscriptions drop constraint org_product_subs_plan_fk;
alter table public.organization_product_subscriptions
  drop column plan_key, drop column source_ref, drop column trial_started_at;
alter table public.organization_product_subscriptions
  drop constraint organization_product_subscriptions_product_key_check,
  add constraint organization_product_subscriptions_product_key_check
    check (product_key in ('cognitive','hci'));
create unique index org_product_subs_live_uniq on public.organization_product_subscriptions(organization_id, product_key)
  where status <> 'canceled';
alter table public.organizations drop column kind;
drop table public.organization_entitlements;
drop table public.plans;
drop policy organization_product_subscriptions_service_role on public.organization_product_subscriptions;
-- Restore 0062's pre-0110 access contract (default Supabase table grants).
grant all on table public.organization_product_subscriptions to anon, authenticated, service_role;
drop policy if exists org_product_subs_select on public.organization_product_subscriptions;
create policy org_product_subs_select on public.organization_product_subscriptions
for select
to authenticated
using (user_has_org_membership(organization_id));

-- WRITE: none for authenticated. Explicit denies (0033:4-11) so an audit reads as intent,
-- not as "someone forgot the policy". Entitlement changes go through a service_role route.
drop policy if exists org_product_subs_deny_insert_authenticated on public.organization_product_subscriptions;
create policy org_product_subs_deny_insert_authenticated on public.organization_product_subscriptions
for insert to authenticated with check (false);

drop policy if exists org_product_subs_deny_update_authenticated on public.organization_product_subscriptions;
create policy org_product_subs_deny_update_authenticated on public.organization_product_subscriptions
for update to authenticated using (false) with check (false);

drop policy if exists org_product_subs_deny_delete_authenticated on public.organization_product_subscriptions;
create policy org_product_subs_deny_delete_authenticated on public.organization_product_subscriptions
for delete to authenticated using (false);

-- anon: fail-closed and explicit. Supabase's default privileges grant anon SELECT on new public
-- tables, so this table IS reachable with the anon key once PostgREST reloads -- RLS is the only
-- thing stopping it. Mirrors 0033:18-23 and 0052:33-35.
drop policy if exists org_product_subs_deny_anon on public.organization_product_subscriptions;
create policy org_product_subs_deny_anon on public.organization_product_subscriptions
for all to anon using (false) with check (false);


-- Restore 0063, including the service-role-only EXECUTE grants.
create or replace function public.portal_complete_signup(
  p_org_id            uuid,
  p_user_id           uuid,
  p_org_name          text,
  p_email             text,
  p_product_key       text,
  p_rate_limit_key    text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := lower(regexp_replace(p_org_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(p_org_id::text, 1, 8);
begin
  -- p_rate_limit_key is opaque to this function (a salted per-caller hash, see
  -- app/portal/api/signup/route.ts rateLimitKey()) -- stored so the rate-limit count query can
  -- scope by it atomically at insert time, instead of a separate post-hoc UPDATE whose failure
  -- would silently leave a signup untagged (undercounting, a real correctness gap fixed by
  -- folding this into the single atomic write instead).
  insert into public.organizations (id, type, name, slug, status, metadata)
  values (p_org_id, 'client', p_org_name, v_slug, 'active',
    jsonb_build_object('source', 'portal_signup', 'rl_key', p_rate_limit_key));

  insert into public.profiles (id, email, default_organization_id)
  values (p_user_id, p_email, p_org_id);

  insert into public.organization_memberships (organization_id, user_id, membership_type, status)
  values (p_org_id, p_user_id, 'owner', 'active');

  insert into public.organization_product_subscriptions (organization_id, product_key, status, started_at)
  values (p_org_id, p_product_key, 'trial', now());
end;
$$;


revoke all on function public.portal_complete_signup(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.portal_complete_signup(uuid,uuid,text,text,text,text) to service_role;
comment on function public.portal_complete_signup is 'Atomic 4-table write for portal customer signup. Caller creates Auth user first and compensates via deleteUser on failure. service_role only (0063).';
notify pgrst, 'reload schema';
commit;
