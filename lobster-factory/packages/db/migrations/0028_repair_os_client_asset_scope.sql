-- lobster-factory/packages/db/migrations/0028_repair_os_client_asset_scope.sql
-- Repair OS product foundation:
-- Client -> Asset -> Integration -> Incident -> Repair -> Evidence.
--
-- This migration is intentionally additive and backward-compatible. It keeps
-- the existing ops-inbox intake engine working while giving Repair Center a
-- durable product model for multi-client, multi-asset maintenance.

create extension if not exists pgcrypto;

-- 1) Generic maintainable assets.
-- Sites/environments still model WordPress builds. This table models anything
-- Repair OS can monitor or repair: app, API, server, DB, workflow, repo, etc.
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  slug text not null,
  name text not null,
  asset_type text not null
    check (asset_type in (
      'website',
      'web_app',
      'api',
      'wordpress',
      'server',
      'database',
      'workflow',
      'job_runner',
      'repository',
      'external_service',
      'other'
    )),
  environment text not null default 'production'
    check (environment in ('development', 'staging', 'production', 'shared')),
  primary_url text,
  provider text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'maintenance', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists assets_org_idx on public.assets(organization_id);
create index if not exists assets_org_type_idx on public.assets(organization_id, asset_type);
create index if not exists assets_status_idx on public.assets(status);

create or replace function public.assets_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists assets_touch_updated on public.assets;
create trigger assets_touch_updated
before update on public.assets
for each row execute function public.assets_touch_updated_at();

alter table public.assets enable row level security;

comment on table public.assets is
  'Repair OS maintainable assets. One organization can own websites, apps, APIs, servers, workflows, repositories, and databases.';

-- 2) Ensure the integration registry exists even if an older environment missed
-- migration 0024. Keep the old unique (organization_id, provider) behavior for
-- compatibility; asset-level fanout can be introduced after APIs are upgraded.
create table if not exists public.tenant_integration_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  provider text not null,
  secret_ref text,
  external_hint text,
  api_metadata jsonb not null default '{}'::jsonb,
  provisioning_source text not null default 'manual'
    check (provisioning_source in ('manual', 'n8n', 'trigger', 'build_console', 'cli')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'failed', 'revoked')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

alter table public.tenant_integration_bindings
  add column if not exists asset_id uuid references public.assets(id) on delete set null,
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_seen_at timestamptz;

create index if not exists tenant_integration_bindings_org_idx
  on public.tenant_integration_bindings(organization_id);
create index if not exists tenant_integration_bindings_asset_idx
  on public.tenant_integration_bindings(asset_id)
  where asset_id is not null;
create index if not exists tenant_integration_bindings_status_idx
  on public.tenant_integration_bindings(status);

alter table public.tenant_integration_bindings enable row level security;

comment on table public.tenant_integration_bindings is
  'Per-client integration slots. Store secret references only; never raw tokens. asset_id is nullable while legacy provider-level integrations are migrated.';

-- 3) Client/asset scope for incident intake.
-- Keep client_slug as a bridge for current UI/API code, but add durable FKs for
-- future tenant isolation and product-grade filtering.
alter table public.ops_incidents
  add column if not exists client_slug text,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists asset_id uuid references public.assets(id) on delete set null;

create index if not exists ops_incidents_client_slug_idx
  on public.ops_incidents(client_slug)
  where client_slug is not null;
create index if not exists ops_incidents_org_last_seen_idx
  on public.ops_incidents(organization_id, last_seen_at desc)
  where organization_id is not null;
create index if not exists ops_incidents_asset_last_seen_idx
  on public.ops_incidents(asset_id, last_seen_at desc)
  where asset_id is not null;
create index if not exists ops_incidents_org_status_idx
  on public.ops_incidents(organization_id, status)
  where organization_id is not null;

-- 4) Client/asset scope for repair workflows. These values are denormalized
-- for fast Repair Center filtering but remain subordinate to incident_id.
alter table public.repair_runs
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists asset_id uuid references public.assets(id) on delete set null;

create index if not exists repair_runs_org_created_idx
  on public.repair_runs(organization_id, created_at desc)
  where organization_id is not null;
create index if not exists repair_runs_asset_created_idx
  on public.repair_runs(asset_id, created_at desc)
  where asset_id is not null;

-- 5) Seed AwareWave as a first-class internal client/platform tenant.
insert into public.organizations (slug, name, type, status, metadata)
values (
  'awarewave-ops',
  'AwareWave Ops',
  'client',
  'active',
  jsonb_build_object(
    'client_kind',
    'internal',
    'relationship',
    'first_party',
    'client_config',
    jsonb_build_object(
      'platform', 'saas',
      'hosting_type', 'hetzner',
      'site_url', 'https://app.aware-wave.com',
      'notes', 'Platform itself; dogfoods Repair OS as an internal client.'
    )
  )
)
on conflict (slug) do update
set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  metadata = public.organizations.metadata || excluded.metadata,
  updated_at = now();

-- 6) Seed core AwareWave platform assets.
with org as (
  select id from public.organizations where slug = 'awarewave-ops'
), rows as (
  select * from (values
    ('app-aware-wave', 'AwareWave App', 'web_app', 'production', 'https://app.aware-wave.com', 'hetzner'),
    ('api-aware-wave', 'AwareWave API', 'api', 'production', 'https://api.aware-wave.com', 'hetzner'),
    ('n8n-aware-wave', 'AwareWave n8n', 'workflow', 'production', 'https://n8n.aware-wave.com', 'hetzner'),
    ('trigger-aware-wave', 'AwareWave Trigger.dev', 'job_runner', 'production', 'https://trigger.aware-wave.com', 'hetzner'),
    ('supabase-aware-wave', 'AwareWave Supabase', 'database', 'production', 'https://supabase.aware-wave.com', 'hetzner'),
    ('sg-server', 'SG Production Server', 'server', 'production', null, 'hetzner'),
    ('eu-server', 'EU Backup Server', 'server', 'production', null, 'hetzner')
  ) as r(slug, name, asset_type, environment, primary_url, provider)
)
insert into public.assets (organization_id, slug, name, asset_type, environment, primary_url, provider, metadata)
select
  org.id,
  rows.slug,
  rows.name,
  rows.asset_type,
  rows.environment,
  rows.primary_url,
  rows.provider,
  jsonb_build_object('seeded_by', '0028_repair_os_client_asset_scope')
from org cross join rows
on conflict (organization_id, slug) do update
set
  name = excluded.name,
  asset_type = excluded.asset_type,
  environment = excluded.environment,
  primary_url = excluded.primary_url,
  provider = excluded.provider,
  status = 'active',
  metadata = public.assets.metadata || excluded.metadata,
  updated_at = now();

-- 7) Backfill current platform incidents/repairs. This is deliberately
-- conservative: only unscoped rows are assigned to awarewave-ops.
with org as (
  select id from public.organizations where slug = 'awarewave-ops'
)
update public.ops_incidents i
set
  organization_id = org.id,
  client_slug = coalesce(i.client_slug, 'awarewave-ops')
from org
where i.organization_id is null;

with org as (
  select id from public.organizations where slug = 'awarewave-ops'
)
update public.repair_runs r
set
  organization_id = org.id,
  client_slug = coalesce(r.client_slug, 'awarewave-ops')
from org
where r.organization_id is null;

-- 8) Best-effort asset backfill by source/service. Future webhook routes should
-- write asset_id directly.
with app_asset as (
  select a.id, a.organization_id
  from public.assets a
  join public.organizations o on o.id = a.organization_id
  where o.slug = 'awarewave-ops' and a.slug = 'app-aware-wave'
), server_asset as (
  select a.id, a.organization_id
  from public.assets a
  join public.organizations o on o.id = a.organization_id
  where o.slug = 'awarewave-ops' and a.slug = 'sg-server'
)
update public.ops_incidents i
set asset_id = case
  when i.source = 'netdata' then (select id from server_asset)
  else (select id from app_asset)
end
where i.organization_id = (select organization_id from app_asset)
  and i.asset_id is null;

update public.repair_runs r
set asset_id = i.asset_id
from public.ops_incidents i
where r.incident_id = i.id
  and r.asset_id is null
  and i.asset_id is not null;

-- 9) Keep PostgREST environments honest after new tables/columns.
notify pgrst, 'reload schema';
