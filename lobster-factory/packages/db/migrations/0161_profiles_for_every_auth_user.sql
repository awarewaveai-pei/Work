-- 0161: every auth user has a public.profiles row (operator 2026-11-05). 16 foreign keys reference profiles(id) (created_by,
-- user_id, ...), so a write naming an auth user without a row fails with an FK violation; prod had 2 staff accounts in
-- that state (created outside portal_complete_signup / client-invite, which were the only profile writers). Closed at the
-- source: AFTER INSERT trigger on auth.users, one function (ensure_profile_for_auth_user) shared by the trigger and the
-- backfill below.
--
-- The row is bare: status 'active', default_organization_id NULL, metadata '{}'. It grants nothing:
-- default_organization_id is what routes a WordPress member (lib/entitlements/wp-customers.ts), memberships stay with
-- the invite / signup writers (0135 header: profiles are written only by the control plane).
--
-- NEVER BLOCKS A SIGNUP: ensure_profile_for_auth_user catches every error (unique email collision with a profiles row
-- of another id, e.g. a leftover legacy row; a NULL / empty auth email, as phone or anonymous users have, which the NOT
-- NULL email column cannot hold; anything else), raises a WARNING and returns false. The user is left WITHOUT a profile
-- rather than failing GoTrue's insert (an auth outage is worse than a missing row), and the self-check below plus this
-- query keep it visible (it must return 0 rows, or only rows explained by an email collision / no email):
--   select a.id from auth.users a where not exists (select 1 from public.profiles p where p.id = a.id);
-- No migration output prints an email (WARNINGs carry ids only). The standing detector is
-- scripts/check-auth-profiles.sh (cron auth_profiles_check, count-only).
-- Email is stored lower(btrim()) (repo convention: client-invite normalizeEmail; GoTrue lowercases anyway).
--
-- RELEASE ON DELETE: profiles.id has no FK to auth.users, so a deleted auth user leaves its profiles row, which would
-- hold the email (profiles.email is unique) and make that address unusable for a later account (client-invite
-- readyAccount answers email_taken, the new user's trigger insert collides). AFTER DELETE trigger
-- release_profile_on_auth_user_delete tombstones the row of a user that has no organization (default_organization_id
-- NULL): email = 'deleted+<id>@invalid', display_name/avatar_url NULL, metadata '{}', status 'disabled'. No personal field
-- is kept (deletion = PII erasure).
-- A row with an organization is left alone: client-invite deletes those itself, and an organization row is data.
-- GoTrue soft delete (deleteUser(id, true)) does not fire DELETE; nothing in the code uses it today.
--
-- portal_complete_signup (live body = 0110's, which superseded 0063) now upserts its profiles row: with the trigger
-- the row already exists when it runs. It sets only email, default_organization_id (and updated_at).
--
-- OWNER / LOCKS: applied as supabase_admin (scripts/apply-db-migration.mjs: docker exec supabase-db psql -U
-- supabase_admin, a superuser), which can create a trigger on auth.users; a plain `postgres` DSN could not. CREATE
-- TRIGGER takes SHARE ROW EXCLUSIVE on auth.users (blocks sign-in writes, not reads) until commit; lock_timeout 5s
-- makes a busy table fail the migration instead of queueing behind it. The trigger is created before the backfill, so
-- no auth user can slip between the two.
begin;
set local lock_timeout = '5s';

create or replace function public.ensure_profile_for_auth_user(p_id uuid, p_email text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_id is null or nullif(btrim(coalesce(p_email, '')), '') is null then
    raise warning '0161: auth user % has no email, no profiles row written', p_id;
    return false;
  end if;
  insert into public.profiles (id, email, status, default_organization_id, metadata)
    values (p_id, lower(btrim(p_email)), 'active', null, '{}'::jsonb)
    on conflict (id) do nothing;
  return true;
exception when others then
  raise warning '0161: no profiles row for auth user % (% %)', p_id, sqlstate, sqlerrm;
  return false;
end $$;
revoke all on function public.ensure_profile_for_auth_user(uuid, text) from public, anon, authenticated;
comment on function public.ensure_profile_for_auth_user(uuid, text) is 'Inserts the bare profiles row (no organization) for an auth user, idempotent on id; never raises, returns false (with a WARNING) when no row could be written. 0161.';

create or replace function public.ensure_profile_on_auth_user_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.ensure_profile_for_auth_user(new.id, new.email);
  return new;
end $$;
revoke all on function public.ensure_profile_on_auth_user_insert() from public, anon, authenticated;
comment on function public.ensure_profile_on_auth_user_insert() is 'AFTER INSERT trigger function for auth.users: every auth user gets a bare profiles row. 0161.';

create or replace trigger ensure_profile_on_auth_user_insert after insert on auth.users
  for each row execute function public.ensure_profile_on_auth_user_insert();

create or replace function public.release_profile_on_auth_user_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles set email = 'deleted+' || old.id || '@invalid', display_name = null, avatar_url = null,
         metadata = '{}'::jsonb, status = 'disabled', updated_at = now()
    where id = old.id and default_organization_id is null;
  return old;
exception when others then
  raise warning '0161: could not release the profiles row of deleted auth user %', old.id;
  return old;
end $$;
revoke all on function public.release_profile_on_auth_user_delete() from public, anon, authenticated;
comment on function public.release_profile_on_auth_user_delete() is 'AFTER DELETE trigger function for auth.users: tombstones the organization-less profiles row so its email can be used again; the old email is not kept. 0161.';

create or replace trigger release_profile_on_auth_user_delete after delete on auth.users
  for each row execute function public.release_profile_on_auth_user_delete();

do $$
declare
  u record;
  n integer := 0;
begin
  for u in select a.id, a.email from auth.users a
           where not exists (select 1 from public.profiles p where p.id = a.id) order by a.created_at
  loop
    if public.ensure_profile_for_auth_user(u.id, u.email) then n := n + 1; end if;
  end loop;
  raise notice '0161: backfilled % profiles rows', n;
  for u in select a.id,
             (select p.id from public.profiles p where p.email = lower(btrim(a.email))) as held_by
           from auth.users a where not exists (select 1 from public.profiles p where p.id = a.id)
  loop
    raise warning '0161 UNRESOLVED: auth user % has no profiles row; its email is %', u.id,
      case when u.held_by is null then 'missing' else 'held by profiles id ' || u.held_by end;
  end loop;
  if exists (
    select 1 from auth.users a
    where not exists (select 1 from public.profiles p where p.id = a.id)
      and nullif(btrim(coalesce(a.email, '')), '') is not null
      and not exists (select 1 from public.profiles p where p.email = lower(btrim(a.email)))
  ) then
    raise exception '0161: an auth user is still without a profiles row for a reason other than email collision / no email';
  end if;
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
  -- 0161: the auth.users trigger has already written this user's bare profiles row; set only the columns this signup owns.
  insert into public.profiles(id, email, default_organization_id) values (p_user_id, lower(btrim(p_email)), p_org_id)
    on conflict (id) do update set email = excluded.email, default_organization_id = excluded.default_organization_id, updated_at = now();
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

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'ensure_profile_on_auth_user_insert' and not tgisinternal) then
    raise exception '0161: auth.users insert trigger missing';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'release_profile_on_auth_user_delete' and not tgisinternal) then
    raise exception '0161: auth.users delete trigger missing';
  end if;
  if has_function_privilege('anon', 'public.ensure_profile_for_auth_user(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ensure_profile_for_auth_user(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.ensure_profile_on_auth_user_insert()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ensure_profile_on_auth_user_insert()', 'EXECUTE')
     or has_function_privilege('anon', 'public.release_profile_on_auth_user_delete()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.release_profile_on_auth_user_delete()', 'EXECUTE') then
    raise exception '0161: anon/authenticated can execute a profile function';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
