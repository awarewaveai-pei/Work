-- V3 skeleton modules baseline tables
-- Scope: Sales / Marketing / Partner / Media / Decision Engine / Merchandising

create table if not exists sales_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source text not null,
  status text not null default 'new',
  score int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  channel text not null,
  status text not null default 'draft',
  budget numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists partner_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  partner_name text not null,
  referred_entity text,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  asset_type text not null,
  storage_key text not null,
  status text not null default 'ready',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists decision_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  score_type text not null,
  score_value int not null check (score_value between 0 and 100),
  context jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);

create table if not exists merchandising_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  insight_type text not null,
  priority text not null default 'medium',
  recommendation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_leads_org_ws on sales_leads(organization_id, workspace_id);
create index if not exists idx_marketing_campaigns_org_ws on marketing_campaigns(organization_id, workspace_id);
create index if not exists idx_partner_referrals_org_ws on partner_referrals(organization_id, workspace_id);
create index if not exists idx_media_assets_org_ws on media_assets(organization_id, workspace_id);
create index if not exists idx_decision_scores_org_ws on decision_scores(organization_id, workspace_id);
create index if not exists idx_merchandising_insights_org_ws on merchandising_insights(organization_id, workspace_id);
