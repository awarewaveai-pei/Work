-- Tenant tool bindings: single SoR for per-customer GitHub / n8n / Trigger / Supabase / Sentry / etc.
-- Secrets: store vault pointers only in secret_ref — never raw tokens in api_metadata (enforce in app).
-- Idempotent. BEGIN/COMMIT added 2026-10-01 (runner requires it; production had the table and
-- org index from an earlier path but not ws_idx, so this file never reached the ledger).

begin;
set local lock_timeout = '5s';

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

create index if not exists tenant_integration_bindings_org_idx
  on public.tenant_integration_bindings(organization_id);
create index if not exists tenant_integration_bindings_ws_idx
  on public.tenant_integration_bindings(workspace_id);

alter table public.tenant_integration_bindings enable row level security;

comment on table public.tenant_integration_bindings is
  'Per-tenant integration slots (GitHub, Sentry, …). Orchestrators (n8n/Trigger) POST via /api/webhooks/tenant-integration; secret_ref points to vault; api_metadata holds non-secret ids/urls.';

commit;
