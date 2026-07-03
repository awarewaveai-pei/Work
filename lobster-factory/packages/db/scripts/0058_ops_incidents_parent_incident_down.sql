-- Down for 0058_ops_incidents_parent_incident.sql.
-- Column is display/grouping only; dropping it loses correlation links but no
-- incident data. Application code treats a missing column as "linking skipped"
-- (fail-open), so this down is safe to run while the app is live — provided the
-- PostgREST cache is reloaded (below) so `select *` on the reader page does not
-- keep advertising the dropped column.

set lock_timeout = '3s';
drop index if exists idx_ops_incidents_parent;
alter table ops_incidents drop column if exists parent_incident_id;
reset lock_timeout;

-- Reload so the REST layer stops advertising the dropped column immediately.
notify pgrst, 'reload schema';
