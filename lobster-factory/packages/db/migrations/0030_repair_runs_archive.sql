-- lobster-factory/packages/db/migrations/0030_repair_runs_archive.sql
-- Soft-archive for terminal repair_runs.
-- Keeps the active run set lean without destroying the audit trail.
-- Archival is triggered via the application API (POST /api/ops/repairs/archive-stale)
-- or by manually calling archive_stale_repair_runs(retention_days).

alter table public.repair_runs
  add column if not exists archived_at timestamptz;

-- Partial index: active run queries skip archived rows at the index level.
create index if not exists repair_runs_active_created_idx
  on public.repair_runs(created_at desc)
  where archived_at is null;

create index if not exists repair_runs_active_state_idx
  on public.repair_runs(state)
  where archived_at is null;

-- Archive all terminal-state runs older than retention_days.
-- Terminal states: resolved, rolled_back, human_only.
-- Uses updated_at so a run that was recently touched (e.g. note added) is not archived prematurely.
create or replace function public.archive_stale_repair_runs(retention_days int default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_count integer;
begin
  update public.repair_runs
  set archived_at = now()
  where archived_at is null
    and state in ('resolved', 'rolled_back', 'human_only')
    and updated_at < now() - (retention_days || ' days')::interval;

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

comment on function public.archive_stale_repair_runs(int) is
  'Soft-archives terminal repair_runs older than retention_days days. '
  'Call via POST /api/ops/repairs/archive-stale or schedule with pg_cron: '
  'select cron.schedule(''archive-stale-repair-runs'', ''0 2 * * *'', '
  '$$select public.archive_stale_repair_runs(90)$$);';

comment on column public.repair_runs.archived_at is
  'Set when a terminal run is soft-archived. Archived runs are excluded from the '
  'Repair Center list but remain accessible by direct ID lookup for audit purposes.';

notify pgrst, 'reload schema';
