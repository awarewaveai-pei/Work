create table if not exists ops_action_catalog (
  id uuid primary key default gen_random_uuid(),
  action_key text not null unique,
  display_name text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  environment_scope text not null check (environment_scope in ('staging_only', 'staging_and_production')),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ops_action_runs (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references ops_action_catalog(id) on delete restrict,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  site_id uuid references sites(id) on delete set null,
  environment_id uuid references environments(id) on delete set null,
  actor_user_id uuid references profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('owner', 'admin', 'operator', 'viewer')),
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'blocked', 'cancelled')),
  approval_required boolean not null default false,
  approval_status text not null default 'none' check (approval_status in ('none', 'pending', 'approved', 'rejected')),
  trace_id text not null,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_summary text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  site_id uuid references sites(id) on delete set null,
  storage_backend text not null check (storage_backend in ('r2', 'wp_uploads')),
  asset_domain text not null check (asset_domain in ('ai_generated', 'wp_product', 'wp_blog')),
  object_key text not null,
  object_url text,
  mime_type text,
  byte_size bigint,
  checksum_sha256 text,
  source_run_id uuid references ops_action_runs(id) on delete set null,
  version int not null default 1,
  is_current boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists ai_image_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  site_id uuid references sites(id) on delete set null,
  prompt text not null,
  model_name text not null,
  provider text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  output_asset_id uuid references media_assets(id) on delete set null,
  trace_id text not null,
  error_summary text,
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists ops_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  actor_user_id uuid references profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('owner', 'admin', 'operator', 'viewer')),
  event_type text not null,
  target_type text not null,
  target_id text,
  trace_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_media_assets_org_backend_key_version
  on media_assets(organization_id, storage_backend, object_key, version);

create index if not exists idx_ops_action_runs_org_status on ops_action_runs(organization_id, status);
create index if not exists idx_ops_action_runs_trace_id on ops_action_runs(trace_id);
create index if not exists idx_media_assets_org_domain on media_assets(organization_id, asset_domain);
create index if not exists idx_ai_image_jobs_org_status on ai_image_jobs(organization_id, status);
create index if not exists idx_ai_image_jobs_trace_id on ai_image_jobs(trace_id);
create index if not exists idx_ops_audit_events_org_created on ops_audit_events(organization_id, created_at desc);
