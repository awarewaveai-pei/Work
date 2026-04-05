create or replace function current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid()::uuid
$$;

create or replace function user_has_org_access(org_id uuid)
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
  )
$$;

create or replace function user_has_workspace_access(ws_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from workspace_memberships wm
    where wm.workspace_id = ws_id
      and wm.user_id = auth.uid()::uuid
      and wm.status = 'active'
  )
$$;

alter table organizations enable row level security;
alter table workspaces enable row level security;
alter table projects enable row level security;
alter table sites enable row level security;
alter table environments enable row level security;

create policy organizations_select on organizations
for select
using (
  user_has_org_access(id)
);

create policy workspaces_select on workspaces
for select
using (
  user_has_org_access(organization_id)
);

create policy projects_select on projects
for select
using (
  user_has_org_access(organization_id)
);

create policy sites_select on sites
for select
using (
  user_has_org_access(organization_id)
);

create policy environments_select on environments
for select
using (
  user_has_org_access(organization_id)
);

