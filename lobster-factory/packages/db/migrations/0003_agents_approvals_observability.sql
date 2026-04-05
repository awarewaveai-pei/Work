create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'agency', 'client')),
  scope_id uuid,
  name text not null,
  slug text not null,
  policy_domain text not null,
  status text not null default 'active',
  default_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id, slug)
);

create table if not exists policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references policies(id) on delete cascade,
  version text not null,
  rules jsonb not null default '{}'::jsonb,
  risk_matrix jsonb not null default '{}'::jsonb,
  enforcement_mode text not null check (enforcement_mode in ('advisory', 'soft_block', 'hard_block')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (policy_id, version)
);

create table if not exists approval_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  scope_type text not null check (scope_type in ('global', 'agency', 'client')),
  scope_id uuid,
  resource_type text not null,
  rules jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  approval_policy_id uuid not null references approval_policies(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  requested_by uuid references profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists approval_steps (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references approvals(id) on delete cascade,
  step_order integer not null,
  approver_user_id uuid references profiles(id) on delete set null,
  approver_role_id uuid references roles(id) on delete set null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'skipped')),
  acted_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'agency', 'client')),
  scope_id uuid,
  name text not null,
  slug text not null,
  agent_domain text not null,
  agent_type text not null,
  status text not null default 'active',
  default_version text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id, slug)
);

create table if not exists tool_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  allowed_tools jsonb not null default '[]'::jsonb,
  denied_tools jsonb not null default '[]'::jsonb,
  max_steps integer,
  max_cost numeric,
  requires_approval_for jsonb not null default '[]'::jsonb,
  environment_constraints jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  version text not null,
  system_prompt_ref uuid,
  tool_policy_id uuid references tool_policies(id) on delete set null,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  model_config jsonb not null default '{}'::jsonb,
  safety_config jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (agent_id, version)
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_version_id uuid not null references agent_versions(id) on delete cascade,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  environment_id uuid references environments(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'blocked')),
  goal text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  tool_trace jsonb not null default '[]'::jsonb,
  evaluation_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  cost_amount numeric,
  cost_breakdown jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  environment_id uuid references environments(id) on delete cascade,
  domain text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null check (status in ('open', 'investigating', 'mitigated', 'resolved')),
  title text not null,
  summary text not null,
  root_cause_summary text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  sentry_issue_ref text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists error_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references incidents(id) on delete set null,
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  environment_id uuid references environments(id) on delete cascade,
  source_type text not null,
  source_ref text,
  error_code text,
  error_message text not null,
  trace_ref text,
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

