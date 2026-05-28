-- lobster-factory/packages/db/migrations/0032_archive_triage_needed.sql
-- m10 fix: extend archive_stale_repair_runs to also clean up stale triage_needed runs.
--
-- triage_needed runs accumulate forever under the current 0030 function because
-- triage_needed is not in TERMINAL_STATES and the WHERE clause only covers terminal states.
-- Stale triage runs that no operator ever resolved should be archived after a shorter
-- retention window (14 days vs 90 days for terminal runs) so the active run list
-- stays lean without destroying the audit trail.
--
-- Design choice: keep the same function signature (retention_days int default 90) so
-- pg_cron job and all service.ts callers require zero changes.
-- The triage_needed retention (14 days) is hardcoded here — adjust via a future
-- migration if operational requirements change.
--
-- ⚠️ Maintenance: if TERMINAL_STATES changes in run-state.ts, sync 0030 function too.
-- This file only adds triage_needed; the terminal-state list lives in 0030.

create or replace function public.archive_stale_repair_runs(retention_days int default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  terminal_archived integer;
  triage_archived   integer;
begin
  -- Archive terminal-state runs older than retention_days.
  -- Terminal states: resolved, rolled_back, human_only (SSOT: run-state.ts TERMINAL_STATES).
  update public.repair_runs
  set archived_at = now()
  where archived_at is null
    and state in ('resolved', 'rolled_back', 'human_only')
    and updated_at < now() - (retention_days || ' days')::interval;

  get diagnostics terminal_archived = row_count;

  -- Archive stale triage_needed runs older than 14 days.
  -- triage_needed is not a terminal state (operators can still act), but runs that
  -- have been untouched for 14 days represent abandoned triage decisions and should
  -- be swept from the active list.
  update public.repair_runs
  set archived_at = now()
  where archived_at is null
    and state = 'triage_needed'
    and updated_at < now() - interval '14 days';

  get diagnostics triage_archived = row_count;

  return terminal_archived + triage_archived;
end;
$$;

-- Permissions unchanged: service_role only.
-- The REVOKE/GRANT target the (int) overload — same signature as before.
revoke all on function public.archive_stale_repair_runs(int) from public;
grant execute on function public.archive_stale_repair_runs(int) to service_role;

comment on function public.archive_stale_repair_runs(int) is
  'Soft-archives stale repair_runs. '
  'Terminal runs (resolved/rolled_back/human_only) archived after retention_days (default 90). '
  'triage_needed runs archived after 14 days of inactivity (hardcoded, see 0032 migration). '
  'Call via POST /api/ops/repairs/archive-stale or pg_cron job archive-stale-repair-runs.';
