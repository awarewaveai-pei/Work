-- Down for 0058_ops_incidents_parent_incident.sql.
-- Column is display/grouping only; dropping it loses correlation links but no
-- incident data. Application code treats a missing column as "linking skipped"
-- (fail-open), so this down is safe to run while the app is live.

drop index if exists idx_ops_incidents_parent;
alter table ops_incidents drop column if exists parent_incident_id;
