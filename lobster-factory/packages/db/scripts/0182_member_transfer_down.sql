-- Back to 0181. Revert next-admin first (the client hub's member-transfer route and the payment webhook's transfer branch
-- read transfer_of). A live transfer invite is voided (it would read as an ordinary invite on an account that has a
-- member); a used one keeps its row without the transfer columns -- what it did stays in ops_audit_events
-- (member_transferred, member_transfer_created / _voided). Identity rows are never touched: a completed transfer stays.
-- The 0180 functions below are 0180's text verbatim.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0182_member_transfer.sql';
  end if;
end $$;

drop function if exists public.member_transfer_issue(uuid, text, text, timestamptz, text, text, text);
update public.member_invites set voided_at = now() where transfer_of is not null and used_at is null and voided_at is null;

create or replace function public.member_invites_account_check() returns trigger
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

create or replace function public.member_invite_redeem(p_invite_id uuid, p_provider text, p_site_id uuid, p_external_id text,
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

alter table public.member_invites
  drop constraint member_invites_transfer_whole,
  drop column transfer_of,
  drop column transfer_reason,
  drop column transfer_actor_role;
drop index if exists public.customer_identities_one_per_organization;

notify pgrst, 'reload schema';
commit;
