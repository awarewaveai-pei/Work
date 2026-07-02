-- 0054_repair_runs_add_org.sql
-- S3 security: add organization_id to repair_runs for tenant isolation.
-- repair_runs previously only stored client_slug (denormalized text); backfill
-- via ops_incidents which already has organization_id.
-- Safe to run on live DB: ADD COLUMN with default NULL + index creation only.

alter table repair_runs
  add column if not exists organization_id uuid references organizations(id) on delete set null;

-- Backfill from ops_incidents (non-blocking, nullable column)
update repair_runs rr
set organization_id = oi.organization_id
from ops_incidents oi
where rr.incident_id = oi.id
  and rr.organization_id is null
  and oi.organization_id is not null;

create index if not exists repair_runs_org_id_idx
  on repair_runs(organization_id)
  where organization_id is not null;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
