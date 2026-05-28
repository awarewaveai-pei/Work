-- lobster-factory/packages/db/migrations/0031_ops_incidents_deploy_source.sql
-- Add 'deploy' to ops_incidents source check constraint.
-- Required by: app/api/webhooks/deploy/route.ts (VPS auto-deploy events → ops_inbox pipeline)
-- Safe: DROP CONSTRAINT + ADD CONSTRAINT is idempotent; no data loss; no lock beyond table-level DDL lock.

alter table public.ops_incidents
  drop constraint if exists ops_incidents_source_check;

alter table public.ops_incidents
  add constraint ops_incidents_source_check
  check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy'));
