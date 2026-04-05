-- ADR 006: Clerk organization id <-> organizations.id mapping + expand RLS to tenant-scoped tables.
-- JWT: configure Clerk (or IdP) so Supabase sees a stable org claim; this migration reads in order:
--   auth.jwt() ->> 'org_id', 'clerk_org_id', app_metadata.org_id, user_metadata.org_id

create table if not exists clerk_organization_mappings (
  id uuid primary key default gen_random_uuid(),
  clerk_organization_id text not null unique,
  organization_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clerk_org_mappings_organization_id
  on clerk_organization_mappings(organization_id);

create or replace function current_clerk_org_id_from_jwt()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(trim(auth.jwt() ->> 'org_id'), ''),
    nullif(trim(auth.jwt() ->> 'clerk_org_id'), ''),
    nullif(trim(auth.jwt() -> 'app_metadata' ->> 'org_id'), ''),
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'org_id'), '')
  );
$$;

-- Membership-only path (no dependency on clerk_organization_mappings); safe for mapping table RLS.
create or replace function user_has_org_membership(org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from organization_memberships om
    where om.organization_id = org_id
      and om.user_id = auth.uid()::uuid
      and om.status = 'active'
  );
$$;

create or replace function user_has_org_access(org_id uuid)
returns boolean
language sql
stable
as $$
  select
    user_has_org_membership(org_id)
    or (
      current_clerk_org_id_from_jwt() is not null
      and exists (
        select 1
        from clerk_organization_mappings m
        where m.organization_id = org_id
          and m.status = 'active'
          and m.clerk_organization_id = current_clerk_org_id_from_jwt()
      )
    );
$$;

alter table clerk_organization_mappings enable row level security;

drop policy if exists clerk_organization_mappings_select on clerk_organization_mappings;
create policy clerk_organization_mappings_select on clerk_organization_mappings
for select
using (
  clerk_organization_id = current_clerk_org_id_from_jwt()
  or user_has_org_membership(organization_id)
);

-- Profiles & memberships: baseline tenant-safe reads (ADR 006 / least privilege).
alter table profiles enable row level security;
drop policy if exists profiles_select_self on profiles;
create policy profiles_select_self on profiles
for select
using (id = auth.uid()::uuid);
drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles
for insert
with check (id = auth.uid()::uuid);
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
for update
using (id = auth.uid()::uuid)
with check (id = auth.uid()::uuid);

alter table organization_memberships enable row level security;
drop policy if exists organization_memberships_select_self on organization_memberships;
create policy organization_memberships_select_self on organization_memberships
for select
using (user_id = auth.uid()::uuid);

alter table workspace_memberships enable row level security;
drop policy if exists workspace_memberships_select_self on workspace_memberships;
create policy workspace_memberships_select_self on workspace_memberships
for select
using (user_id = auth.uid()::uuid);

alter table roles enable row level security;
drop policy if exists roles_select_scoped on roles;
create policy roles_select_scoped on roles
for select
using (
  organization_id is null
  or user_has_org_access(organization_id)
);

alter table user_role_assignments enable row level security;
drop policy if exists user_role_assignments_select_scoped on user_role_assignments;
create policy user_role_assignments_select_scoped on user_role_assignments
for select
using (
  user_id = auth.uid()::uuid
  or (
    organization_id is not null
    and user_has_org_access(organization_id)
  )
);

-- Factory & ops tables keyed by organization_id (0002).
alter table workflow_runs enable row level security;
drop policy if exists workflow_runs_select on workflow_runs;
create policy workflow_runs_select on workflow_runs
for select
using (user_has_org_access(organization_id));
drop policy if exists workflow_runs_insert on workflow_runs;
create policy workflow_runs_insert on workflow_runs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists workflow_runs_update on workflow_runs;
create policy workflow_runs_update on workflow_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists workflow_runs_delete on workflow_runs;
create policy workflow_runs_delete on workflow_runs
for delete
using (user_has_org_access(organization_id));

alter table package_install_runs enable row level security;
drop policy if exists package_install_runs_select on package_install_runs;
create policy package_install_runs_select on package_install_runs
for select
using (user_has_org_access(organization_id));
drop policy if exists package_install_runs_insert on package_install_runs;
create policy package_install_runs_insert on package_install_runs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists package_install_runs_update on package_install_runs;
create policy package_install_runs_update on package_install_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists package_install_runs_delete on package_install_runs;
create policy package_install_runs_delete on package_install_runs
for delete
using (user_has_org_access(organization_id));

-- Agents / approvals / incidents (0003).
alter table approvals enable row level security;
drop policy if exists approvals_select on approvals;
create policy approvals_select on approvals
for select
using (user_has_org_access(organization_id));
drop policy if exists approvals_insert on approvals;
create policy approvals_insert on approvals
for insert
with check (user_has_org_access(organization_id));
drop policy if exists approvals_update on approvals;
create policy approvals_update on approvals
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists approvals_delete on approvals;
create policy approvals_delete on approvals
for delete
using (user_has_org_access(organization_id));

alter table approval_steps enable row level security;
drop policy if exists approval_steps_select on approval_steps;
create policy approval_steps_select on approval_steps
for select
using (
  exists (
    select 1
    from approvals a
    where a.id = approval_steps.approval_id
      and user_has_org_access(a.organization_id)
  )
);
drop policy if exists approval_steps_insert on approval_steps;
create policy approval_steps_insert on approval_steps
for insert
with check (
  exists (
    select 1
    from approvals a
    where a.id = approval_steps.approval_id
      and user_has_org_access(a.organization_id)
  )
);
drop policy if exists approval_steps_update on approval_steps;
create policy approval_steps_update on approval_steps
for update
using (
  exists (
    select 1
    from approvals a
    where a.id = approval_steps.approval_id
      and user_has_org_access(a.organization_id)
  )
)
with check (
  exists (
    select 1
    from approvals a
    where a.id = approval_steps.approval_id
      and user_has_org_access(a.organization_id)
  )
);
drop policy if exists approval_steps_delete on approval_steps;
create policy approval_steps_delete on approval_steps
for delete
using (
  exists (
    select 1
    from approvals a
    where a.id = approval_steps.approval_id
      and user_has_org_access(a.organization_id)
  )
);

alter table agent_runs enable row level security;
drop policy if exists agent_runs_select on agent_runs;
create policy agent_runs_select on agent_runs
for select
using (user_has_org_access(organization_id));
drop policy if exists agent_runs_insert on agent_runs;
create policy agent_runs_insert on agent_runs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists agent_runs_update on agent_runs;
create policy agent_runs_update on agent_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists agent_runs_delete on agent_runs;
create policy agent_runs_delete on agent_runs
for delete
using (user_has_org_access(organization_id));

alter table incidents enable row level security;
drop policy if exists incidents_select on incidents;
create policy incidents_select on incidents
for select
using (user_has_org_access(organization_id));
drop policy if exists incidents_insert on incidents;
create policy incidents_insert on incidents
for insert
with check (user_has_org_access(organization_id));
drop policy if exists incidents_update on incidents;
create policy incidents_update on incidents
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists incidents_delete on incidents;
create policy incidents_delete on incidents
for delete
using (user_has_org_access(organization_id));

alter table error_events enable row level security;
drop policy if exists error_events_select on error_events;
create policy error_events_select on error_events
for select
using (user_has_org_access(organization_id));
drop policy if exists error_events_insert on error_events;
create policy error_events_insert on error_events
for insert
with check (user_has_org_access(organization_id));
drop policy if exists error_events_update on error_events;
create policy error_events_update on error_events
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists error_events_delete on error_events;
create policy error_events_delete on error_events
for delete
using (user_has_org_access(organization_id));

-- V3 skeleton modules (0007).
alter table sales_leads enable row level security;
drop policy if exists sales_leads_select on sales_leads;
create policy sales_leads_select on sales_leads
for select
using (user_has_org_access(organization_id));
drop policy if exists sales_leads_insert on sales_leads;
create policy sales_leads_insert on sales_leads
for insert
with check (user_has_org_access(organization_id));
drop policy if exists sales_leads_update on sales_leads;
create policy sales_leads_update on sales_leads
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists sales_leads_delete on sales_leads;
create policy sales_leads_delete on sales_leads
for delete
using (user_has_org_access(organization_id));

alter table marketing_campaigns enable row level security;
drop policy if exists marketing_campaigns_select on marketing_campaigns;
create policy marketing_campaigns_select on marketing_campaigns
for select
using (user_has_org_access(organization_id));
drop policy if exists marketing_campaigns_insert on marketing_campaigns;
create policy marketing_campaigns_insert on marketing_campaigns
for insert
with check (user_has_org_access(organization_id));
drop policy if exists marketing_campaigns_update on marketing_campaigns;
create policy marketing_campaigns_update on marketing_campaigns
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists marketing_campaigns_delete on marketing_campaigns;
create policy marketing_campaigns_delete on marketing_campaigns
for delete
using (user_has_org_access(organization_id));

alter table partner_referrals enable row level security;
drop policy if exists partner_referrals_select on partner_referrals;
create policy partner_referrals_select on partner_referrals
for select
using (user_has_org_access(organization_id));
drop policy if exists partner_referrals_insert on partner_referrals;
create policy partner_referrals_insert on partner_referrals
for insert
with check (user_has_org_access(organization_id));
drop policy if exists partner_referrals_update on partner_referrals;
create policy partner_referrals_update on partner_referrals
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists partner_referrals_delete on partner_referrals;
create policy partner_referrals_delete on partner_referrals
for delete
using (user_has_org_access(organization_id));

alter table media_assets enable row level security;
drop policy if exists media_assets_select on media_assets;
create policy media_assets_select on media_assets
for select
using (user_has_org_access(organization_id));
drop policy if exists media_assets_insert on media_assets;
create policy media_assets_insert on media_assets
for insert
with check (user_has_org_access(organization_id));
drop policy if exists media_assets_update on media_assets;
create policy media_assets_update on media_assets
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists media_assets_delete on media_assets;
create policy media_assets_delete on media_assets
for delete
using (user_has_org_access(organization_id));

alter table decision_scores enable row level security;
drop policy if exists decision_scores_select on decision_scores;
create policy decision_scores_select on decision_scores
for select
using (user_has_org_access(organization_id));
drop policy if exists decision_scores_insert on decision_scores;
create policy decision_scores_insert on decision_scores
for insert
with check (user_has_org_access(organization_id));
drop policy if exists decision_scores_update on decision_scores;
create policy decision_scores_update on decision_scores
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists decision_scores_delete on decision_scores;
create policy decision_scores_delete on decision_scores
for delete
using (user_has_org_access(organization_id));

alter table merchandising_insights enable row level security;
drop policy if exists merchandising_insights_select on merchandising_insights;
create policy merchandising_insights_select on merchandising_insights
for select
using (user_has_org_access(organization_id));
drop policy if exists merchandising_insights_insert on merchandising_insights;
create policy merchandising_insights_insert on merchandising_insights
for insert
with check (user_has_org_access(organization_id));
drop policy if exists merchandising_insights_update on merchandising_insights;
create policy merchandising_insights_update on merchandising_insights
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists merchandising_insights_delete on merchandising_insights;
create policy merchandising_insights_delete on merchandising_insights
for delete
using (user_has_org_access(organization_id));

-- H4 / H5 (0008 / 0009).
alter table decision_recommendations enable row level security;
drop policy if exists decision_recommendations_select on decision_recommendations;
create policy decision_recommendations_select on decision_recommendations
for select
using (user_has_org_access(organization_id));
drop policy if exists decision_recommendations_insert on decision_recommendations;
create policy decision_recommendations_insert on decision_recommendations
for insert
with check (user_has_org_access(organization_id));
drop policy if exists decision_recommendations_update on decision_recommendations;
create policy decision_recommendations_update on decision_recommendations
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists decision_recommendations_delete on decision_recommendations;
create policy decision_recommendations_delete on decision_recommendations
for delete
using (user_has_org_access(organization_id));

alter table cx_retention_runs enable row level security;
drop policy if exists cx_retention_runs_select on cx_retention_runs;
create policy cx_retention_runs_select on cx_retention_runs
for select
using (user_has_org_access(organization_id));
drop policy if exists cx_retention_runs_insert on cx_retention_runs;
create policy cx_retention_runs_insert on cx_retention_runs
for insert
with check (user_has_org_access(organization_id));
drop policy if exists cx_retention_runs_update on cx_retention_runs;
create policy cx_retention_runs_update on cx_retention_runs
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists cx_retention_runs_delete on cx_retention_runs;
create policy cx_retention_runs_delete on cx_retention_runs
for delete
using (user_has_org_access(organization_id));

alter table cx_upsell_opportunities enable row level security;
drop policy if exists cx_upsell_opportunities_select on cx_upsell_opportunities;
create policy cx_upsell_opportunities_select on cx_upsell_opportunities
for select
using (user_has_org_access(organization_id));
drop policy if exists cx_upsell_opportunities_insert on cx_upsell_opportunities;
create policy cx_upsell_opportunities_insert on cx_upsell_opportunities
for insert
with check (user_has_org_access(organization_id));
drop policy if exists cx_upsell_opportunities_update on cx_upsell_opportunities;
create policy cx_upsell_opportunities_update on cx_upsell_opportunities
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists cx_upsell_opportunities_delete on cx_upsell_opportunities;
create policy cx_upsell_opportunities_delete on cx_upsell_opportunities
for delete
using (user_has_org_access(organization_id));

-- Core hierarchy (0004): was SELECT-only; add tenant-scoped writes so RLS does not block normal CRUD.
drop policy if exists workspaces_insert on workspaces;
create policy workspaces_insert on workspaces
for insert
with check (user_has_org_access(organization_id));
drop policy if exists workspaces_update on workspaces;
create policy workspaces_update on workspaces
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists workspaces_delete on workspaces;
create policy workspaces_delete on workspaces
for delete
using (user_has_org_access(organization_id));

drop policy if exists projects_insert on projects;
create policy projects_insert on projects
for insert
with check (user_has_org_access(organization_id));
drop policy if exists projects_update on projects;
create policy projects_update on projects
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists projects_delete on projects;
create policy projects_delete on projects
for delete
using (user_has_org_access(organization_id));

drop policy if exists sites_insert on sites;
create policy sites_insert on sites
for insert
with check (user_has_org_access(organization_id));
drop policy if exists sites_update on sites;
create policy sites_update on sites
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists sites_delete on sites;
create policy sites_delete on sites
for delete
using (user_has_org_access(organization_id));

drop policy if exists environments_insert on environments;
create policy environments_insert on environments
for insert
with check (user_has_org_access(organization_id));
drop policy if exists environments_update on environments;
create policy environments_update on environments
for update
using (user_has_org_access(organization_id))
with check (user_has_org_access(organization_id));
drop policy if exists environments_delete on environments;
create policy environments_delete on environments
for delete
using (user_has_org_access(organization_id));

-- organizations: no INSERT for authenticated (bootstrap via service_role / controlled jobs); avoid chicken-and-egg on new org id.
drop policy if exists organizations_update on organizations;
create policy organizations_update on organizations
for update
using (user_has_org_access(id))
with check (user_has_org_access(id));
drop policy if exists organizations_delete on organizations;
create policy organizations_delete on organizations
for delete
using (user_has_org_access(id));

comment on table clerk_organization_mappings is
  'Maps Clerk organization id (text) to SoR organizations.id; ADR 006. Mutations expected via service role / controlled jobs.';

comment on function current_clerk_org_id_from_jwt() is
  'Reads org claim from JWT for Clerk/Supabase; keep in sync with IdP JWT template.';
