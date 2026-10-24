-- back to 0100's source list; NOT VALID keeps incidents already raised with source 'payments' readable, but an UPDATE of
-- such a row (ack, resolve, a repeat upsert) then fails the check: resolve every source='payments' incident before rolling back.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.ops_incidents') is not null then
    alter table public.ops_incidents drop constraint if exists ops_incidents_source_check;
    alter table public.ops_incidents add constraint ops_incidents_source_check
      check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch','schedule','social')) not valid;
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0126_ops_incidents_payments_source.sql';
  end if;
end $$;
commit;
