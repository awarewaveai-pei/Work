-- Back to 0179. Revert next-admin first (the client hub 帳號 tab and the payment webhook's invite path read this table).
-- Drops every invite row: a pending one is simply gone (staff issue a new one after re-applying 0180); a used one was
-- only the record of how its customer_identities row came to be -- that row stays (0124 rows are never touched here).
-- The creations and voids stay in ops_audit_events (member_invite_created / member_invite_voided).
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0180_member_invites.sql';
  end if;
end $$;

drop function if exists public.member_invite_redeem(uuid, text, uuid, text, uuid, text);
drop function if exists public.member_invite_issue(uuid, text, text, timestamptz, text);
drop table if exists public.member_invites;
drop function if exists public.member_invites_account_check();

notify pgrst, 'reload schema';
commit;
