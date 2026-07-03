-- Storm correlation (Auto-Repair A3, 2026-07-03).
-- One outage fires uptime_kuma + sentry + netdata as separate incidents.
-- parent_incident_id links later siblings to the earliest open incident in the
-- same ±15min window so the repair queue can collapse a storm into one row.
-- Linking is done best-effort in application code (upsertIncidentAtomic);
-- NULL = independent incident (or linking skipped). No behavior depends on
-- this column being populated — display/grouping only.

alter table ops_incidents
  add column if not exists parent_incident_id uuid
    references ops_incidents(id) on delete set null;

create index if not exists idx_ops_incidents_parent
  on ops_incidents(parent_incident_id)
  where parent_incident_id is not null;
