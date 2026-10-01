-- Build Console execution layer tables.
-- Required for one-click deployment (Profile A / B / C) to move beyond plan_only.
-- Safe to run multiple times (idempotent CREATE IF NOT EXISTS + ALTER IF NOT EXISTS).
--
-- 2026-10-01 corrected in place (never applied to production: the original could not apply --
-- `where expires_at > now()` in an index predicate is rejected, now() is not IMMUTABLE; ledger is
-- keyed by filename so production records this version). Also: own BEGIN/COMMIT (runner requires
-- it); access = service_role only, matching 0092/0093 -- the original `using (true)` policies named
-- no role and public's default ACL grants anon/authenticated all privileges, i.e. anon-key REST
-- read/write. All writers use the service role (adopt-client-os.ts, wp-install-plugins.ts).
-- Rollback (drops data written since): drop the 7 tables, `alter table public.sites drop column
-- apply_mode`, delete this file's public.schema_migrations row, `notify pgrst, 'reload schema'`.

begin;
set local lock_timeout = '5s';  -- ALTER sites + 3 FKs: fail fast instead of queueing reads behind a held lock

-- ─────────────────────────────────────────────
-- 1. sites: add deployment classification columns
-- ─────────────────────────────────────────────
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sites' and column_name = 'site_type'
  ) then
    alter table public.sites add column site_type text
      check (site_type in ('new_client', 'existing_wp', 'ao_internal'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sites' and column_name = 'apply_mode'
  ) then
    alter table public.sites add column apply_mode text
      check (apply_mode in ('full_install', 'adopt_delta', 'internal_setup'));
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 2. operator_tasks — manual fallback / conflict resolution
-- ─────────────────────────────────────────────
create table if not exists public.operator_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid references public.sites(id) on delete set null,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  task_type       text not null,           -- 'provider_manual_provision' | 'plugin_conflict' | 'update_required' | ...
  status          text not null default 'pending'
                    check (status in ('pending', 'in_progress', 'resolved', 'cancelled')),
  title           text not null,
  description     text,
  instructions    text,                    -- step-by-step for the human operator
  input_required  jsonb default '{}',      -- fields the operator must fill in
  resolution      jsonb,                   -- what the operator entered
  resolved_by     uuid,                    -- actor who resolved
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index if not exists operator_tasks_org_idx     on public.operator_tasks(organization_id);
create index if not exists operator_tasks_site_idx    on public.operator_tasks(site_id);
create index if not exists operator_tasks_status_idx  on public.operator_tasks(status);
create index if not exists operator_tasks_run_idx     on public.operator_tasks(workflow_run_id);

-- ─────────────────────────────────────────────
-- 3. smoke_test_results — per-run smoke test outcomes
-- ─────────────────────────────────────────────
create table if not exists public.smoke_test_results (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid not null references public.sites(id) on delete cascade,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  smoke_profile   text not null check (smoke_profile in ('internal', 'basic', 'business', 'woocommerce', 'adopt')),
  overall_status  text not null check (overall_status in ('pass', 'fail', 'partial')),
  checks          jsonb not null default '[]',  -- [{check_id, required, status, detail}]
  failed_required int  not null default 0,
  advisory_count  int  not null default 0,
  duration_ms     int,
  triggered_rollback boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists smoke_test_results_org_idx  on public.smoke_test_results(organization_id);
create index if not exists smoke_test_results_site_idx on public.smoke_test_results(site_id);
create index if not exists smoke_test_results_run_idx  on public.smoke_test_results(workflow_run_id);

-- ─────────────────────────────────────────────
-- 4. adopt_audits — Profile C pre-adoption audit header
-- ─────────────────────────────────────────────
create table if not exists public.adopt_audits (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid not null references public.sites(id) on delete cascade,
  workflow_run_id    uuid references public.workflow_runs(id) on delete set null,
  wp_version         text,
  php_version        text,
  active_theme       text,
  smtp_configured    boolean,
  existing_plugins   jsonb not null default '[]',  -- raw plugin list from WP API
  content_snapshot   jsonb default '{}',            -- {posts, pages, products, ...}
  status             text not null default 'pending'
                       check (status in ('pending', 'complete', 'failed')),
  created_at         timestamptz not null default now(),
  completed_at       timestamptz
);

create index if not exists adopt_audits_org_idx  on public.adopt_audits(organization_id);
create index if not exists adopt_audits_site_idx on public.adopt_audits(site_id);

-- ─────────────────────────────────────────────
-- 5. adopt_audit_items — per-plugin delta classification
-- ─────────────────────────────────────────────
create table if not exists public.adopt_audit_items (
  id              uuid primary key default gen_random_uuid(),
  adopt_audit_id  uuid not null references public.adopt_audits(id) on delete cascade,
  plugin_slug     text not null,
  manifest_slug   text not null,          -- which package manifest requested this plugin
  existing_version text,                  -- null if not installed
  required_version text,
  classification  text not null
                    check (classification in ('safe_to_install', 'skip_install', 'update_required', 'conflict')),
  notes           text,
  resolved        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists adopt_audit_items_audit_idx on public.adopt_audit_items(adopt_audit_id);
create index if not exists adopt_audit_items_class_idx on public.adopt_audit_items(classification);

-- ─────────────────────────────────────────────
-- 6. handoff_reports — structured delivery artifacts
-- ─────────────────────────────────────────────
create table if not exists public.handoff_reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid not null references public.sites(id) on delete cascade,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  profile         text not null check (profile in ('profile_a', 'profile_b', 'profile_c')),
  status          text not null default 'draft'
                    check (status in ('draft', 'complete', 'delivered')),
  report_json     jsonb not null default '{}',
  smoke_summary   jsonb default '{}',
  adopt_summary   jsonb default '{}',     -- Profile C only
  artifacts       jsonb default '[]',     -- [{type, url, created_at}]
  delivered_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists handoff_reports_org_idx  on public.handoff_reports(organization_id);
create index if not exists handoff_reports_site_idx on public.handoff_reports(site_id);
create index if not exists handoff_reports_run_idx  on public.handoff_reports(workflow_run_id);

-- ─────────────────────────────────────────────
-- 7. resource_locks — prevent concurrent high-risk workflows on same site
-- ─────────────────────────────────────────────
create table if not exists public.resource_locks (
  id              uuid primary key default gen_random_uuid(),
  resource_type   text not null,           -- 'site' | 'organization' | ...
  resource_id     uuid not null,
  locked_by       uuid not null,           -- workflow_run_id that holds the lock
  lock_reason     text not null,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

-- One row per resource. An expired lock is taken over in place:
--   insert ... on conflict (resource_type, resource_id) do update set ...
--   where resource_locks.expires_at <= now();   -- 0 rows updated = still held
create unique index if not exists resource_locks_unique_resource
  on public.resource_locks(resource_type, resource_id);

-- ─────────────────────────────────────────────
-- 8. idempotency_keys — prevent duplicate step execution
-- ─────────────────────────────────────────────
create table if not exists public.idempotency_keys (
  key             text primary key,        -- '{workflow}:{site_id}:{step}:{version}'
  workflow_run_id uuid,
  result          jsonb,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '7 days')
);

create index if not exists idempotency_keys_expires_idx on public.idempotency_keys(expires_at);

-- ─────────────────────────────────────────────
-- Access: service_role only (0092/0093 convention). Old policy names dropped so a dev DB that ran
-- the pre-2026-10-01 statements converges too.
-- ─────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['operator_tasks', 'smoke_test_results', 'adopt_audits', 'adopt_audit_items',
                           'handoff_reports', 'resource_locks', 'idempotency_keys'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_isolation', t);
    execute format('drop policy if exists %I on public.%I', t || '_isolation', t);
    execute format('drop policy if exists %I on public.%I', t || '_service_only', t);
    execute format('drop policy if exists "service_role only" on public.%I', t);
    execute format('create policy "service_role only" on public.%I to service_role using (true) with check (true)', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- PostgREST does not reload its schema cache on DDL here (PGRST204, WORKLOG 2026-09-18 續29).
notify pgrst, 'reload schema';

commit;
