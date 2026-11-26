-- 0185: a customer's own actions are audited as a customer (ADR 021 G4, U19 成員授權). ops_audit_events and
-- ops_action_runs took staff roles only (0011: owner / admin / operator / viewer), so /portal/api/people would have had
-- to record a unit manager's invite as a staff "viewer" -- a row that says staff did what a customer did. 'client' is
-- added to both checks; who it was stays in payload.actor_user_id (the
-- project convention, lib/accounts/staff-accounts.ts:159). Nothing else changes: existing rows
-- keep their roles (M10's member events stay 'operator').
-- APPLY:  node scripts/apply-db-migration.mjs 0185   (before the next-admin whose /portal/api/people writes 'client')
begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ops_audit_events_actor_role_check'
                   and conrelid = 'public.ops_audit_events'::regclass)
     or not exists (select 1 from pg_constraint where conname = 'ops_action_runs_actor_role_check'
                   and conrelid = 'public.ops_action_runs'::regclass) then
    raise exception '0185: the 0011 actor_role checks are not where expected; look before re-running';
  end if;
end $$;

alter table public.ops_audit_events drop constraint ops_audit_events_actor_role_check;
alter table public.ops_audit_events add constraint ops_audit_events_actor_role_check
  check (actor_role in ('owner', 'admin', 'operator', 'viewer', 'client'));
alter table public.ops_action_runs drop constraint ops_action_runs_actor_role_check;
alter table public.ops_action_runs add constraint ops_action_runs_actor_role_check
  check (actor_role in ('owner', 'admin', 'operator', 'viewer', 'client'));

notify pgrst, 'reload schema';
commit;
