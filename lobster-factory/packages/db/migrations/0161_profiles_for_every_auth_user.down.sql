-- Back to 0160. Drops both auth.users triggers and their functions (the profile helper too) and restores portal_complete_signup to 0110's body (a
-- plain insert; the live body before 0161). Backfilled / trigger-written profiles rows are NOT deleted: they are
-- indistinguishable from legitimate ones once a writer has used them, and deleting a profile cascades its
-- organization_memberships and breaks the 16 FKs that now point at it.
-- Emails tombstoned by the delete trigger are not restored (the old address was never stored).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0161_profiles_for_every_auth_user.sql';
  end if;
end $$;
drop trigger if exists ensure_profile_on_auth_user_insert on auth.users;
drop trigger if exists release_profile_on_auth_user_delete on auth.users;
drop function if exists public.release_profile_on_auth_user_delete();
drop function if exists public.ensure_profile_on_auth_user_insert();
drop function if exists public.ensure_profile_for_auth_user(uuid, text);

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
notify pgrst, 'reload schema';
commit;
