-- 0167: a Gmail outreach connector whose Google grant is expired or revoked (invalid_grant) raises an ops incident with
-- source 'outreach' (next-admin lib/outreach/connector-auth.ts, card OUT-GMAIL-REAUTH). 0126's list plus 'outreach'.
-- repair_runs_source_check (0059) never followed ops_incidents past 'deploy': starting a repair run from a
-- collection/site_watch/schedule/social/payments/outreach incident failed the insert (Codex ea221aca F1). Both lists now
-- equal next-admin lib/ops-inbox/types.ts IncidentSource.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.ops_incidents') is not null then
    alter table public.ops_incidents drop constraint if exists ops_incidents_source_check;
    alter table public.ops_incidents add constraint ops_incidents_source_check
      check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch','schedule','social','payments','outreach'));
  end if;
  if to_regclass('public.repair_runs') is not null then
    alter table public.repair_runs drop constraint if exists repair_runs_source_check;
    alter table public.repair_runs add constraint repair_runs_source_check
      check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy','collection','site_watch','schedule','social','payments','outreach'));
  end if;
end $$;
commit;
