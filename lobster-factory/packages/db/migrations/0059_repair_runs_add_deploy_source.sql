-- lobster-factory/packages/db/migrations/0059_repair_runs_add_deploy_source.sql
-- Fix: repair_runs_source_check was missing 'deploy'.
-- Root cause: 0027_repair_runs.sql created the constraint without 'deploy';
-- 0031_ops_incidents_deploy_source.sql added 'deploy' to ops_incidents only,
-- forgot repair_runs. All deploy-source incidents 409 on approve since 0031.
-- Safe: DROP + ADD is idempotent (per 0031 precedent); no data migration;
-- no existing deploy rows to conflict (none could be inserted due to old constraint).
-- Rollback: DROP + re-ADD the 6-value constraint — only safe while zero deploy rows exist.

alter table public.repair_runs
  drop constraint if exists repair_runs_source_check;

alter table public.repair_runs
  add constraint repair_runs_source_check
  check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual','deploy'));

-- Reload PostgREST schema cache (per 0027 convention).
notify pgrst, 'reload schema';
