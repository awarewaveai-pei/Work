create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'agency', 'client')),
  scope_id uuid,
  name text not null,
  slug text not null,
  package_type text not null default 'wordpress',
  description text,
  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),
  default_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id, slug)
);

create table if not exists package_versions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  version text not null,
  changelog text,
  compatibility jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),
  artifact_ref text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique (package_id, version)
);

create table if not exists manifests (
  id uuid primary key default gen_random_uuid(),
  package_version_id uuid not null references package_versions(id) on delete cascade,
  schema_version text not null,
  manifest_json jsonb not null,
  install_guardrails jsonb not null default '{}'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  rollback_hints jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('draft', 'active', 'deprecated', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'agency', 'client')),
  scope_id uuid,
  name text not null,
  slug text not null,
  domain text not null,
  orchestrator_type text not null check (orchestrator_type in ('n8n', 'durable', 'github_actions', 'mcp', 'manual')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  status text not null default 'active',
  default_version text not null,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  approval_policy_id uuid,
  rollback_strategy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id, slug)
);

create table if not exists workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  version text not null,
  definition_ref text not null,
  routing_config jsonb not null default '{}'::jsonb,
  trigger_config jsonb not null default '{}'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (workflow_id, version)
);

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_version_id uuid not null references workflow_versions(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  environment_id uuid references environments(id) on delete cascade,
  parent_run_id uuid references workflow_runs(id) on delete set null,
  trigger_type text not null,
  trigger_ref text,
  actor_type text not null check (actor_type in ('human', 'agent', 'webhook', 'schedule', 'system')),
  actor_ref text,
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'blocked', 'cancelled')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  artifacts jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  cost_amount numeric,
  cost_currency text,
  decision_id uuid,
  incident_id uuid,
  approval_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists package_install_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  environment_id uuid not null references environments(id) on delete cascade,
  package_version_id uuid not null references package_versions(id) on delete cascade,
  manifest_id uuid not null references manifests(id) on delete cascade,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  triggered_by_user_id uuid references profiles(id) on delete set null,
  triggered_by_agent_id uuid,
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'rolled_back')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  result_summary jsonb not null default '{}'::jsonb,
  logs_ref text,
  rollback_run_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_workflow_runs_org on workflow_runs(organization_id);
create index if not exists idx_workflow_runs_site on workflow_runs(site_id);
create index if not exists idx_pkg_install_runs_site on package_install_runs(site_id);

