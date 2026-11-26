-- Back to 0184. Revert next-admin first (/portal/api/people writes actor_role 'client'). Refused while any row is a
-- customer's ('client'): those rows are the record of what customers did, so they are never rewritten or deleted --
-- 0185 is rolled forward, not down, once a customer has acted.
begin;
set local lock_timeout = '5s';

lock table public.ops_audit_events, public.ops_action_runs in share mode;
do $$ begin
  if exists (select 1 from public.ops_audit_events where actor_role = 'client')
     or exists (select 1 from public.ops_action_runs where actor_role = 'client') then
    raise exception 'rows with actor_role client exist: 0185 is rolled forward, not down';
  end if;
end $$;

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0185_audit_actor_role_client.sql';
  end if;
end $$;

alter table public.ops_audit_events drop constraint ops_audit_events_actor_role_check;
alter table public.ops_audit_events add constraint ops_audit_events_actor_role_check
  check (actor_role in ('owner', 'admin', 'operator', 'viewer'));
alter table public.ops_action_runs drop constraint ops_action_runs_actor_role_check;
alter table public.ops_action_runs add constraint ops_action_runs_actor_role_check
  check (actor_role in ('owner', 'admin', 'operator', 'viewer'));

notify pgrst, 'reload schema';
commit;
