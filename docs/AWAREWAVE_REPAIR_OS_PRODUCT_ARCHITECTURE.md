# AwareWave Repair OS Product Architecture

Last updated: 2026-05-14

## One-Sentence Product Definition

AwareWave Repair OS is a multi-client AI maintenance operating system that connects client assets, monitoring tools, notifications, AI diagnosis, approvals, backups, repair workflows, deployments, and evidence into one clear Repair Center.

It is not a collection of separate AI tools, Slack alerts, Telegram commands, and monitoring pages.

## Core Product Principle

The product must be easy to understand and sell:

```text
Client -> Asset -> Integration -> Incident -> Repair -> Evidence
```

Every feature must fit into this chain.

If a feature cannot be explained through this chain, it is either an internal engine, a debug tool, or architectural debt.

## Final User-Facing Navigation

The app should converge toward this product navigation:

```text
Dashboard
Clients
Repair Center
Integrations
Approvals
Deployments
Settings
```

`Ops Inbox` should not be a primary product page. It may remain internally as an incident intake engine, but customers and operators should experience the system through `Repair Center`.

## Primary Objects

### Client

A client is an organization that receives monitoring, maintenance, automation, repair, and reporting.

In Repair OS, every maintained organization is a client. This includes AwareWave itself. AwareWave should not be a separate product category in the maintenance flow; it is an internal client that dogfoods the same system sold to external customers.

```text
slug: awarewave-ops
type: client
client_kind: internal
relationship: first_party
role: internal platform client
```

This avoids special-case architecture where the platform monitors everyone except itself through a different path.

External customers use the same client model:

```text
slug: soulful-expression
type: client
client_kind: external
relationship: customer
role: external customer client
```

The distinction is not whether something is a client. The distinction is the relationship:

```text
internal
external
demo
sandbox
partner
```

### Asset

An asset is something the system can monitor or repair.

Examples:

```text
Website
Web app
API
WordPress site
Server
Database
n8n workflow
Trigger.dev job
Supabase project
GitHub repository
```

AwareWave assets should include:

```text
app.aware-wave.com
api.aware-wave.com
n8n.aware-wave.com
trigger.aware-wave.com
supabase.aware-wave.com
SG server
EU server
```

### Integration

An integration is a configured connection between a client or asset and an external system.

Examples:

```text
Sentry
Uptime Kuma
Grafana
Netdata
PostHog
GitHub
Slack
Telegram
n8n
Trigger.dev
Supabase
WordPress
Cloudflare
```

Integrations must be visible, testable, and scoped to a client.

Secrets must never be stored directly in UI-visible metadata. Store secret references only.

### Incident

An incident is a normalized event produced by monitoring, webhook intake, manual creation, or automation.

Incidents own:

```text
source
asset/client association
fingerprint
deduplication
severity
status
raw payload
AI diagnosis
notification log
```

The incident layer is an internal engine. It should power Repair Center, not compete with it as a separate user-facing product.

### Repair

A repair is the operational workflow created from an incident.

Repairs own:

```text
policy
approval
backup gate
AI analysis
GitHub issue / PR handoff
manual deploy gate
rollback evidence
resolution status
audit trail
```

Repair Center is the main product surface.

## Repair Center Product Role

Repair Center is the only maintenance command center.

It should answer these questions at a glance:

```text
What is broken?
Which client is affected?
Which asset is affected?
How severe is it?
Has AI diagnosed it?
Can it be repaired automatically?
Is backup complete?
Is approval required?
Is there an Issue or PR?
Has it been deployed?
Was it verified?
What evidence proves it?
```

## Repair Center Target Views

Repair Center should contain these views or tabs:

```text
Overview
Incidents
Repair Queue
Active Repairs
History
Health & Rules
```

### Overview

Shows system-level maintenance posture:

```text
open incidents
critical incidents
repairs in progress
blocked repairs
clients affected
assets affected
notification health
backup health
deployment health
```

### Incidents

Shows all normalized problems, whether or not they can be repaired automatically.

Filters:

```text
client
asset
source
severity
status
environment
repair policy
```

### Repair Queue

Shows incidents that are eligible for repair workflow creation.

Policies:

```text
auto_repair
analysis_only
triage_needed
human_only
```

### Active Repairs

Shows repairs currently moving through the workflow:

```text
detected
triage_needed
approved
backing_up
repairing
pr_ready
deploy_pending
deploying
rolled_back
resolved
human_only
```

### History

Shows completed, resolved, ignored, failed, and human-only repair records.

This is important for customer trust and postmortem evidence.

### Health & Rules

Shows whether the system itself is ready:

```text
webhook ingest
Slack notification
Telegram backup notification
Sentry integration
Uptime integration
GitHub integration
backup gate
deployment gate
AI diagnosis quota
repair policy catalog
```

## Integrations Product Role

Integrations must become a first-class product page.

For each client, the operator should see:

```text
Provider
Status
Connected asset
Last test time
Last error
Secret reference
External hint
Actions
```

Example status table:

```text
Sentry        active   project: awarewave-next-admin
Uptime Kuma   active   monitor: app.aware-wave.com
PostHog       active   project: AwareWave
GitHub        active   repo: awarewaveai-pei/Work
Slack         active   channel: #ops-incidents
Telegram      active   operator backup
Trigger.dev   active   job runner
n8n           active   workflow automation
Supabase      active   project database
```

Customers should not need to understand environment variables, manually wired scripts, or hidden AI setup.

## Onboarding Target Flow

New client onboarding should become:

```text
1. Create client
2. Add assets
3. Select monitoring tools
4. Connect notifications
5. Enable AI diagnosis / repair policies
6. Verify integrations
7. Start monitoring
8. Enter Repair Center
```

Current onboarding already has parts of this flow, but it must be connected to live database-backed integration records and visible product status.

## Current Architecture Findings

The current system already contains important building blocks:

```text
organizations table
awarewave-ops organization
soulful-expression organization
client management pages
onboarding wizard
repair_runs table
ops_incidents table
webhook ingest routes
Slack / Telegram notification code
repair policy catalog
Trigger.dev provisioning endpoint
tenant_integration_bindings migration
```

However, the product is not fully converged yet:

```text
Repair Center and Ops Inbox overlap as UI concepts.
Integrations are not yet a complete visible product surface.
Some live database migrations appear out of sync with code.
AI/monitoring/notification setup is still partly environment/script driven.
AwareWave exists as an organization, but not yet as a fully modeled internal customer with assets and integrations.
```

## Important Live Drift To Resolve

Observed on 2026-05-14:

```text
tenant_integration_bindings table exists in migration but was not visible in live Supabase REST schema.
ops_incidents.client_slug exists in migration but was not visible in live Supabase REST schema.
```

This must be fixed before relying on client-scoped integrations and client-scoped incident filtering.

## Non-Negotiable Architecture Rules

### Rule 1: Repair Center Is The Product

`/ops/repairs` is the main maintenance command center.

`Ops Inbox` must not remain a competing product entry point.

### Rule 2: Incident Intake Is An Engine

The incident intake layer can keep the internal name `ops-inbox`, but it is not the customer-facing product.

It owns:

```text
webhook normalization
fingerprinting
deduplication
severity
reopen logic
notification dispatch
raw payload storage
AI diagnosis storage
```

### Rule 3: Every Incident Must Belong To A Client Or Platform Tenant

No orphan production incident should exist without a client/platform association.

For platform incidents, use:

```text
client: awarewave-ops
```

### Rule 4: Every Repair Must Reference An Incident

Repair workflow must not duplicate incident data.

The relationship is:

```text
ops_incidents -> repair_runs
```

### Rule 5: No Second Dedup System

Repair Center must not implement its own fingerprinting or deduplication.

### Rule 6: Slack And Telegram Are Notification Surfaces

Slack and Telegram are not source-of-truth systems.

They may trigger shortcuts, approvals, and acknowledgements, but canonical state must live in Supabase.

### Rule 7: Secrets Are References, Not UI Data

Integration records may store:

```text
secret_ref
external_hint
api_metadata
status
last_error
```

They must not store raw tokens, bot secrets, webhook secrets, private keys, or passwords.

### Rule 8: AwareWave Must Dogfood The Same System

The platform itself must be monitored and repaired through the same model sold to clients.

No permanent special-case path should exist for AwareWave operations.

Use:

```text
awarewave-ops.type = client
awarewave-ops.metadata.client_kind = internal
awarewave-ops.metadata.relationship = first_party
```

Do not use `awarewave-ops.type = agency` inside the Repair OS product model.

## Target Data Model

Long-term model:

```text
organizations
  id
  slug
  name
  type
  status
  metadata

assets
  id
  organization_id
  type
  name
  url
  environment
  metadata

tenant_integration_bindings
  id
  organization_id
  asset_id
  provider
  status
  secret_ref
  external_hint
  api_metadata
  last_error

ops_incidents
  id
  organization_id
  asset_id
  source
  fingerprint
  severity
  status
  raw
  notification_log
  ai_diagnoses

repair_runs
  id
  incident_id
  policy
  state
  backup_status
  github_issue_url
  github_pr_url
  deploy_status
  audit_log
```

Current code uses `client_slug` as an incremental bridge. That is acceptable short term, but long term should move to `organization_id` and `asset_id`.

`organizations.type` should not decide whether an organization is maintained by Repair OS. Maintained organizations should be treated as clients. Platform ownership and operating authority should be represented through metadata, roles, memberships, billing, or admin permissions.

## Phased Execution Plan

### Phase 0: Freeze The Product Decision

Decisions:

```text
Repair Center is the product.
Ops Inbox is an internal engine.
Every maintained organization, including AwareWave, is a client.
Every monitored thing is an asset.
Every external connection is an integration.
```

No destructive deletion in this phase.

### Phase 1: Fix Data Foundation

Tasks:

```text
Verify and apply missing migrations.
Ensure tenant_integration_bindings exists in live DB.
Ensure ops_incidents can be scoped to client/platform.
Normalize AwareWave as an internal client.
Seed AwareWave assets.
Seed AwareWave integration records.
Backfill existing incidents to awarewave-ops where appropriate.
```

### Phase 2: Productize Integrations

Tasks:

```text
Create Integrations page.
Show integration status by client.
Show test/last error/last seen.
Connect onboarding results to integration records.
Expose safe setup instructions per provider.
```

### Phase 3: Rebuild Repair Center As The Main Console

Tasks:

```text
Add client and asset filters.
Add all incidents view inside Repair Center.
Add incident detail inside Repair Center.
Add AI diagnosis and raw evidence panels.
Add repair lifecycle timeline.
Add health and rules panel.
```

### Phase 4: Retire Ops Inbox From Product Navigation

Tasks:

```text
Remove Ops Inbox from main nav.
Redirect /ops/inbox to Repair Center incident view.
Redirect /ops/inbox/:id to Repair Center incident detail.
Keep /api/ops/inbox/health as internal health endpoint unless renamed later with compatibility.
```

### Phase 5: Customer-Ready Packaging

Tasks:

```text
Add product language.
Add customer-safe setup flows.
Add evidence reports.
Add role-based access.
Add tenant isolation checks.
Add backup and rollback proof.
Add integration health dashboard.
Add exportable repair report.
```

## What Not To Do

Do not:

```text
Delete ops_incidents.
Delete lib/ops-inbox before its responsibilities are renamed and migrated.
Make repair_runs store raw monitoring payloads.
Create another deduplication engine.
Let Slack or Telegram become the source of truth.
Keep Ops Inbox and Repair Center as equal product concepts.
Expose environment-variable setup as the customer experience.
Treat AwareWave platform operations as a permanent special case.
```

## Product Pitch Shape

The sellable product should be described like this:

```text
AwareWave Repair OS continuously watches every client website, app, server,
workflow, and integration. When something breaks, it classifies the incident,
notifies the right people, asks AI to diagnose the issue, verifies backup,
creates a controlled repair path, tracks approval and deployment, and stores
evidence for every action.
```

Short version:

```text
AI maintenance command center for every client asset.
```

## Final Decision

The system should converge to:

```text
Product surface:
  Repair Center
  Clients
  Integrations
  Approvals
  Deployments
  Settings

Internal engines:
  Incident intake
  Notification dispatch
  AI diagnosis
  Repair orchestration
  Command plane
  Audit log
```

This gives the product a clear buyer-facing shape while preserving the existing technical foundation.
