-- Back to 0183. Revert next-admin first (the member-event route calls member_event_* and reads member_events). Refused
-- once a member was deleted (former_customer_identities has reason 'deleted' rows): those rows route the deleted member's
-- refunds to the account and have no invite, so 0184 is rolled forward, not down. Transfer rows keep their data.
begin;
set local lock_timeout = '5s';

lock table public.former_customer_identities in access exclusive mode;
do $$ begin
  if exists (select 1 from public.former_customer_identities where reason = 'deleted') then
    raise exception 'former_customer_identities has deleted-member rows: 0184 is rolled forward, not down';
  end if;
end $$;

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0184_member_events.sql';
  end if;
end $$;

grant execute on function public.member_invite_redeem(uuid, text, uuid, text, uuid, text) to service_role;
drop function if exists public.member_event_email_changed(uuid, text, timestamptz, text, text, text, text);
drop function if exists public.member_event_deleted(uuid, text, timestamptz, text, text);
drop function if exists public.member_event_invite(uuid, text, timestamptz, uuid, text, text, uuid, text);
drop function if exists public.member_event_check(uuid, text, text, text, timestamptz);
drop function if exists public.member_event_lock(uuid, text);
drop function if exists public.member_event_prior(uuid, text, text, text, timestamptz);

drop index if exists public.former_customer_identities_org_idx;
alter table public.former_customer_identities
  drop constraint former_customer_identities_reason_ref,
  drop column member_event_id,
  drop column reason,
  alter column invite_id set not null;
drop table public.member_events;

notify pgrst, 'reload schema';
commit;
