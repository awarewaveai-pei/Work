-- back to 0126's source list; NOT VALID keeps incidents already raised with source 'outreach' readable, but an UPDATE of
-- such a row (ack, resolve, a repeat upsert) then fails the check: resolve every source='outreach' incident before rolling back.
-- repair_runs back to 0059's list, NOT VALID for the same reason.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.ops_incidents') is not null then
    alter table public.ops_incidents drop constraint if exists ops_incidents_source_check;
    alter table public.ops_incidents add constraint ops_incidents_source_check
      check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch','schedule','social','payments')) not valid;
  end if;
  if to_regclass('public.repair_runs') is not null then
    alter table public.repair_runs drop constraint if exists repair_runs_source_check;
    alter table public.repair_runs add constraint repair_runs_source_check
      check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy')) not valid;
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0167_ops_incidents_outreach_source.sql';
  end if;
end $$;
commit;
