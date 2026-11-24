-- 0180: staff sign an existing account up as an aware-wave.com member (ADR 021 D4, G1; DISPATCH M5). Staff name the
-- account and its contact's email on the client hub; the member proves that email on the cash-register site, which sends
-- the one-time code back with its signed event; only then is a customer_identities row (0124, insert-only) written to
-- THIS account. Never found by email: the code names the account.
-- Invariants: the code itself is never stored (code_hash = sha256 hex; the plain code is shown to staff once);
-- one live invite per account (not used, not voided -- an expired one stays live until staff reissue, which voids it);
-- used_* = the identity (site_id, external_id) that redeemed it, set together with used_at; a row is never deleted
-- (the history of who was invited stays). Issue and redeem run only inside member_invite_issue / member_invite_redeem.
-- APPLY:  node scripts/apply-db-migration.mjs 0180   (revert = 0180_member_invites.down.sql; revert the app first)
begin;
set local lock_timeout = '5s';

create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254 and position('@' in email) > 1),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by text not null check (length(btrim(created_by)) > 0),
  voided_at timestamptz,
  used_at timestamptz,
  used_site_id uuid references public.seller_sites(id) on delete restrict,
  used_external_id text check (used_external_id is null or length(used_external_id) between 1 and 100),
  check (expires_at > created_at),
  check ((used_at is null) = (used_site_id is null) and (used_at is null) = (used_external_id is null)),
  check (used_at is null or voided_at is null)
);
create unique index member_invites_one_live on public.member_invites(organization_id) where used_at is null and voided_at is null;

alter table public.member_invites enable row level security;
revoke all on table public.member_invites from public, anon, authenticated;
revoke all on table public.member_invites from service_role;
-- Issuing and redeeming go through the two functions below only (each one transaction); the app may read and void.
grant select on table public.member_invites to service_role;
grant update (voided_at) on table public.member_invites to service_role;
create policy member_invites_service_role on public.member_invites
  for all to service_role using (true) with check (true);

-- A root customer or test account only (the accounts 0178 admits); what an invite names never changes, and a used or
-- voided invite is closed for good.
create function public.member_invites_account_check() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (new.organization_id, new.email, new.code_hash, new.expires_at, new.created_at, new.created_by)
       is distinct from (old.organization_id, old.email, old.code_hash, old.expires_at, old.created_at, old.created_by) then
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
revoke all on function public.member_invites_account_check() from public, anon, authenticated;
grant execute on function public.member_invites_account_check() to service_role;
create trigger member_invites_account_check before insert or update
  on public.member_invites for each row execute function public.member_invites_account_check();

-- "One account, at most one member" and the invite's state hold inside one transaction, under one lock per account
-- (Codex review of bbb7aba02: a check and two writes in separate requests let two invites of one account both link).
-- Every issue and redeem of an account takes the same advisory lock; customer_identities stays insert-only (0124).
-- Issue = void the live invite and insert the new one together: an insert that fails leaves the old code valid.
create function public.member_invite_issue(p_organization_id uuid, p_email text, p_code_hash text,
  p_expires_at timestamptz, p_created_by text) returns public.member_invites
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.member_invites;
begin
  perform pg_advisory_xact_lock(hashtextextended('member_invites:' || p_organization_id::text, 0));
  update public.member_invites set voided_at = now()
    where organization_id = p_organization_id and used_at is null and voided_at is null;
  insert into public.member_invites(organization_id, email, code_hash, expires_at, created_by)
    values (p_organization_id, p_email, p_code_hash, p_expires_at, p_created_by) returning * into v;
  return v;
end $$;

-- Redeem: 'ok' (also for this member's retried event), else the refusal code the app reports (wp-customers.ts). The
-- identity row has the columns linkIdentity writes; the invite is marked used by the same identity in the same commit.
create function public.member_invite_redeem(p_invite_id uuid, p_provider text, p_site_id uuid, p_external_id text,
  p_user_id uuid, p_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid;
  v_held uuid;
  inv public.member_invites;
begin
  select organization_id into v_org from public.member_invites where id = p_invite_id;
  if v_org is null then return 'invite_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('member_invites:' || v_org::text, 0));
  select * into inv from public.member_invites where id = p_invite_id for update;
  select organization_id into v_held from public.customer_identities where site_id = p_site_id and external_id = p_external_id;
  if found then
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
  if exists (select 1 from public.customer_identities where organization_id = v_org) then return 'invite_org_linked'; end if;
  begin
    insert into public.customer_identities(provider, site_id, external_id, user_id, organization_id)
      values (p_provider, p_site_id, p_external_id, p_user_id, v_org);
  exception when unique_violation then
    return 'identity_conflict';   -- this app user already holds another identity on this site
  end;
  update public.member_invites set used_at = now(), used_site_id = p_site_id, used_external_id = p_external_id
    where id = p_invite_id;
  return 'ok';
end $$;

revoke all on function public.member_invite_issue(uuid, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.member_invite_redeem(uuid, text, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.member_invite_issue(uuid, text, text, timestamptz, text) to service_role;
grant execute on function public.member_invite_redeem(uuid, text, uuid, text, uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
