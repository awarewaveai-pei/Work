-- H5: CX retention / upsell workflow baseline

create table if not exists cx_retention_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  trigger_type text not null,
  health_score int check (health_score between 0 and 100),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  action_plan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cx_upsell_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  source_type text not null check (source_type in ('ticket', 'health_score', 'manual')),
  score int not null default 0 check (score between 0 and 100),
  status text not null default 'open' check (status in ('open', 'qualified', 'proposal_sent', 'won', 'lost')),
  recommendation jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cx_retention_runs_org_ws on cx_retention_runs(organization_id, workspace_id);
create index if not exists idx_cx_upsell_opportunities_org_ws on cx_upsell_opportunities(organization_id, workspace_id);
