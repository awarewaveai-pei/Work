-- Down for 0100_social_dispatch.sql: drops the sender functions, the backoff table and the send lease column.
-- ORDER: stop the sender first (SOCIAL_DISPATCH_ENABLED unset on next-admin, or the social-dispatch Trigger task gone),
-- or its rpc calls fail with PGRST202 every 5 minutes. Rows already queued / published stay as they are; a target whose
-- lease was mid-send loses the stamp, so after re-applying 0100 it is sent as new (check Postiz for that post first).
--
-- APPLY WITH:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 0100_social_dispatch_down.sql
begin;
set local lock_timeout = '1s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0100_social_dispatch.sql';
  end if;
end $$;

drop function if exists public.social_claim_due(timestamptz, integer, text);
drop function if exists public.social_begin_send(uuid, uuid, integer, uuid, interval);
drop function if exists public.social_record_send(uuid, uuid, integer, uuid, text, text, text);
drop function if exists public.social_reset_target(uuid, uuid, integer, uuid, text);
drop function if exists public.social_record_outcome(uuid, uuid, integer, jsonb, text);
drop function if exists public.social_release_post(uuid, uuid, integer, text[], text, timestamptz, text, text, jsonb);
drop table if exists public.social_dispatch_state;
-- orphans still listed here would stay in Postiz: check the table is empty before running this down
drop table if exists public.social_postiz_orphans;
-- back to 0097's source list; NOT VALID keeps incidents already raised by the sender readable
do $$
begin
  if to_regclass('public.ops_incidents') is not null then
    alter table public.ops_incidents drop constraint if exists ops_incidents_source_check;
    alter table public.ops_incidents add constraint ops_incidents_source_check
      check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch','schedule')) not valid;
  end if;
end $$;
alter table public.social_post_targets drop column if exists send_started_at;
alter table public.social_post_targets drop column if exists send_key;
notify pgrst, 'reload schema';
commit;
