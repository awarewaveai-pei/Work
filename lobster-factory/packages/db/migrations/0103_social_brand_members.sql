-- 0103 — brand members managed from the social manager (ADR 018 §3; table 0096 social_brand_members; lib/social/members.ts).
-- Invariants:
--   1. A member is an existing auth user, found by email (case-insensitive, live, not anonymous, email confirmed). Nobody
--      is created here; an email matching two accounts is refused rather than guessed. The email is trusted as the
--      person's: portal signup confirms without checking ownership (app/portal/api/signup/route.ts KNOWN V1 GAP), so it
--      must verify email before it opens (TASKS), or adding by email hands a brand to whoever registered that address.
--   2. A brand that has an owner row keeps at least one: role changes and removals lock the brand's rows first, so two
--      concurrent changes cannot both remove "the other" owner. (Staff owner/admin are owners without a row, authz.ts.)
--   3. Every change writes its audit row in the same transaction (detail = user id and roles, never the email).
--   4. service_role only; the API decides who may call (owner of the brand, lib/social/authz.ts roleOn).
--
-- APPLY WITH (Medium, additive): node scripts/apply-db-migration.mjs 0103 -- before the next-admin deploy that calls it
-- (the nightly auto-deploy refuses while it is unapplied: sg-deploy step 1.86).
-- DOWN: packages/db/scripts/0103_social_brand_members_down.sql

begin;
set local lock_timeout = '5s';

-- members with their email, for the brand's owners (security definer: auth.users is not readable by service_role;
-- empty search_path: definer = superuser, so no unqualified name may resolve through a writable schema)
create or replace function public.social_list_members(p_org uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.social_brand_members m
  left join auth.users u on u.id = m.user_id
  where m.organization_id = p_org
  order by m.created_at, m.user_id
$$;

create or replace function public.social_add_member(p_org uuid, p_email text, p_role text, p_actor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_n int;
begin
  if p_role not in ('owner', 'editor', 'reviewer', 'client') then
    raise exception 'role must be owner, editor, reviewer or client' using errcode = '22023';
  end if;
  select count(*), min(u.id::text)::uuid into v_n, v_user
  from auth.users u
  where lower(u.email) = lower(btrim(p_email)) and u.deleted_at is null and coalesce(u.is_anonymous, false) = false
    and u.email_confirmed_at is not null;
  if v_n = 0 then
    raise exception 'no account with this email' using errcode = 'SC404';
  elsif v_n > 1 then
    raise exception 'this email matches more than one account' using errcode = '22023';
  end if;
  -- one statement, so two concurrent adds of the same person end as one row and one SC409 (never a raw 23505)
  insert into public.social_brand_members (organization_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (organization_id, user_id) do nothing;
  if not found then
    raise exception 'already a member of this brand' using errcode = 'SC409';
  end if;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'member_add', jsonb_build_object('user_id', v_user, 'role', p_role));
  return v_user;
end $$;

-- the brand's member rows, locked; refuses when p_user is the last owner and would stop being one
create or replace function public.social_lock_members_for_change(p_org uuid, p_user uuid, p_new_role text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_owners int;
begin
  perform 1 from public.social_brand_members where organization_id = p_org order by user_id for update;
  select role into v_role from public.social_brand_members where organization_id = p_org and user_id = p_user;
  if v_role is null then
    raise exception 'not a member of this brand' using errcode = 'SC404';
  end if;
  select count(*) into v_owners from public.social_brand_members where organization_id = p_org and role = 'owner';
  if v_role = 'owner' and p_new_role is distinct from 'owner' and v_owners = 1 then
    raise exception 'the last owner stays: make someone else owner first' using errcode = 'SC409';
  end if;
  return v_role;
end $$;

create or replace function public.social_set_member_role(p_org uuid, p_user uuid, p_role text, p_actor text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_from text;
begin
  if p_role not in ('owner', 'editor', 'reviewer', 'client') then
    raise exception 'role must be owner, editor, reviewer or client' using errcode = '22023';
  end if;
  v_from := public.social_lock_members_for_change(p_org, p_user, p_role);
  if v_from = p_role then
    return p_role;
  end if;
  update public.social_brand_members set role = p_role where organization_id = p_org and user_id = p_user;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'member_role', jsonb_build_object('user_id', p_user, 'from', v_from, 'to', p_role));
  return p_role;
end $$;

create or replace function public.social_remove_member(p_org uuid, p_user uuid, p_actor text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_from text;
begin
  v_from := public.social_lock_members_for_change(p_org, p_user, null);
  delete from public.social_brand_members where organization_id = p_org and user_id = p_user;
  insert into public.social_audit_log (organization_id, actor, action, detail)
  values (p_org, p_actor, 'member_remove', jsonb_build_object('user_id', p_user, 'role', v_from));
end $$;

revoke all on function public.social_list_members(uuid) from public, anon, authenticated;
revoke all on function public.social_add_member(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.social_lock_members_for_change(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.social_set_member_role(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.social_remove_member(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.social_list_members(uuid) to service_role;
grant execute on function public.social_add_member(uuid, text, text, text) to service_role;
grant execute on function public.social_lock_members_for_change(uuid, uuid, text) to service_role;
grant execute on function public.social_set_member_role(uuid, uuid, text, text) to service_role;
grant execute on function public.social_remove_member(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';

commit;
