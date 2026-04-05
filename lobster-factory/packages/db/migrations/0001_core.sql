create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('agency', 'client')),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  default_locale text not null default 'en',
  default_timezone text not null default 'UTC',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  workspace_type text not null default 'default',
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists profiles (
  id uuid primary key,
  email text not null unique,
  display_name text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  default_organization_id uuid references organizations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  membership_type text not null default 'member',
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  joined_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, user_id)
);

create table if not exists workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  metadata jsonb not null default '{}'::jsonb,
  unique (workspace_id, user_id)
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  scope_type text not null check (scope_type in ('system', 'organization', 'workspace', 'project', 'site')),
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name, scope_type)
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null,
  action text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  description text,
  unique (resource_type, action)
);

create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  constraints jsonb not null default '{}'::jsonb,
  primary key (role_id, permission_id)
);

create table if not exists user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  granted_by uuid references profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  client_organization_id uuid references organizations(id) on delete set null,
  name text not null,
  project_type text not null default 'wordpress',
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  owner_user_id uuid references profiles(id) on delete set null,
  start_date date,
  target_launch_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  site_type text not null default 'woocommerce',
  name text not null,
  primary_domain text,
  locale text not null default 'en',
  status text not null default 'draft' check (status in ('draft', 'staging', 'live', 'paused', 'archived')),
  theme_family text not null default 'kadence',
  stack_profile text not null default 'wc-core',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists environments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  environment_type text not null check (environment_type in ('local', 'staging', 'production', 'preview')),
  name text not null,
  base_url text,
  hosting_provider text,
  server_ref text,
  status text not null default 'pending' check (status in ('pending', 'provisioning', 'ready', 'failed', 'archived')),
  wp_root_path text,
  credentials_ref text,
  last_health_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspaces_org_id on workspaces(organization_id);
create index if not exists idx_org_memberships_org_id on organization_memberships(organization_id);
create index if not exists idx_org_memberships_user_id on organization_memberships(user_id);
create index if not exists idx_workspace_memberships_workspace_id on workspace_memberships(workspace_id);
create index if not exists idx_user_role_assignments_user_id on user_role_assignments(user_id);
create index if not exists idx_projects_org_ws on projects(organization_id, workspace_id);
create index if not exists idx_sites_org_ws on sites(organization_id, workspace_id);
create index if not exists idx_environments_site_id on environments(site_id);

