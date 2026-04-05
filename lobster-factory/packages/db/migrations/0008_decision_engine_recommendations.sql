-- H4: Decision Engine baseline (recommendations)

create table if not exists decision_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recommendation_type text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed', 'implemented')),
  reason jsonb not null default '{}'::jsonb,
  related_score_id uuid references decision_scores(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_decision_recommendations_org_ws
  on decision_recommendations(organization_id, workspace_id);

create index if not exists idx_decision_recommendations_status
  on decision_recommendations(status, priority);
