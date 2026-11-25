-- 0184: member events from a cash-register site know about deleted members and are not replayable (ADR 021 G10;
-- DISPATCH M10). The plugin (aware-wave-store MemberInvite / MemberEvents) signs member events like payment events and
-- now stamps each one with event_id (the payment events' format) and occurred_at (the site's clock).
-- member_events = every event the database decided, one row per (site, event_id). Rules, decided under the member's
-- lock in the same transaction as the change they guard:
--   * the same event_id again -> nothing is redone, the first answer is returned;
--   * an event older than the member's latest applied state change (member_invite that linked, member_deleted) is
--     refused, final: event_stale. A tie with a deletion is refused too (a deleted member stays deleted).
-- Locks: the member's own (site + external id) first, then the account's 0180 lock when an account is touched -- every
-- other path takes only the account lock, so the order never inverts.
-- member_deleted moves the member's customer_identities row to former_customer_identities (reason 'deleted'; money they
-- moved stays the account's through findFormerAccount, unchanged) and writes ops_audit_events; sign-in reads only
-- customer_identities, so wp-handoff answers not_a_member. member_email_changed only audits (email domains, no address).
-- The service_role grants on customer_identities stay select, insert: only these security-definer functions delete.
-- Existing data: former_customer_identities rows (0182 transfers) get reason 'transfer' by the column default.
-- APPLY:  node scripts/apply-db-migration.mjs 0184   (before the next-admin that sends event stamps; revert = .down.sql)
begin;
set local lock_timeout = '5s';

create table public.member_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.seller_sites(id) on delete restrict,
  event_id text not null check (event_id ~ '^[A-Za-z0-9_.:/#-]{1,200}$'),   -- = next-admin woo-billing.ts EVENT_ID
  kind text not null check (kind in ('member_invite', 'member_deleted', 'member_email_changed')),
  external_id text not null check (length(external_id) between 1 and 100),
  occurred_at timestamptz not null,
  result text not null check (result ~ '^[a-z0-9_]{1,60}$'),
  applied boolean not null,   -- a state change of this member: the reference the stale rule compares against
  organization_id uuid references public.organizations(id) on delete restrict,   -- the account it touched, if any
  received_at timestamptz not null default now(),
  constraint member_events_once unique (site_id, event_id)
);
create index member_events_applied_idx on public.member_events(site_id, external_id, occurred_at desc) where applied;
alter table public.member_events enable row level security;
revoke all on table public.member_events from public, anon, authenticated;
revoke all on table public.member_events from service_role;
grant select on table public.member_events to service_role;
create policy member_events_service_role on public.member_events for select to service_role using (true);

-- Why a member link ended: a transfer (0182, names its invite) or the member deleted on the site (names its event).
alter table public.former_customer_identities
  add column reason text not null default 'transfer' check (reason in ('transfer', 'deleted')),
  add column member_event_id uuid references public.member_events(id) on delete restrict,
  alter column invite_id drop not null,
  add constraint former_customer_identities_reason_ref check (
    (reason = 'transfer' and invite_id is not null and member_event_id is null)
    or (reason = 'deleted' and invite_id is null and member_event_id is not null));
create index former_customer_identities_org_idx on public.former_customer_identities(organization_id, replaced_at desc);

-- The stored answer for this event id, or event_stale, or null = a new event to decide. Callers hold the member's lock.
-- event_id_reused: the id is already another member's or another kind's event (the sender's bug; final).
create function public.member_event_prior(p_site_id uuid, p_event_id text, p_kind text, p_external_id text,
  p_occurred_at timestamptz) returns text
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(
    (select case when e.kind = p_kind and e.external_id = p_external_id then e.result else 'event_id_reused' end
       from public.member_events e where e.site_id = p_site_id and e.event_id = p_event_id),
    (select 'event_stale' from public.member_events e
       where e.site_id = p_site_id and e.external_id = p_external_id and e.applied
         and (e.occurred_at > p_occurred_at or (e.occurred_at = p_occurred_at and e.kind = 'member_deleted'))
       limit 1));
$$;
revoke all on function public.member_event_prior(uuid, text, text, text, timestamptz) from public, anon, authenticated, service_role;

create function public.member_event_lock(p_site_id uuid, p_external_id text) returns void
language sql volatile security invoker set search_path = public, pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended('member_events:' || p_site_id::text || ':' || p_external_id, 0));
$$;
revoke all on function public.member_event_lock(uuid, text) from public, anon, authenticated, service_role;

-- The route's early answer (no lock, read only): a known event's stored answer with its account, or event_stale, so a
-- replayed or late member_invite makes no app account before the locked decision below refuses it.
create function public.member_event_check(p_site_id uuid, p_event_id text, p_kind text, p_external_id text,
  p_occurred_at timestamptz) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when v.result is null then null else jsonb_build_object('result', v.result, 'organization_id',
    (select e.organization_id from public.member_events e where e.site_id = p_site_id and e.event_id = p_event_id
       and e.kind = p_kind and e.external_id = p_external_id)) end
  from (select public.member_event_prior(p_site_id, p_event_id, p_kind, p_external_id, p_occurred_at) as result) v;
$$;

-- member_invite: 0182's member_invite_redeem, decided once per event and never for a stale one.
create function public.member_event_invite(p_site_id uuid, p_event_id text, p_occurred_at timestamptz, p_invite_id uuid,
  p_provider text, p_external_id text, p_user_id uuid, p_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v text;
begin
  perform public.member_event_lock(p_site_id, p_external_id);
  v := public.member_event_prior(p_site_id, p_event_id, 'member_invite', p_external_id, p_occurred_at);
  if v is not null then return v; end if;
  v := public.member_invite_redeem(p_invite_id, p_provider, p_site_id, p_external_id, p_user_id, p_email);
  insert into public.member_events(site_id, event_id, kind, external_id, occurred_at, result, applied, organization_id)
    values (p_site_id, p_event_id, 'member_invite', p_external_id, p_occurred_at, v, v = 'ok',
            (select organization_id from public.member_invites where id = p_invite_id));
  return v;
end $$;

-- member_deleted: the member's identity leaves (deleted), a live transfer naming it is voided (it can never complete),
-- one audit row. A member with no identity: recorded (applied, so a late invite of theirs stays refused), no_identity.
create function public.member_event_deleted(p_site_id uuid, p_event_id text, p_occurred_at timestamptz,
  p_provider text, p_external_id text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v text;
  v_old public.customer_identities;
  v_event uuid;
begin
  perform public.member_event_lock(p_site_id, p_external_id);
  v := public.member_event_prior(p_site_id, p_event_id, 'member_deleted', p_external_id, p_occurred_at);
  if v is not null then return v; end if;
  select * into v_old from public.customer_identities where site_id = p_site_id and external_id = p_external_id;
  if found then
    perform pg_advisory_xact_lock(hashtextextended('member_invites:' || v_old.organization_id::text, 0));
    -- re-read under the account's lock: a transfer may have replaced this member meanwhile (no row = nulls)
    select * into v_old from public.customer_identities where id = v_old.id for update;
  end if;
  if v_old.id is null then
    insert into public.member_events(site_id, event_id, kind, external_id, occurred_at, result, applied)
      values (p_site_id, p_event_id, 'member_deleted', p_external_id, p_occurred_at, 'no_identity', true);
    return 'no_identity';
  end if;
  insert into public.member_events(site_id, event_id, kind, external_id, occurred_at, result, applied, organization_id)
    values (p_site_id, p_event_id, 'member_deleted', p_external_id, p_occurred_at, 'deleted', true, v_old.organization_id)
    returning id into v_event;
  delete from public.customer_identities where id = v_old.id;
  insert into public.former_customer_identities(identity_id, provider, site_id, external_id, user_id, organization_id,
                                                linked_at, reason, member_event_id)
    values (v_old.id, v_old.provider, v_old.site_id, v_old.external_id, v_old.user_id, v_old.organization_id,
            v_old.created_at, 'deleted', v_event);
  update public.member_invites set voided_at = now()
    where organization_id = v_old.organization_id and transfer_of = v_old.id and used_at is null and voided_at is null;
  insert into public.ops_audit_events(organization_id, actor_role, event_type, target_type, target_id, trace_id, payload)
    values (v_old.organization_id, 'operator', 'member_deleted', 'organizations', v_old.organization_id::text,
      gen_random_uuid()::text,
      jsonb_build_object('role_source', 'member_event', 'site_id', p_site_id, 'event_id', p_event_id,
        'occurred_at', p_occurred_at, 'identity', jsonb_build_object('id', v_old.id, 'provider', v_old.provider,
          'external_id', v_old.external_id, 'user_id', v_old.user_id, 'created_at', v_old.created_at)));
  return 'deleted';
end $$;

-- member_email_changed: audit only (identities never follow an email; the domains only, never an address).
create function public.member_event_email_changed(p_site_id uuid, p_event_id text, p_occurred_at timestamptz,
  p_provider text, p_external_id text, p_old_domain text, p_new_domain text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v text;
  v_org uuid;
begin
  if p_old_domain !~ '^[a-z0-9.-]{1,253}$' or p_new_domain !~ '^[a-z0-9.-]{1,253}$' then
    raise exception 'member_event:invalid_domain';
  end if;
  perform public.member_event_lock(p_site_id, p_external_id);
  v := public.member_event_prior(p_site_id, p_event_id, 'member_email_changed', p_external_id, p_occurred_at);
  if v is not null then return v; end if;
  select organization_id into v_org from public.customer_identities where site_id = p_site_id and external_id = p_external_id;
  v := case when v_org is null then 'no_identity' else 'audited' end;
  insert into public.member_events(site_id, event_id, kind, external_id, occurred_at, result, applied, organization_id)
    values (p_site_id, p_event_id, 'member_email_changed', p_external_id, p_occurred_at, v, false, v_org);
  if v_org is not null then
    insert into public.ops_audit_events(organization_id, actor_role, event_type, target_type, target_id, trace_id, payload)
      values (v_org, 'operator', 'member_email_changed', 'organizations', v_org::text, gen_random_uuid()::text,
        jsonb_build_object('role_source', 'member_event', 'site_id', p_site_id, 'event_id', p_event_id,
          'occurred_at', p_occurred_at, 'external_id', p_external_id,
          'old_email_domain', p_old_domain, 'new_email_domain', p_new_domain));
  end if;
  return v;
end $$;

revoke all on function public.member_event_check(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.member_event_check(uuid, text, text, text, timestamptz) to service_role;
revoke all on function public.member_event_invite(uuid, text, timestamptz, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.member_event_invite(uuid, text, timestamptz, uuid, text, text, uuid, text) to service_role;
revoke all on function public.member_event_deleted(uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.member_event_deleted(uuid, text, timestamptz, text, text) to service_role;
revoke all on function public.member_event_email_changed(uuid, text, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.member_event_email_changed(uuid, text, timestamptz, text, text, text, text) to service_role;
-- Every redeem now goes through member_event_invite (stamped, replay-checked): the app loses the unstamped entry point.
revoke execute on function public.member_invite_redeem(uuid, text, uuid, text, uuid, text) from service_role;

notify pgrst, 'reload schema';
commit;
