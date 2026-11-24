-- 0180: staff sign an existing account up as an aware-wave.com member (ADR 021 D4, G1; DISPATCH M5). Staff name the
-- account and its contact's email on the client hub; the member proves that email on the cash-register site, which sends
-- the one-time code back with its signed event; only then is a customer_identities row (0124, insert-only) written to
-- THIS account. Never found by email: the code names the account.
-- Invariants: the code itself is never stored (code_hash = sha256 hex; the plain code is shown to staff once);
-- one live invite per account (not used, not voided -- an expired one stays live until staff reissue, which voids it);
-- used_* = the identity (site_id, external_id) that redeemed it, set together with used_at; a row is never deleted
-- (the history of who was invited stays). Expiry is checked by the app against expires_at.
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
grant select, insert, update on table public.member_invites to service_role;
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

notify pgrst, 'reload schema';
commit;
