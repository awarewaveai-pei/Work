-- Authenticated RLS policies for ops-console tables and global permission catalogs.
--
-- Context:
-- - 0014_enable_public_table_rls.sql enables RLS on public tables (plus sweep).
-- - 0011 creates ops_action_* / ai_image_jobs / ops_audit_events (org-scoped).
-- - permissions / role_permissions are global reference tables (0001); 0010 defines
--   roles_select_scoped but did not add policies for role_permissions or permissions.
--
-- Without policies, anon/authenticated default-deny except where expressions apply.
-- service_role continues to bypass RLS (Trigger / Edge / admin automation).
--
-- Idempotent: drop policy if exists before create.

-- ─── ops_action_catalog (no organization_id; reference data for operators) ───
alter table public.ops_action_catalog enable row level security;

drop policy if exists ops_action_catalog_select_authenticated on public.ops_action_catalog;
create policy ops_action_catalog_select_authenticated on public.ops_action_catalog
for select
to authenticated
using (true);

-- ─── ops_action_runs (same access shape as workflow_runs in 0010) ─────────────
alter table public.ops_action_runs enable row level security;

drop policy if exists ops_action_runs_select on public.ops_action_runs;
create policy ops_action_runs_select on public.ops_action_runs
for select
using (user_has_org_access(organization_id));

drop policy if exists ops_action_runs_insert on public.ops_action_runs;
create policy ops_action_runs_insert on public.ops_action_runs
for insert
with check (user_has_org_access(organization_id));

drop policy if exists ops_action_runs_update on public.ops_action_runs;
create policy ops_action_runs_update on public.ops_action_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));

drop policy if exists ops_action_runs_delete on public.ops_action_runs;
create policy ops_action_runs_delete on public.ops_action_runs
for delete
using (user_has_org_access(organization_id));

-- ─── ai_image_jobs ───────────────────────────────────────────────────────────
alter table public.ai_image_jobs enable row level security;

drop policy if exists ai_image_jobs_select on public.ai_image_jobs;
create policy ai_image_jobs_select on public.ai_image_jobs
for select
using (user_has_org_access(organization_id));

drop policy if exists ai_image_jobs_insert on public.ai_image_jobs;
create policy ai_image_jobs_insert on public.ai_image_jobs
for insert
with check (user_has_org_access(organization_id));

drop policy if exists ai_image_jobs_update on public.ai_image_jobs;
create policy ai_image_jobs_update on public.ai_image_jobs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));

drop policy if exists ai_image_jobs_delete on public.ai_image_jobs;
create policy ai_image_jobs_delete on public.ai_image_jobs
for delete
using (user_has_org_access(organization_id));

-- ─── ops_audit_events ────────────────────────────────────────────────────────
alter table public.ops_audit_events enable row level security;

drop policy if exists ops_audit_events_select on public.ops_audit_events;
create policy ops_audit_events_select on public.ops_audit_events
for select
using (user_has_org_access(organization_id));

drop policy if exists ops_audit_events_insert on public.ops_audit_events;
create policy ops_audit_events_insert on public.ops_audit_events
for insert
with check (user_has_org_access(organization_id));

drop policy if exists ops_audit_events_update on public.ops_audit_events;
create policy ops_audit_events_update on public.ops_audit_events
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));

drop policy if exists ops_audit_events_delete on public.ops_audit_events;
create policy ops_audit_events_delete on public.ops_audit_events
for delete
using (user_has_org_access(organization_id));

-- ─── permissions (global catalog; authenticated read only) ────────────────────
alter table public.permissions enable row level security;

drop policy if exists permissions_select_authenticated on public.permissions;
create policy permissions_select_authenticated on public.permissions
for select
to authenticated
using (true);

-- ─── role_permissions (visibility aligned with roles_select_scoped in 0010) ───
alter table public.role_permissions enable row level security;

drop policy if exists role_permissions_select_scoped on public.role_permissions;
create policy role_permissions_select_scoped on public.role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (
        r.organization_id is null
        or user_has_org_access(r.organization_id)
      )
  )
);
