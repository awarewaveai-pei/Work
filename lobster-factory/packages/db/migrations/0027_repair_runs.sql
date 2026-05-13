-- lobster-factory/packages/db/migrations/0027_repair_runs.sql
-- Repair Center orchestration state.
-- Ops Inbox remains the curated incident source of truth; this table only tracks
-- repair lifecycle, backup gate, GitHub handoff, and manual deploy evidence.

create extension if not exists pgcrypto;

create table if not exists repair_runs (
  id uuid primary key default gen_random_uuid(),

  incident_id uuid not null references ops_incidents(id) on delete cascade,
  source text not null
    check (source in ('sentry','uptime_kuma','grafana','netdata','posthog','manual')),
  client_slug text,

  policy text not null default 'triage_needed'
    check (policy in ('auto_repair','analysis_only','human_only','triage_needed')),
  state text not null default 'detected'
    check (state in (
      'detected',
      'triage_needed',
      'approved',
      'backing_up',
      'repairing',
      'pr_ready',
      'deploy_pending',
      'deploying',
      'rolled_back',
      'resolved',
      'human_only'
    )),

  approved_by text,
  approved_at timestamptz,

  backup_status text not null default 'not_started'
    check (backup_status in ('not_started','running','passed','failed','skipped')),
  backup_ref text,
  backup_checked_at timestamptz,
  backup_error text,

  github_owner text,
  github_repo text,
  github_issue_number integer,
  github_issue_url text,
  github_pr_number integer,
  github_pr_url text,

  deploy_status text not null default 'not_started'
    check (deploy_status in ('not_started','pending_manual','running','passed','failed','rolled_back')),
  deploy_ref text,
  deploy_checked_at timestamptz,

  risk_level text not null default 'medium'
    check (risk_level in ('low','medium','high','critical')),
  needs_human_review boolean not null default false,

  audit_log jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (incident_id)
);

create index if not exists repair_runs_state_idx on repair_runs(state);
create index if not exists repair_runs_policy_idx on repair_runs(policy);
create index if not exists repair_runs_incident_idx on repair_runs(incident_id);
create index if not exists repair_runs_created_idx on repair_runs(created_at desc);
create index if not exists repair_runs_client_slug_idx
  on repair_runs(client_slug)
  where client_slug is not null;

create or replace function repair_runs_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists repair_runs_touch_updated on repair_runs;
create trigger repair_runs_touch_updated
before update on repair_runs
for each row execute function repair_runs_touch_updated_at();

alter table repair_runs enable row level security;
-- Service role bypasses RLS. No anon policies: app APIs/pages are the only access path.

-- If PostgREST returns PGRST205 after migration, reload schema:
--   NOTIFY pgrst, 'reload schema';
