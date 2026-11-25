-- 0182: transfer an account's membership to another person (ADR 021 D5, G5; DISPATCH M8). The unit's manager is the app
-- account holding its customer_identities row (0124, insert-only for the app). Staff on the client hub issue a transfer
-- = a 0180 member invite that names the identity it replaces; nothing changes until the new person proves the invited
-- email on aware-wave.com and its signed event brings the code back (member_invite_redeem). Then, in one transaction
-- under the account's 0180 lock: the old identity row moves to former_customer_identities (its money stays the
-- account's), an ops_audit_events row records who started it, why, and both identities, and the new row is written.
-- Before that the old manager stays the manager.
-- Invariant made a database rule here: one account, at most one member link (every write path already keeps it --
-- wp-customers.ts: a site-made account is per member slug, adoptableClient and 0180 refuse an account already held --
-- but the payment path checked and inserted without 0180's lock; the unique index closes every path, a race is a
-- unique_violation the app already reports as identity_conflict). The service_role grants on customer_identities stay
-- select, insert: only the security-definer redeem below deletes.
-- APPLY:  node scripts/apply-db-migration.mjs 0182   (before the next-admin that reads transfer_of; revert = .down.sql)
begin;
set local lock_timeout = '5s';

lock table public.customer_identities in share mode;
do $$
declare v text;
begin
  select string_agg(organization_id::text || ' x' || n, ', ') into v
    from (select organization_id, count(*) n from public.customer_identities group by 1 having count(*) > 1) d;
  if v is not null then
    raise exception '0182: accounts with more than one member link (decide which stays, then re-run): %', v;
  end if;
end $$;
create unique index customer_identities_one_per_organization on public.customer_identities(organization_id);

-- A transfer invite: transfer_of = the identity it replaces (no foreign key: the redeem deletes that row and the
-- used invite keeps naming it), with the reason and the owner/admin role of whoever started it.
alter table public.member_invites
  add column transfer_of uuid,
  add column transfer_reason text check (transfer_reason is null or length(btrim(transfer_reason)) between 1 and 500),
  add column transfer_actor_role text check (transfer_actor_role is null or transfer_actor_role in ('owner','admin')),
  add constraint member_invites_transfer_whole check (
    (transfer_of is null) = (transfer_reason is null) and (transfer_of is null) = (transfer_actor_role is null));

-- Who held an account's member link before a transfer. Money a member moved while managing the account (a payment still
-- in the plugin's queue, a later refund or cancel of it) stays the account's: the payment path (wp-customers.ts
-- ensureWpCustomer, its findFormerAccount) reads this when the member has no current identity. Sign-in and visibility
-- never read it (the replaced manager is out). Written only by member_invite_redeem below; a member replaced twice has
-- two rows, the latest wins. Rows are never deleted: the money history needs them.
create table public.former_customer_identities (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null,   -- the deleted customer_identities row (no foreign key: it is gone)
  provider text not null,
  site_id uuid not null references public.seller_sites(id) on delete restrict,
  external_id text not null check (length(external_id) between 1 and 100),
  user_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  linked_at timestamptz not null,
  replaced_at timestamptz not null default now(),
  invite_id uuid not null references public.member_invites(id) on delete restrict
);
create index former_customer_identities_member_idx on public.former_customer_identities(site_id, external_id, replaced_at desc);
alter table public.former_customer_identities enable row level security;
revoke all on table public.former_customer_identities from public, anon, authenticated;
revoke all on table public.former_customer_identities from service_role;
grant select on table public.former_customer_identities to service_role;
create policy former_customer_identities_service_role on public.former_customer_identities
  for select to service_role using (true);

create or replace function public.member_invites_account_check() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (new.organization_id, new.email, new.code_hash, new.expires_at, new.created_at, new.created_by,
                           new.transfer_of, new.transfer_reason, new.transfer_actor_role)
       is distinct from (old.organization_id, old.email, old.code_hash, old.expires_at, old.created_at, old.created_by,
                         old.transfer_of, old.transfer_reason, old.transfer_actor_role) then
    raise exception 'member_invite:immutable';
  end if;
  if tg_op = 'UPDATE' and (old.used_at is not null or old.voided_at is not null)
       and (new.used_at, new.used_site_id, new.used_external_id, new.voided_at)
           is distinct from (old.used_at, old.used_site_id, old.used_external_id, old.voided_at) then
    raise exception 'member_invite:closed';
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.organizations where id = new.organization_id
                 and parent_organization_id is null and kind in ('customer','test')) then
    raise exception 'member_invite:not_a_customer_account';
  end if;
  return new;
end $$;

-- Issue a transfer: the account must have a member now, and the invited email must not be that member's own. Voids the
-- live invite and inserts the new one together, as member_invite_issue does.
create function public.member_transfer_issue(p_organization_id uuid, p_email text, p_code_hash text,
  p_expires_at timestamptz, p_created_by text, p_reason text, p_actor_role text) returns public.member_invites
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.member_invites;
  v_held public.customer_identities;
begin
  perform pg_advisory_xact_lock(hashtextextended('member_invites:' || p_organization_id::text, 0));
  select * into v_held from public.customer_identities where organization_id = p_organization_id;
  if not found then raise exception 'member_transfer:not_linked'; end if;
  if exists (select 1 from public.profiles where id = v_held.user_id and lower(btrim(email)) = p_email) then
    raise exception 'member_transfer:same_member';
  end if;
  update public.member_invites set voided_at = now()
    where organization_id = p_organization_id and used_at is null and voided_at is null;
  insert into public.member_invites(organization_id, email, code_hash, expires_at, created_by,
                                    transfer_of, transfer_reason, transfer_actor_role)
    values (p_organization_id, p_email, p_code_hash, p_expires_at, p_created_by, v_held.id, btrim(p_reason), p_actor_role)
    returning * into v;
  return v;
end $$;

-- 0180's redeem, plus the transfer branch. An ordinary invite is unchanged: an account that has a member refuses it.
-- New answers: transfer_same_member (the member being replaced used the code), transfer_stale (the account's member is
-- no longer the one the transfer names: issue a new transfer). The delete, the audit row and the insert share one
-- subtransaction, so an identity_conflict leaves the old member in place.
create or replace function public.member_invite_redeem(p_invite_id uuid, p_provider text, p_site_id uuid, p_external_id text,
  p_user_id uuid, p_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid;
  v_held uuid;
  v_held_id uuid;
  v_old public.customer_identities;
  v_new public.customer_identities;
  inv public.member_invites;
begin
  select organization_id into v_org from public.member_invites where id = p_invite_id;
  if v_org is null then return 'invite_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('member_invites:' || v_org::text, 0));
  select * into inv from public.member_invites where id = p_invite_id for update;
  select id, organization_id into v_held_id, v_held from public.customer_identities
    where site_id = p_site_id and external_id = p_external_id;
  if found then
    if inv.transfer_of is not null and v_held_id = inv.transfer_of then return 'transfer_same_member'; end if;
    return case when v_held = v_org then 'ok' else 'invite_member_linked' end;
  end if;
  if inv.voided_at is not null then return 'invite_invalid'; end if;
  if inv.used_at is not null then return 'invite_used'; end if;
  if inv.expires_at <= now() then return 'invite_expired'; end if;
  if lower(btrim(coalesce(p_email, ''))) <> inv.email then return 'invite_email_mismatch'; end if;
  if not exists (select 1 from public.organizations where id = v_org
                   and parent_organization_id is null and kind in ('customer','test')) then
    return 'invite_not_customer';
  end if;
  if inv.transfer_of is null then
    if exists (select 1 from public.customer_identities where organization_id = v_org) then return 'invite_org_linked'; end if;
    begin
      insert into public.customer_identities(provider, site_id, external_id, user_id, organization_id)
        values (p_provider, p_site_id, p_external_id, p_user_id, v_org);
    exception when unique_violation then
      return 'identity_conflict';   -- this app user already holds another identity on this site
    end;
  else
    select * into v_old from public.customer_identities where organization_id = v_org for update;
    if not found or v_old.id <> inv.transfer_of then return 'transfer_stale'; end if;
    begin
      delete from public.customer_identities where id = v_old.id;
      insert into public.former_customer_identities(identity_id, provider, site_id, external_id, user_id, organization_id,
                                                    linked_at, invite_id)
        values (v_old.id, v_old.provider, v_old.site_id, v_old.external_id, v_old.user_id, v_old.organization_id,
                v_old.created_at, inv.id);
      insert into public.customer_identities(provider, site_id, external_id, user_id, organization_id)
        values (p_provider, p_site_id, p_external_id, p_user_id, v_org) returning * into v_new;
      insert into public.ops_audit_events(organization_id, actor_role, event_type, target_type, target_id, trace_id, payload)
        values (v_org, inv.transfer_actor_role, 'member_transferred', 'organizations', v_org::text, gen_random_uuid()::text,
          jsonb_build_object(
            'invite_id', inv.id, 'initiated_by', inv.created_by, 'reason', inv.transfer_reason, 'role_source', 'member_transfer',
            'old_identity', jsonb_build_object('id', v_old.id, 'provider', v_old.provider, 'site_id', v_old.site_id,
              'external_id', v_old.external_id, 'user_id', v_old.user_id, 'created_at', v_old.created_at),
            'new_identity', jsonb_build_object('id', v_new.id, 'provider', v_new.provider, 'site_id', v_new.site_id,
              'external_id', v_new.external_id, 'user_id', v_new.user_id)));
    exception when unique_violation then
      return 'identity_conflict';   -- the new app user already holds another identity on this site
    end;
  end if;
  update public.member_invites set used_at = now(), used_site_id = p_site_id, used_external_id = p_external_id
    where id = p_invite_id;
  return 'ok';
end $$;

revoke all on function public.member_transfer_issue(uuid, text, text, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.member_transfer_issue(uuid, text, text, timestamptz, text, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
