-- safe_to_auto_apply: true
-- reason: ADD COLUMN IF NOT EXISTS (nullable, no default) + partial index IF NOT EXISTS + NOTIFY pgrst.
--         All operations are metadata-only, idempotent, and carry no hard-block patterns.
-- Storm correlation (Auto-Repair A3, 2026-07-03).
-- One outage fires uptime_kuma + sentry + netdata as separate incidents.
-- parent_incident_id links later siblings to the earliest open incident in the
-- same ±15min window so the repair queue can collapse a storm into one row.
-- Linking is done best-effort in application code (upsertIncidentAtomic);
-- NULL = independent incident (or linking skipped). No behavior depends on
-- this column being populated — display/grouping only.

-- Hot-table guard: ADD COLUMN takes ACCESS EXCLUSIVE. Execution is metadata-only
-- (nullable, no default, all-NULL self-FK needs no validation scan), so the hold
-- is sub-millisecond — but acquisition can queue behind in-flight webhook
-- ingest. Abort rather than freeze ingest if the lock can't be had quickly.
set lock_timeout = '3s';

alter table ops_incidents
  add column if not exists parent_incident_id uuid
    references ops_incidents(id) on delete set null;

reset lock_timeout;

create index if not exists idx_ops_incidents_parent
  on ops_incidents(parent_incident_id)
  where parent_incident_id is not null;

-- Reload PostgREST schema cache — without this the new column is invisible to
-- the REST layer and every correlate.ts access fails (feature inert). Same
-- requirement as 0013/0056 on this table.
notify pgrst, 'reload schema';
