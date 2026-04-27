# Ops Observability OS — Master Blueprint

> Version: v1.5  
> Purpose: Observability + Incident Management + AI Diagnosis + AI Repair + Approval Governance + Status Page + Runbook Factory  
> Target users: Claude, Cursor, platform engineers, AIOps engineers  
> Recommended implementation stack: TypeScript monorepo + Supabase PostgreSQL + API routes + Slack + GitHub + AI providers

---

## 0. Executive Summary

**Ops Observability OS** is an internal AIOps operating system that connects observability signals, incident routing, AI diagnosis, remediation planning, approval governance, response automation, and knowledge-base learning.

It is not only a monitoring system. It is a foundation for AI-assisted and eventually AI-supervised system repair.

Core lifecycle:

```txt
Detect
→ Normalize
→ Enrich Context
→ Classify
→ Dispatch AI
→ Plan Remediation
→ Approval
→ Execute
→ Verify
→ Notify
→ Learn
```

Business-level flow:

```txt
偵測問題
→ 標準化事件
→ 補上下文
→ 分級
→ 派 AI 分析
→ 產修復方案
→ staging 修復 / 開 PR
→ production 前審批
→ 上線
→ 驗證
→ 產生 runbook / incident report / knowledge base
```

---

## 1. System Goals

Build a system that can:

1. Receive alerts from observability tools.
2. Normalize all alerts into a common incident-event format.
3. Deduplicate repeated alerts through idempotency.
4. Classify incident severity.
5. Enrich incidents with logs, metrics, traces, deployment metadata, and prior runbooks.
6. Dispatch AI agents for diagnosis, root cause analysis, log-pattern validation, remediation planning, and staging repair.
7. Generate remediation actions.
8. Enforce approval before production changes.
9. Notify Slack / GitHub / Status Page.
10. Generate runbooks and incident reports.
11. Record human feedback to improve future AI decisions.

---

## 2. Core Positioning

Ops Observability OS combines:

```txt
Observability Plane
+ Incident Plane
+ Decision Plane
+ Agent Plane
+ Approval Plane
+ Response Plane
+ Learning Plane
```

It supports the following chain:

```txt
Observability → Incident → AI Dispatch → Approval → Response → Knowledge
```

The system should become the operating base for an AI-assisted self-healing company infrastructure.

---

## 3. High-Level Architecture

```txt
┌──────────────────────────────────────────────┐
│                Services Layer                │
│ WordPress / WooCommerce / Next.js / API / n8n │
│ Trigger.dev / Supabase / VPS / Workers        │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│             Observability Layer              │
│ Sentry / Grafana / Loki / Netdata / Uptime   │
│ Kuma / PostHog / Langfuse                    │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│              Webhook Ingestion               │
│ /webhooks/sentry                             │
│ /webhooks/uptime-kuma                        │
│ /webhooks/grafana                            │
│ /webhooks/netdata                            │
│ /webhooks/posthog                            │
│ /webhooks/langfuse                           │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│              Normalization Layer             │
│ Normalize payload into IncidentEvent          │
│ Verify signature                             │
│ Enforce idempotency                          │
│ Redact secrets                               │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│               Incident Router                │
│ Match service                                │
│ Match alert rule                             │
│ Classify severity                            │
│ Resolve owner                                │
│ Create / update incident                     │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│               Context Fetcher                │
│ Logs before / after incident                 │
│ Metrics snapshot                             │
│ Recent deploy metadata                       │
│ Related incidents                            │
│ Existing runbooks                            │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│              AI Dispatch Layer               │
│ ChatGPT: diagnosis + repair suggestion       │
│ Claude: RCA + runbook                        │
│ Gemini: log pattern scan                     │
│ Copilot / Cursor: patch / PR / staging fix   │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│            Remediation Planner               │
│ Generate action plan                         │
│ Estimate risk                                │
│ Set dry_run                                  │
│ Determine approval requirement               │
│ Mark reversible / non_reversible             │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│              Governance Layer                │
│ Approval required for production             │
│ Approval required for DB destructive changes │
│ Secrets access blocked                       │
│ SafeMode enforcement                         │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│              Response Layer                  │
│ Slack alert                                  │
│ Status page update                           │
│ GitHub issue / PR                            │
│ Incident report                              │
│ Client notification                          │
│ Knowledge base update                        │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│              Learning Layer                  │
│ Feedback loops                               │
│ Human approval / rejection reason            │
│ Success / failure outcome                    │
│ Runbook improvement                          │
└──────────────────────────────────────────────┘
```

---

## 4. Core Design Principles

### 4.1 Safety First

All production changes must require approval.

```txt
staging repair              → may be automated
production deploy           → approval required
DB destructive migration     → approval required
secret access                → blocked by default or high approval
external client notification → reviewable
```

### 4.2 Every AI Action Must Be Traceable

Each AI action must store:

```txt
provider
model
role
input_context
prompt
output_suggestion
risk_level
confidence_score
prompt_tokens
completion_tokens
total_tokens
cost_estimate
created_at
```

### 4.3 Idempotency Is Mandatory

Duplicate external alerts must not create duplicate incidents or duplicate AI dispatches.

Deduplication key:

```txt
organization_id + source + external_event_id
```

Incident fingerprint key:

```txt
organization_id + fingerprint + environment
```

### 4.4 Context Before Intelligence

AI must not diagnose from raw alerts only.

Correct flow:

```txt
Alert → Normalize → Context Fetcher → AI Dispatch
```

Context should include:

```txt
raw alert
service metadata
environment
logs around incident
metrics around incident
recent deploy
previous similar incidents
existing runbooks
```

### 4.5 Learn From Human Feedback

Human approval, rejection, and correction data must become feedback-loop records.

This creates the future training dataset for a company-specific operations AI.

---

## 5. Supported Systems

### 5.1 Services Layer

Initial services:

```txt
WordPress
WooCommerce
Next.js
node-api
n8n
Trigger.dev
Supabase
Hosts / VPS
Workers
```

### 5.2 Observability Sources

Initial sources:

```txt
Sentry
Grafana
Loki
Netdata
Uptime Kuma
PostHog
Langfuse
GitHub deployment events
```

---

## 6. Core Modules

---

### 6.1 Webhook Ingestion

Purpose:

Receive external events from observability tools.

Routes:

```txt
/webhooks/sentry
/webhooks/uptime-kuma
/webhooks/grafana
/webhooks/netdata
/webhooks/posthog
/webhooks/langfuse
/webhooks/github-deployments
```

Each webhook handler must:

1. Verify webhook signature or shared secret.
2. Validate payload shape.
3. Redact secrets.
4. Extract `external_event_id`.
5. Generate `fingerprint`.
6. Normalize payload.
7. Insert `incident_events`.
8. Enforce idempotency.
9. Trigger `routeIncident`.

---

### 6.2 Incident Normalizer

All source payloads must become a `NormalizedIncidentEvent`.

```ts
export type IncidentEventSource =
  | "sentry"
  | "uptime_kuma"
  | "grafana"
  | "loki"
  | "netdata"
  | "posthog"
  | "langfuse"
  | "github"
  | "manual";

export type NormalizedIncidentEvent = {
  organization_id: string;
  source: IncidentEventSource;
  external_event_id: string;
  fingerprint: string;

  service_name?: string;
  service_id?: string;

  environment: "development" | "staging" | "production";
  signal_type:
    | "error"
    | "uptime"
    | "latency"
    | "resource"
    | "deployment"
    | "llm_trace"
    | "business_metric";

  title: string;
  message?: string;

  severity_hint?: "low" | "medium" | "high" | "critical";

  occurred_at: string;

  raw_payload: Record<string, unknown>;

  tags?: Record<string, string>;
};
```

---

### 6.3 Incident Router

Responsibilities:

1. Match service from `service_registry`.
2. Match alert rules.
3. Determine severity.
4. Resolve owner.
5. Create or update incident.
6. Start SLA timer.
7. Trigger Context Fetcher.
8. Dispatch notification.

---

### 6.4 Severity Classifier

Severity levels:

```txt
low
medium
high
critical
```

Classification rules:

#### Critical

```txt
- production is down
- checkout/payment broken
- auth broken
- data loss risk
- security incident
- DB destructive failure
- client-facing outage over threshold
```

#### High

```txt
- production degraded
- high error rate
- major API route failing
- deployment regression affecting users
```

#### Medium

```txt
- staging failure
- non-critical production warning
- performance degradation
- repeated non-critical error
```

#### Low

```txt
- dev issue
- isolated error
- warning-level alert
```

---

### 6.5 Context Fetcher

This is one of the most important modules.

Responsibilities:

1. Fetch logs around incident time.
2. Fetch metrics snapshot.
3. Fetch recent deployment metadata.
4. Fetch related incidents.
5. Fetch existing runbooks.
6. Build structured AI context.
7. Save evidence snapshot.

Default context window:

```txt
incident_time - 10 minutes
incident_time + 5 minutes
```

Critical context window:

```txt
incident_time - 30 minutes
incident_time + 10 minutes
```

AI context shape:

```ts
export type IncidentAIContext = {
  incident: {
    id: string;
    title: string;
    severity: string;
    status: string;
    environment: string;
    service_name: string;
    occurred_at: string;
  };

  event: NormalizedIncidentEvent;

  service: {
    name: string;
    type: string;
    repo_url?: string;
    owner_team?: string;
    criticality: string;
  };

  deployment?: {
    environment: string;
    commit_sha?: string;
    build_id?: string;
    deployed_at?: string;
    deployed_by?: string;
    release_version?: string;
  };

  logs?: Array<{
    timestamp: string;
    level: string;
    message: string;
    source: string;
  }>;

  metrics?: Record<string, unknown>;

  related_incidents?: Array<{
    id: string;
    title: string;
    resolved_at?: string;
    resolution_summary?: string;
  }>;

  related_runbooks?: Array<{
    id: string;
    title: string;
    content: string;
    confidence_score?: number;
  }>;
};
```

---

### 6.6 AI Dispatch Layer

AI role mapping:

```txt
ChatGPT:
- system diagnosis
- repair suggestion
- remediation summary

Claude:
- root cause analysis
- runbook generation
- architecture review
- incident report drafting

Gemini:
- log pattern scan
- consistency check
- anomaly pattern comparison

Copilot:
- code patch
- PR suggestion

Cursor:
- staging repair
- local code execution
- pre-deployment validation
- PR workflow
```

Dispatch policy:

```txt
low:
- notify only
- optional ChatGPT diagnosis

medium:
- ChatGPT diagnosis
- runbook lookup
- no auto remediation unless staging

high:
- ChatGPT diagnosis
- Claude RCA
- generate remediation proposal
- allow staging dry_run
- production requires approval

critical:
- ChatGPT diagnosis
- Claude RCA
- Gemini log consistency check
- create incident commander notification
- create remediation plan
- block production execution until approval
```

---

### 6.7 Remediation Planner

Purpose:

Convert AI suggestions into executable, reviewable, trackable remediation actions.

Action types:

```txt
create_github_issue
create_pr
rollback_deployment
restart_service
clear_cache
run_script
apply_patch
database_migration
update_config
notify_client
update_status_page
```

Required fields:

```txt
action_type
target_environment
risk_level
dry_run
requires_approval
approval_id
reversible
rollback_plan
execution_status
execution_log
```

---

### 6.8 Approval Layer

Approval rules:

```txt
IF target_environment = production
THEN approval required

IF action_type = database_migration AND destructive = true
THEN approval required

IF action touches secrets
THEN block by default

IF severity = critical AND production
THEN require senior approver or 2 approvals

IF remediation_action.non_reversible = true
THEN approval required
```

---

### 6.9 SafeMode Utility

```ts
export function assertSafeToExecuteRemediation(input: {
  target_environment: "development" | "staging" | "production";
  action_type: string;
  approval_id?: string | null;
  dry_run: boolean;
  touches_secrets?: boolean;
  destructive?: boolean;
}) {
  if (input.touches_secrets) {
    throw new Error("SafeMode blocked: secrets access is not allowed.");
  }

  if (input.target_environment === "production" && !input.approval_id) {
    throw new Error("SafeMode blocked: production remediation requires approval.");
  }

  if (input.destructive && !input.approval_id) {
    throw new Error("SafeMode blocked: destructive action requires approval.");
  }

  return true;
}
```

---

## 7. Database Blueprint

Required tables:

```txt
organizations
service_registry
alert_rules
incidents
incident_events
evidence_snapshots
deployment_metadata
ai_dispatch_runs
runbooks
remediation_actions
approvals
notifications
status_page_events
feedback_loops
audit_logs
```

---

### 7.1 service_registry

```sql
create table service_registry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  name text not null,
  slug text not null,
  service_type text not null,
  environment text not null check (environment in ('development', 'staging', 'production')),

  repo_url text,
  default_branch text,
  owner_team text,
  owner_user_id uuid,

  criticality text not null default 'medium'
    check (criticality in ('low', 'medium', 'high', 'critical')),

  status text not null default 'active'
    check (status in ('active', 'paused', 'deprecated')),

  metadata jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, slug, environment)
);
```

---

### 7.2 incidents

```sql
create table incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  service_id uuid references service_registry(id),

  title text not null,
  description text,

  status text not null default 'triggered'
    check (status in (
      'triggered',
      'analyzing',
      'remediating',
      'pending_approval',
      'resolved',
      'failed',
      'cancelled'
    )),

  severity text not null
    check (severity in ('low', 'medium', 'high', 'critical')),

  environment text not null
    check (environment in ('development', 'staging', 'production')),

  fingerprint text not null,

  current_assignee_id uuid,
  owner_team text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,

  resolution_summary text,
  root_cause_summary text,

  metadata jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, fingerprint, environment)
);
```

---

### 7.3 incident_events

```sql
create table incident_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  incident_id uuid references incidents(id) on delete cascade,

  source text not null,
  external_event_id text not null,
  fingerprint text not null,

  signal_type text not null,
  title text not null,
  message text,

  severity_hint text,
  normalized_payload jsonb not null default '{}',
  raw_payload jsonb not null default '{}',

  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  unique (organization_id, source, external_event_id)
);
```

---

### 7.4 alert_rules

```sql
create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  service_id uuid references service_registry(id),

  name text not null,
  source text not null,

  condition jsonb not null default '{}',

  severity text not null
    check (severity in ('low', 'medium', 'high', 'critical')),

  enabled boolean not null default true,

  notify_channels jsonb not null default '[]',
  dispatch_policy jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

### 7.5 evidence_snapshots

```sql
create table evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  incident_id uuid references incidents(id) on delete cascade,

  snapshot_type text not null
    check (snapshot_type in ('logs', 'metrics', 'trace', 'payload', 'deployment', 'screenshot', 'mixed')),

  source text not null,

  time_window_start timestamptz,
  time_window_end timestamptz,

  content jsonb not null default '{}',

  redaction_applied boolean not null default true,

  created_at timestamptz not null default now()
);
```

---

### 7.6 deployment_metadata

```sql
create table deployment_metadata (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  service_id uuid references service_registry(id),

  environment text not null
    check (environment in ('development', 'staging', 'production')),

  commit_sha text,
  branch text,
  build_id text,
  release_version text,
  deployment_url text,

  deployed_by text,
  deployed_at timestamptz not null,

  metadata jsonb not null default '{}',

  created_at timestamptz not null default now()
);
```

---

### 7.7 ai_dispatch_runs

```sql
create table ai_dispatch_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  incident_id uuid references incidents(id) on delete cascade,

  provider text not null,
  model text not null,
  role text not null,

  input_context jsonb not null default '{}',
  prompt text,
  output jsonb not null default '{}',

  confidence_score numeric,
  risk_level text check (risk_level in ('low', 'medium', 'high', 'critical')),

  prompt_tokens integer default 0,
  completion_tokens integer default 0,
  total_tokens integer default 0,
  cost_estimate numeric default 0,

  status text not null default 'completed'
    check (status in ('queued', 'running', 'completed', 'failed')),

  error_message text,

  created_at timestamptz not null default now()
);
```

---

### 7.8 runbooks

```sql
create table runbooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  service_id uuid references service_registry(id),
  incident_id uuid references incidents(id),

  title text not null,
  slug text not null,

  content_md text not null,

  source text not null default 'ai_generated'
    check (source in ('manual', 'ai_generated', 'incident_postmortem')),

  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published', 'deprecated')),

  tags text[] not null default '{}',

  success_count integer not null default 0,
  failure_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

### 7.9 remediation_actions

```sql
create table remediation_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  incident_id uuid references incidents(id) on delete cascade,

  action_type text not null,
  target_environment text not null
    check (target_environment in ('development', 'staging', 'production')),

  title text not null,
  description text,

  proposed_by_ai_dispatch_run_id uuid references ai_dispatch_runs(id),

  status text not null default 'proposed'
    check (status in (
      'proposed',
      'dry_run_ready',
      'dry_run_running',
      'dry_run_passed',
      'dry_run_failed',
      'pending_approval',
      'approved',
      'rejected',
      'executing',
      'succeeded',
      'failed',
      'rolled_back'
    )),

  dry_run boolean not null default true,

  requires_approval boolean not null default true,
  approval_id uuid,

  reversible boolean not null default true,
  rollback_plan text,
  non_reversible_reason text,

  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high', 'critical')),

  git_branch text,
  pr_url text,
  issue_url text,

  execution_payload jsonb not null default '{}',
  execution_log jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

### 7.10 approvals

```sql
create table approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  entity_type text not null
    check (entity_type in ('remediation_action', 'production_deploy', 'db_migration', 'client_notification')),

  entity_id uuid not null,

  requester_id uuid,
  approver_id uuid,

  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected', 'expired')),

  reason text,

  requested_at timestamptz not null default now(),
  decided_at timestamptz,

  created_at timestamptz not null default now()
);
```

---

### 7.11 feedback_loops

```sql
create table feedback_loops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  incident_id uuid references incidents(id),
  remediation_action_id uuid references remediation_actions(id),
  ai_dispatch_run_id uuid references ai_dispatch_runs(id),

  feedback_type text not null
    check (feedback_type in (
      'approval_reason',
      'rejection_reason',
      'remediation_success',
      'remediation_failure',
      'runbook_improvement',
      'false_positive',
      'classification_correction'
    )),

  feedback_text text not null,

  rating integer check (rating >= 1 and rating <= 5),

  created_by uuid,

  created_at timestamptz not null default now()
);
```

---

### 7.12 status_page_events

```sql
create table status_page_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  incident_id uuid references incidents(id),

  title text not null,
  message text not null,

  status text not null
    check (status in ('investigating', 'identified', 'monitoring', 'resolved')),

  visibility text not null default 'internal'
    check (visibility in ('internal', 'public', 'client_only')),

  published_at timestamptz,

  created_at timestamptz not null default now()
);
```

---

### 7.13 notifications

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  incident_id uuid references incidents(id),

  channel text not null
    check (channel in ('slack', 'email', 'webhook', 'status_page', 'github')),

  destination text not null,
  payload jsonb not null default '{}',

  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed')),

  sent_at timestamptz,
  error_message text,

  created_at timestamptz not null default now()
);
```

---

## 8. Incident State Machine

Main path:

```txt
triggered
  ↓
analyzing
  ↓
remediating
  ↓
pending_approval
  ↓
resolved
```

Failure paths:

```txt
triggered → failed
analyzing → failed
remediating → failed
pending_approval → rejected / cancelled
resolved → reopened
```

State definitions:

```txt
triggered:
Incident was created from incoming alert.

analyzing:
System is fetching context and running AI diagnosis.

remediating:
A remediation action is being prepared or executed.

pending_approval:
Production or risky remediation is blocked until approval.

resolved:
Incident has been fixed and verified.

failed:
Automated diagnosis or remediation failed.

cancelled:
Incident was manually cancelled or marked irrelevant.
```

---

## 9. Main System Flows

---

### 9.1 Sentry Error Flow

```txt
1. Sentry sends webhook.
2. Verify Sentry signature.
3. Normalize payload.
4. Generate fingerprint.
5. Check idempotency.
6. Create incident_event.
7. Find service in service_registry.
8. Create or update incident.
9. Classify severity.
10. Fetch context:
    - Sentry stack trace
    - logs from Grafana/Loki
    - recent deployment metadata
    - related runbooks
11. Save evidence_snapshot.
12. Dispatch AI:
    - ChatGPT diagnosis
    - Claude RCA / runbook if high or critical
    - Gemini log scan if critical
13. Create remediation_action.
14. If staging:
    - allow dry_run
    - allow Cursor staging repair
15. If production:
    - require approval
16. Notify Slack.
17. Optionally create GitHub issue / PR.
18. Update status page if user-facing.
19. After resolution:
    - create incident report
    - update runbook
    - record feedback_loop
```

---

### 9.2 Uptime Kuma Downtime Flow

```txt
1. Uptime Kuma detects endpoint down.
2. Send webhook.
3. Verify webhook token.
4. Normalize uptime event.
5. Match service by URL / tag.
6. Create incident.
7. Severity classification:
   - production public endpoint down = critical
   - staging endpoint down = medium
8. Fetch context:
   - recent deploy
   - host metrics
   - app logs
   - previous uptime events
9. AI diagnosis:
   - check DNS / SSL / host / app / reverse proxy
10. Suggested actions:
   - restart service
   - rollback deployment
   - check nginx
   - check DB connectivity
11. Production actions require approval.
12. Slack notification.
13. Status page update if public endpoint.
```

---

### 9.3 Critical Incident Flow

```txt
1. Incident severity = critical.
2. Lock incident status = analyzing.
3. Notify incident commander channel.
4. Fetch extended context window.
5. Run multi-model validation:
   - ChatGPT proposes diagnosis
   - Claude critiques and writes RCA
   - Gemini validates log pattern
6. Generate risk-ranked remediation plan.
7. Create remediation_action with dry_run = true.
8. If action touches production:
   - status = pending_approval
   - request approval
9. Once approved:
   - execute action
10. Verify:
   - error rate reduced
   - uptime restored
   - no regression
11. Mark incident resolved.
12. Generate postmortem.
13. Update runbook.
14. Store feedback.
```

---

### 9.4 Production Remediation Flow

```txt
1. AI proposes production remediation.
2. System creates remediation_action.
3. SafeMode checks:
   - target_environment = production
   - approval_id missing
4. Block execution.
5. Create approval request.
6. Notify approver.
7. Approver approves or rejects.
8. If approved:
   - run dry_run if possible
   - execute production action
   - verify result
9. If rejected:
   - record rejection reason
   - update feedback_loops
```

---

## 10. AI Dispatch Policy

Create:

```txt
packages/policies/ai-dispatch/observability-policy.json
```

Recommended content:

```json
{
  "version": "1.0.0",
  "default_mode": "safe",
  "severity_policy": {
    "low": {
      "dispatch": ["chatgpt"],
      "auto_remediation": false,
      "requires_approval": false
    },
    "medium": {
      "dispatch": ["chatgpt"],
      "auto_remediation": false,
      "requires_approval": false
    },
    "high": {
      "dispatch": ["chatgpt", "claude"],
      "auto_remediation": "staging_only",
      "requires_approval": true
    },
    "critical": {
      "dispatch": ["chatgpt", "claude", "gemini"],
      "multi_model_validation": true,
      "auto_remediation": "staging_only",
      "requires_approval": true,
      "requires_incident_commander": true
    }
  },
  "environment_policy": {
    "development": {
      "allow_auto_fix": true,
      "requires_approval": false
    },
    "staging": {
      "allow_auto_fix": true,
      "requires_approval": false,
      "dry_run_required": true
    },
    "production": {
      "allow_auto_fix": false,
      "requires_approval": true,
      "dry_run_required": true
    }
  },
  "blocked_actions": [
    "read_secrets",
    "dump_database",
    "delete_database",
    "rotate_secrets_without_approval",
    "production_deploy_without_approval"
  ],
  "approval_required_actions": [
    "production_deploy",
    "database_migration",
    "rollback_production",
    "client_notification",
    "non_reversible_action"
  ]
}
```

---

## 11. Recommended File Structure

```txt
packages/db/migrations/ops_observability_os_v1.sql

packages/shared/src/types/observability.ts
packages/shared/src/types/incidents.ts
packages/shared/src/types/remediation.ts

apps/api/src/routes/webhooks/sentry.ts
apps/api/src/routes/webhooks/uptime-kuma.ts
apps/api/src/routes/webhooks/grafana.ts
apps/api/src/routes/webhooks/netdata.ts
apps/api/src/routes/webhooks/posthog.ts
apps/api/src/routes/webhooks/langfuse.ts

apps/api/src/services/incidents/normalizeIncidentEvent.ts
apps/api/src/services/incidents/classifyIncident.ts
apps/api/src/services/incidents/routeIncident.ts
apps/api/src/services/incidents/contextFetcher.ts
apps/api/src/services/incidents/dispatchAI.ts
apps/api/src/services/incidents/createRemediationAction.ts
apps/api/src/services/incidents/safeMode.ts
apps/api/src/services/incidents/verifyRemediation.ts
apps/api/src/services/incidents/updateIncidentStatus.ts
apps/api/src/services/incidents/redactSecrets.ts
apps/api/src/services/incidents/generateFingerprint.ts
apps/api/src/services/incidents/verifyWebhookSignature.ts
apps/api/src/services/incidents/findRelatedRunbooks.ts
apps/api/src/services/incidents/findRecentDeployments.ts
apps/api/src/services/incidents/saveEvidenceSnapshot.ts

apps/api/src/services/notifications/slackPayload.ts
apps/api/src/services/notifications/sendSlackNotification.ts
apps/api/src/services/notifications/statusPagePayload.ts

apps/api/src/services/status-page/createStatusPageEvent.ts

apps/api/src/services/github/createIssue.ts
apps/api/src/services/github/createPullRequest.ts

packages/policies/ai-dispatch/observability-policy.json

docs/OPS_OBSERVABILITY_OS.md
docs/SYSTEM_FLOW.md
docs/INCIDENT_STATE_MACHINE.md
docs/AI_DISPATCH_POLICY.md
docs/REMEDIATION_SAFETY.md
docs/WEBHOOK_SECURITY.md
```

---

## 12. Acceptance Criteria

### 12.1 Functional

```txt
- Can receive Sentry webhook.
- Can receive Uptime Kuma webhook.
- Can normalize incoming payload.
- Can create incident_event.
- Can create or update incident.
- Can classify severity.
- Can fetch structured context.
- Can save evidence_snapshot.
- Can dispatch correct AI role.
- Can create ai_dispatch_run.
- Can create remediation_action.
- Can create Slack alert payload.
- Can block production remediation without approval.
- Can create approval request.
- Can record feedback_loop.
```

### 12.2 Safety

```txt
- Webhook signatures are verified.
- Duplicate external_event_id does not create duplicate incident.
- Duplicate alerts do not trigger duplicate AI dispatch.
- Secrets are redacted from logs and AI context.
- Production remediation is blocked without approval.
- Destructive DB actions require approval.
- AI actions are fully logged.
- Remediation actions are reversible or explicitly marked non_reversible.
```

### 12.3 Engineering

```txt
- All tables use UUID primary keys.
- All core tables include organization_id.
- All mutable tables include created_at and updated_at.
- TypeScript types match database shape.
- Services are modular and testable.
- Policy config is externalized as JSON.
- No hardcoded secrets.
```

---

# 13. Cursor Implementation Plan

Do not ask Cursor to implement everything at once.

Use the following phases.

---

## Cursor Task 1 — Database + Types

```markdown
# TASK 1: Build Ops Observability OS Database and Types

Implement the database and TypeScript types for Ops Observability OS.

## Goal

Create the foundational schema for an AI-driven incident response and remediation system.

## Requirements

Create a Supabase SQL migration:

packages/db/migrations/ops_observability_os_v1.sql

The migration must include these tables:

- service_registry
- alert_rules
- incidents
- incident_events
- evidence_snapshots
- deployment_metadata
- ai_dispatch_runs
- runbooks
- remediation_actions
- approvals
- notifications
- status_page_events
- feedback_loops
- audit_logs

## Schema Rules

- Every table must use UUID primary key.
- Every tenant-scoped table must include organization_id.
- Every mutable table must include created_at and updated_at.
- Use PostgreSQL check constraints for enum-like fields.
- Add indexes for:
  - organization_id
  - incident_id
  - service_id
  - status
  - severity
  - fingerprint
  - external_event_id
- Enforce idempotency on incident_events using:
  organization_id + source + external_event_id.
- Enforce uniqueness on incidents using:
  organization_id + fingerprint + environment.

## Incident State

incidents.status must support:

- triggered
- analyzing
- remediating
- pending_approval
- resolved
- failed
- cancelled

## Severity

Support:

- low
- medium
- high
- critical

## Remediation Safety Fields

remediation_actions must include:

- dry_run
- requires_approval
- approval_id
- reversible
- rollback_plan
- non_reversible_reason
- risk_level
- target_environment

## AI Traceability

ai_dispatch_runs must include:

- provider
- model
- role
- input_context
- prompt
- output
- confidence_score
- risk_level
- prompt_tokens
- completion_tokens
- total_tokens
- cost_estimate
- status
- error_message

## TypeScript Output

Create:

packages/shared/src/types/observability.ts
packages/shared/src/types/incidents.ts
packages/shared/src/types/remediation.ts

These files must export TypeScript types matching the database schema.

## Acceptance Criteria

- SQL migration is valid PostgreSQL / Supabase SQL.
- TypeScript types compile.
- Incident, IncidentEvent, AIDispatchRun, RemediationAction, Approval, Runbook types exist.
- All safety fields are represented in types.
```

---

## Cursor Task 2 — Webhooks + Normalization

```markdown
# TASK 2: Build Webhook Ingestion and Incident Normalization

Implement webhook ingestion for the first version of Ops Observability OS.

## Goal

Receive alerts from external observability tools, verify them, normalize them, and create incident_events.

## Files to Create

- apps/api/src/routes/webhooks/sentry.ts
- apps/api/src/routes/webhooks/uptime-kuma.ts
- apps/api/src/routes/webhooks/grafana.ts
- apps/api/src/services/incidents/normalizeIncidentEvent.ts
- apps/api/src/services/incidents/redactSecrets.ts
- apps/api/src/services/incidents/generateFingerprint.ts
- apps/api/src/services/incidents/verifyWebhookSignature.ts

## Requirements

Each webhook route must:

1. Verify webhook signature or shared secret.
2. Validate payload shape.
3. Redact secrets from payload.
4. Extract external_event_id.
5. Generate fingerprint.
6. Normalize payload into NormalizedIncidentEvent.
7. Insert incident_event.
8. Enforce idempotency:
   - If source + external_event_id already exists, return 200 with duplicate: true.
9. Call routeIncident(normalizedEvent).

## NormalizedIncidentEvent Type

Use this shape:

{
  organization_id: string;
  source: "sentry" | "uptime_kuma" | "grafana" | "loki" | "netdata" | "posthog" | "langfuse" | "github" | "manual";
  external_event_id: string;
  fingerprint: string;
  service_name?: string;
  service_id?: string;
  environment: "development" | "staging" | "production";
  signal_type: "error" | "uptime" | "latency" | "resource" | "deployment" | "llm_trace" | "business_metric";
  title: string;
  message?: string;
  severity_hint?: "low" | "medium" | "high" | "critical";
  occurred_at: string;
  raw_payload: Record<string, unknown>;
  tags?: Record<string, string>;
}

## Secret Redaction

Redact values from keys containing:

- password
- secret
- token
- api_key
- authorization
- cookie
- private_key
- access_token
- refresh_token

## Acceptance Criteria

- Sentry webhook can normalize an error event.
- Uptime Kuma webhook can normalize an uptime event.
- Grafana webhook can normalize an alert event.
- Duplicate webhooks do not create duplicate incident_events.
- Secrets are removed before storage.
```

---

## Cursor Task 3 — Incident Router + Classifier + Context Fetcher

```markdown
# TASK 3: Build Incident Router, Severity Classifier, and Context Fetcher

Implement the core incident routing logic.

## Files to Create

- apps/api/src/services/incidents/routeIncident.ts
- apps/api/src/services/incidents/classifyIncident.ts
- apps/api/src/services/incidents/contextFetcher.ts
- apps/api/src/services/incidents/findRelatedRunbooks.ts
- apps/api/src/services/incidents/findRecentDeployments.ts
- apps/api/src/services/incidents/saveEvidenceSnapshot.ts
- apps/api/src/services/incidents/updateIncidentStatus.ts

## routeIncident Responsibilities

1. Match service from service_registry.
2. Match alert_rules.
3. Classify severity.
4. Create or update incident.
5. Save incident_event relation.
6. Update incident status to analyzing.
7. Call contextFetcher.
8. Save evidence_snapshots.
9. Return incident + context.

## classifyIncident Rules

critical:
- production is down
- payment / checkout / auth is broken
- DB data loss risk
- security incident
- public uptime failure

high:
- production error rate spike
- major endpoint failure
- deployment regression

medium:
- staging failure
- degraded performance
- repeated non-critical errors

low:
- dev issue
- warning
- isolated event

## Context Fetcher

Fetch and assemble:

- incident
- normalized event
- service metadata
- recent deployment_metadata
- related incidents
- related runbooks
- logs placeholder
- metrics placeholder

For v1, logs and metrics may be implemented as provider interfaces with stubbed adapters.

## Evidence Snapshot

Save context data into evidence_snapshots.

## Acceptance Criteria

- routeIncident creates incident if no existing fingerprint exists.
- routeIncident updates last_seen_at if incident already exists.
- classifyIncident returns low / medium / high / critical.
- contextFetcher returns structured AI context.
- evidence_snapshots record context.
```

---

## Cursor Task 4 — AI Dispatch Layer

```markdown
# TASK 4: Build AI Dispatch Layer and Policy Config

Implement AI dispatch for incident diagnosis, RCA, log validation, and remediation planning.

## Files to Create

- apps/api/src/services/incidents/dispatchAI.ts
- apps/api/src/services/incidents/buildAIPrompt.ts
- apps/api/src/services/incidents/selectAIDispatchRoles.ts
- apps/api/src/services/incidents/createAIDispatchRun.ts
- packages/policies/ai-dispatch/observability-policy.json

## AI Roles

- chatgpt: system diagnosis and repair suggestions
- claude: root cause analysis and runbook generation
- gemini: log scanning and pattern recognition
- copilot: code patch and PR generation
- cursor: staging execution and PR workflow

## Dispatch Policy

low:
- ChatGPT only
- no remediation

medium:
- ChatGPT
- lookup runbooks
- no production remediation

high:
- ChatGPT + Claude
- create remediation proposal
- staging dry_run allowed

critical:
- ChatGPT + Claude + Gemini
- multi-model validation
- incident commander notification
- production blocked until approval

## ai_dispatch_runs

Every AI run must be stored with:

- incident_id
- provider
- model
- role
- input_context
- prompt
- output
- confidence_score
- risk_level
- token usage
- cost estimate
- status

## Output Contract

dispatchAI must return:

{
  incident_id: string;
  diagnosis: string;
  root_cause_hypothesis: string;
  suggested_actions: Array<{
    title: string;
    action_type: string;
    target_environment: string;
    risk_level: string;
    requires_approval: boolean;
    reversible: boolean;
    rollback_plan?: string;
  }>;
  runbook_draft?: string;
  confidence_score: number;
}

## Acceptance Criteria

- Correct AI roles are selected by severity.
- Every AI dispatch is recorded.
- Critical incidents trigger multi-model validation.
- Output can be used to create remediation_actions.
```

---

## Cursor Task 5 — Remediation Actions + SafeMode + Approval

```markdown
# TASK 5: Build Remediation Actions, SafeMode, and Approval Workflow

Implement remediation planning and execution safety.

## Files to Create

- apps/api/src/services/incidents/createRemediationAction.ts
- apps/api/src/services/incidents/safeMode.ts
- apps/api/src/services/incidents/requestApproval.ts
- apps/api/src/services/incidents/approveRemediationAction.ts
- apps/api/src/services/incidents/rejectRemediationAction.ts
- apps/api/src/services/incidents/executeRemediationAction.ts

## SafeMode Rules

Block execution if:

- target_environment = production and approval_id is missing
- destructive = true and approval_id is missing
- touches_secrets = true
- action_type is blocked by policy
- non_reversible = true and approval_id is missing

## Remediation Action Creation

For each suggested AI action:

1. Create remediation_action.
2. Set dry_run = true by default.
3. Determine requires_approval.
4. Set risk_level.
5. Set reversible.
6. Attach rollback_plan.
7. If production, set status = pending_approval.
8. If staging, set status = dry_run_ready.

## Approval Flow

requestApproval:
- creates approvals row
- links approval_id to remediation_action
- sends Slack payload

approveRemediationAction:
- updates approval decision
- updates remediation_action status to approved

rejectRemediationAction:
- updates approval decision
- updates remediation_action status to rejected
- records feedback_loop

## Execution

executeRemediationAction must call SafeMode before execution.

For v1, execution can be stubbed with:

- create GitHub issue
- create branch name
- create PR payload
- create dry_run log

Do not perform real production deploy in v1.

## Acceptance Criteria

- Production remediation without approval throws error.
- Staging dry_run can proceed.
- Destructive action requires approval.
- Rejected actions create feedback_loop.
- Approved actions can move to executing.
```

---

## Cursor Task 6 — Slack, Status Page, GitHub Integration

```markdown
# TASK 6: Build Notification, Status Page, and GitHub Abstractions

Implement response layer outputs.

## Files to Create

- apps/api/src/services/notifications/slackPayload.ts
- apps/api/src/services/notifications/sendSlackNotification.ts
- apps/api/src/services/notifications/statusPagePayload.ts
- apps/api/src/services/status-page/createStatusPageEvent.ts
- apps/api/src/services/github/createIssue.ts
- apps/api/src/services/github/createPullRequest.ts
- apps/api/src/services/incidents/generateIncidentReport.ts

## Slack Alert Payload

Include:

- incident title
- severity
- service
- environment
- status
- summary
- evidence link
- suggested remediation
- approval buttons placeholder
- incident URL

## Status Page Event

Create status_page_events for:

- production outage
- public endpoint down
- payment / checkout incident
- client-facing degradation

## GitHub Issue

Create issue payload with:

- incident summary
- severity
- service
- evidence
- AI diagnosis
- suggested action
- runbook link

## GitHub PR

Create PR abstraction with:

- branch name
- title
- body
- remediation_action_id
- rollback plan

For v1, this may only return structured payloads and not call GitHub API directly.

## Incident Report

Generate markdown report:

- timeline
- impact
- root cause
- evidence
- actions taken
- follow-ups
- runbook updates

## Acceptance Criteria

- Slack payload is generated.
- Status page event can be created.
- GitHub issue payload is generated.
- PR payload is generated.
- Incident report markdown is generated.
```

---

## Cursor Task 7 — Documentation

```markdown
# TASK 7: Write Ops Observability OS Documentation

Create complete documentation for the system.

## Files to Create

- docs/OPS_OBSERVABILITY_OS.md
- docs/SYSTEM_FLOW.md
- docs/INCIDENT_STATE_MACHINE.md
- docs/AI_DISPATCH_POLICY.md
- docs/REMEDIATION_SAFETY.md
- docs/WEBHOOK_SECURITY.md

## Documentation Must Include

1. System overview
2. Architecture diagram in text form
3. Database schema explanation
4. Incident lifecycle
5. Webhook ingestion flow
6. Context Fetcher flow
7. AI Dispatch policy
8. Remediation safety rules
9. Approval workflow
10. Status page workflow
11. Runbook factory workflow
12. Feedback loop design
13. Production safety constraints

## Acceptance Criteria

- Docs explain how a Sentry error becomes a GitHub PR.
- Docs explain why production deploy is blocked without approval.
- Docs explain how runbooks are generated and reused.
- Docs explain how feedback improves future AI dispatch.
```

---

# 14. Claude Master Prompt

Use this prompt for Claude to review or expand the architecture.

```markdown
You are acting as a principal platform architect and senior AIOps engineer.

I am building an internal system called Ops Observability OS.

Its purpose is to connect observability signals, incident management, AI diagnosis, remediation planning, approval governance, status page updates, GitHub issues / PRs, runbook generation, and knowledge base feedback loops.

The system should support:

- Sentry
- Uptime Kuma
- Grafana / Loki
- Netdata
- PostHog
- Langfuse
- GitHub deployment metadata
- Supabase
- TypeScript API routes
- Slack notifications
- Status page events
- GitHub issue / PR abstraction
- AI Dispatch using ChatGPT, Claude, Gemini, Copilot, and Cursor

The core lifecycle is:

Detect
→ Normalize
→ Enrich Context
→ Classify
→ Dispatch AI
→ Plan Remediation
→ Approval
→ Execute
→ Verify
→ Notify
→ Learn

Please help me design and review the full system using the following architecture:

1. Services Layer
2. Observability Layer
3. Webhook Ingestion
4. Normalization Layer
5. Incident Router
6. Context Fetcher
7. AI Dispatch Layer
8. Remediation Planner
9. Approval / Governance Layer
10. Response Layer
11. Learning Layer

Important rules:

- Every incident must include organization_id.
- Every incident must include severity.
- Every AI action must be recorded.
- Production remediation must require approval.
- Cursor agent can repair staging.
- Cursor agent cannot deploy production without approval.
- Secrets must never be exposed in logs or AI context.
- All remediation actions must be reversible or marked non_reversible.
- Webhook signature verification is mandatory.
- Idempotency is mandatory.
- Duplicate alerts must not trigger duplicate AI dispatch.
- Incidents must follow a state machine.
- AI dispatch must use context, not only raw alert payloads.

Required tables:

- service_registry
- alert_rules
- incidents
- incident_events
- evidence_snapshots
- deployment_metadata
- ai_dispatch_runs
- runbooks
- remediation_actions
- approvals
- notifications
- status_page_events
- feedback_loops
- audit_logs

Please produce:

1. Final architecture spec
2. Detailed system flow
3. Incident state machine
4. Database schema recommendations
5. AI dispatch policy
6. Remediation safety policy
7. Approval workflow
8. Status page workflow
9. Runbook factory workflow
10. Cursor implementation task breakdown
11. Risks and mitigations
12. Production-readiness checklist

Assume this will be implemented in a TypeScript monorepo with Supabase PostgreSQL.
```

---

# 15. Recommended Build Order

```txt
Phase 1:
Database + Types

Phase 2:
Webhook ingestion + normalization

Phase 3:
Incident router + severity classifier

Phase 4:
Context fetcher + evidence snapshots

Phase 5:
AI dispatch + policy

Phase 6:
Remediation actions + SafeMode

Phase 7:
Approval workflow

Phase 8:
Slack / GitHub / Status Page outputs

Phase 9:
Runbook factory + feedback loops

Phase 10:
Production hardening
```

---

# 16. MVP Scope

## v1 Must Have

```txt
- Sentry webhook
- Uptime Kuma webhook
- incident_events
- incidents
- severity classification
- contextFetcher stub
- ai_dispatch_runs
- remediation_actions
- approvals
- SafeMode
- Slack payload
- GitHub issue payload
```

## v1 Should Not Do

```txt
- Real production deploy
- Real destructive DB migration
- Real secrets access
- Fully autonomous production repair
- Complex multi-agent orchestration for every incident
```

## v1.5 Add

```txt
- Grafana / Loki
- evidence snapshots
- deployment metadata
- runbook retrieval
- Claude RCA
- Gemini log validation for critical incidents
- Status page events
```

## v2 Add

```txt
- Real GitHub PR creation
- Cursor staging repair
- Production approval UI
- Incident report generator
- Feedback loop analytics
- Runbook recommendation engine
```

---

# 17. Production-Readiness Checklist

```txt
[ ] Webhook signatures verified
[ ] Idempotency enforced
[ ] All secrets redacted
[ ] RLS policies added
[ ] organization_id enforced
[ ] AI actions logged
[ ] Cost tracking enabled
[ ] Production remediation blocked without approval
[ ] DB destructive changes blocked without approval
[ ] Rollback plans required
[ ] Runbooks generated
[ ] Feedback loops recorded
[ ] Slack notification tested
[ ] GitHub issue payload tested
[ ] Status page payload tested
[ ] Incident state machine documented
[ ] SafeMode tested
```

---

# 18. Final One-Liner

Build an AI-driven incident response operating system that receives observability alerts, normalizes them into incidents, enriches them with logs / metrics / deployment context, dispatches AI agents for diagnosis and remediation planning, enforces approval before production changes, generates Slack / GitHub / Status Page outputs, and continuously improves through runbooks and feedback loops.
