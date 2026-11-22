-- Back to 0176. Revert next-admin first (its page writes these event types). Refuses while any refresh_request /
-- system_proposed / system_proposal_closed row exists: system_updates is append-only (0174 trigger), so they cannot be deleted, and the narrower
-- check would not validate with them in the table.
begin;
set local lock_timeout = '5s';

do $$
declare n bigint;
begin
  select count(*) into n from public.system_updates where event_type in ('refresh_request', 'system_proposed', 'system_proposal_closed');
  if n > 0 then
    raise exception '0177 down: % refresh_request / system_proposed / system_proposal_closed row(s) exist in append-only system_updates; the narrower check cannot hold them', n;
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0177_systems_user_requests.sql';
  end if;
end $$;

drop view if exists public.system_last_commit;
alter table public.system_updates drop constraint system_updates_event_type_check;
alter table public.system_updates add constraint system_updates_event_type_check check (event_type in
  ('activity', 'handoff', 'feature_update', 'status_change', 'review', 'revert', 'orphaned', 'migration', 'import_run'));

notify pgrst, 'reload schema';
commit;
