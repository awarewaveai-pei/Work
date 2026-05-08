-- 0025_always_on_command_plane.sql
-- Always-On Command Plane: ingress layer + kill switch + idempotency.
-- Owner doc: agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md
-- Design rule: do NOT rebuild existing tables (workflow_runs / approvals /
-- error_events / ops_audit_events). Only add the missing ingress layer and
-- the global kill switch. Idempotency uses native PostgreSQL unique constraints.
-- Idempotent.

-- 1) command_requests: every external trigger lands here BEFORE workflow_runs.
create table if not exists public.command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  source text not null
    check (source in ('telegram', 'slack', 'email', 'webhook', 'schedule', 'internal', 'github')),
  source_event_id text not null,
  actor_type text not null
    check (actor_type in ('human', 'agent', 'system')),
  actor_ref text,
  command text not null,
  args jsonb not null default '{}'::jsonb,
  risk_level text not null
    check (risk_level in ('low', 'medium', 'high', 'critical')),
  status text not null default 'received'
    check (status in (
      'received', 'validated', 'rejected', 'queued', 'dispatched',
      'completed', 'failed', 'blocked_by_killswitch', 'blocked_by_policy'
    )),
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  rejection_reason text,
  result jsonb not null default '{}'::jsonb,
  trace_id text not null default gen_random_uuid()::text,
  received_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  -- Idempotency: same external event can never produce two requests.
  unique (source, source_event_id)
);

create index if not exists command_requests_org_received_idx
  on public.command_requests(organization_id, received_at desc);
create index if not exists command_requests_actor_idx
  on public.command_requests(actor_type, actor_ref);
create index if not exists command_requests_trace_idx
  on public.command_requests(trace_id);
create index if not exists command_requests_status_idx
  on public.command_requests(status) where status in ('received', 'queued', 'dispatched');

alter table public.command_requests enable row level security;
-- Service role bypasses RLS; client roles cannot read this table directly.
-- Pattern matches public.tenant_integration_bindings (0024).

comment on table public.command_requests is
  'Standardised ingress for Telegram/Slack/Webhook/Schedule commands. Created BEFORE workflow_runs; FK-linked to workflow_runs.command_request_id once dispatched. See COMMAND_PLANE_RUNBOOK.md.';

-- 2) system_modes: kill switch (one active mode per scope).
create table if not exists public.system_modes (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'agency', 'client')),
  scope_id uuid,
  mode text not null check (mode in ('normal', 'maintenance', 'read_only', 'emergency_stop')),
  reason text,
  set_by uuid references public.profiles(id) on delete set null,
  set_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

-- Unique active mode per scope: scope_id is null for global; otherwise distinct per scope_id.
create unique index if not exists system_modes_global_uniq
  on public.system_modes(scope_type) where scope_id is null;
create unique index if not exists system_modes_scoped_uniq
  on public.system_modes(scope_type, scope_id) where scope_id is not null;
create index if not exists system_modes_scope_idx on public.system_modes(scope_type, scope_id);

alter table public.system_modes enable row level security;

comment on table public.system_modes is
  'Global / agency / client scoped kill switch. Read by command-plane ingress; modifications must go through ops console SSO (never Telegram). See COMMAND_PLANE_RUNBOOK.md §Hard Blocks.';

-- Seed the global "normal" row only if no global mode exists.
insert into public.system_modes (scope_type, scope_id, mode, reason, set_at, metadata)
select 'global', null, 'normal', 'initial seed (migration 0025)', now(), '{}'::jsonb
where not exists (
  select 1 from public.system_modes where scope_type = 'global' and scope_id is null
);

-- 3) Extend workflow_runs (backwards-compatible: all new columns are nullable).
alter table public.workflow_runs
  add column if not exists command_request_id uuid references public.command_requests(id) on delete set null,
  add column if not exists idempotency_key text;

create unique index if not exists workflow_runs_idempotency_key_uniq
  on public.workflow_runs(idempotency_key) where idempotency_key is not null;
create index if not exists workflow_runs_command_request_idx
  on public.workflow_runs(command_request_id) where command_request_id is not null;

comment on column public.workflow_runs.command_request_id is
  'Backref to command_requests when the run was triggered through the command plane. Null for legacy / direct API triggers.';
comment on column public.workflow_runs.idempotency_key is
  'Optional idempotency key. When present, must be globally unique. Pattern: "<source>:<source_event_id>".';

-- 4) DLQ reuses public.error_events (0003). No new table.
-- Convention: source_type in ('command_ingress_failed', 'command_dispatch_failed',
-- 'command_handler_failed', 'telegram_auth_failed'). Replay query:
--   select * from error_events
--    where source_type like 'command_%' and incident_id is null
--    order by occurred_at desc;
