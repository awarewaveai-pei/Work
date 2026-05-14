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

## Implementation Log

### 2026-05-14: Client-Normalized Repair OS Foundation

Status:

```text
Source updated.
Build verified.
Live organization records normalized.
Live structural migration applied and verified.
```

Decisions locked:

```text
awarewave-ops is a client, not an agency, inside Repair OS.
awarewave-ops is marked as an internal first-party client through metadata.
soulful-expression is marked as an external customer through metadata.
Repair Center remains the product command center.
Ops Inbox remains an internal incident intake engine and compatibility surface.
```

Source changes:

```text
lobster-factory/packages/db/migrations/0028_repair_os_client_asset_scope.sql
  Seeds awarewave-ops as type=client.
  Adds metadata.client_kind=internal.
  Adds metadata.relationship=first_party.
  Creates the asset and integration scope needed for client-grade Repair OS.

lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/route.ts
  Exposes clientKind and relationship from organization metadata.

lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/clients/ClientCard.tsx
  Shows internal/external client identity instead of presenting awarewave-ops as a special agency.

lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/integrations/page.tsx
  Shows client identity and relationship on the Integrations page.
```

Live data changes completed:

```text
awarewave-ops.type = client
awarewave-ops.metadata.client_kind = internal
awarewave-ops.metadata.relationship = first_party

soulful-expression.type = client
soulful-expression.metadata.client_kind = external
soulful-expression.metadata.relationship = customer
```

Verification:

```text
npm run build passed in apps/next-admin.
Live organizations endpoint verified both awarewave-ops and soulful-expression as type=client.
Live assets endpoint verified 7 seeded AwareWave platform assets.
Live ops_incidents endpoint verified client_slug, organization_id, and asset_id columns.
Live repair_runs endpoint verified client_slug, organization_id, and asset_id columns.
Live tenant_integration_bindings endpoint verified table exists.
```

Remaining production work:

```text
Add provider-specific deep health adapters for integrations that can safely verify credentials against external APIs.
Add role-based access controls before exposing integration mutation controls to non-operator customer users.
```

Live migration note:

```text
Migration 0028 must be run as supabase_admin on self-hosted Supabase.
The postgres role in this environment is not a superuser and can fail on Supabase DDL event triggers.
```

### 2026-05-14: Customer-Facing Integration Controls

Status:

```text
Source updated.
Build verified.
Live integration slots seeded and verified.
Production app deployed.
```

Source changes:

```text
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/integrations/route.ts
  Adds POST for safe integration upsert.
  Adds PATCH for validate, activate, revoke, and mark_failed actions.
  Verifies organization and asset ownership before writing.
  Writes best-effort ops_audit_events for integration mutations.
  Stores secret references only; raw tokens are not accepted or required.

lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/integrations/IntegrationControls.tsx
  Adds customer/operator UI for creating integration slots.
  Adds row actions for validation, activation, and revocation.

lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/integrations/page.tsx
  Mounts the integration setup panel and per-row controls.

lobster-factory/packages/db/migrations/0029_repair_os_integration_slots.sql
  Seeds active AwareWave internal integration slots from known configured services.
  Seeds Soulful Expression Supabase as an external customer integration.
  Uses vault reference names only.
```

Live data changes completed:

```text
awarewave-ops active integrations:
  cloudflare
  grafana
  n8n
  netdata
  posthog
  sentry
  slack
  supabase
  trigger
  uptime_kuma

soulful-expression active integrations:
  supabase
```

Verification:

```text
npm run build passed in apps/next-admin.
Live tenant_integration_bindings endpoint verified 11 integration records.
All seeded integration records use vault: references, not raw secrets.
SG next-admin deployed commit c4e35a7.
Production GET /api/ops/integrations returned ok=true with assets, organizations, and 11 integrations.
Production PATCH /api/ops/integrations validate succeeded for awarewave-ops cloudflare.
```

Important boundary:

```text
This section is superseded by the Provider Health Adapter Validation section below.
The Validate action now calls provider adapters when an adapter is available.
The older c4e35a7 Cloudflare validation note was a registry-level validation, not proof that the live Cloudflare token was accepted by Cloudflare.
```

### 2026-05-14: Provider Health Adapter Validation

Status:

```text
Source updated.
Build verified.
SG environment prepared for provider credential references.
Production app deployed.
```

Source changes:

```text
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-os/integration-health.ts
  Adds provider-aware validation adapters.
  Supports deep API checks for Cloudflare, Sentry, Slack, PostHog, Supabase, n8n, Trigger.dev, and Grafana.
  Supports endpoint reachability checks for Netdata and Uptime Kuma where the current API surface is not yet standardized.
  Resolves credentials from vault-style secret_ref values such as vault:CLOUDFLARE_API_TOKEN.
  Never returns raw tokens in API responses or audit payloads.

lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/integrations/route.ts
  Validate now runs the provider adapter instead of only checking registry shape.
  Stores last_health_check in tenant_integration_bindings.api_metadata.
  Updates last_tested_at and last_seen_at from actual validation results.

lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/integrations/page.tsx
  Shows last tested time, last seen time, and latest health check summary.

lobster-factory/infra/hetzner-phase1-core/docker-compose.yml
  Passes integration health env names into next-admin.
```

SG environment changes completed:

```text
Provider adapter env references were added to /root/lobster-phase1/.env.
Remote .env was backed up before update.
All required AwareWave provider env references are present.
SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY remains empty on SG and must be filled before deep-validating Soulful Expression Supabase from next-admin.
```

Verification:

```text
npm run build passed in apps/next-admin.
SG next-admin deployed commit c6e52c3.
Production Validate passed for awarewave-ops: Sentry, Slack, Supabase, Uptime Kuma, Netdata, PostHog, Trigger.dev, n8n.
awarewave-ops n8n secret_ref corrected from vault:N8N_AUTH_BEARER_TOKEN to vault:N8N_API_KEY.
Production Validate failed for awarewave-ops Cloudflare with HTTP 401 even after switching to vault:CLOUDFLARE_AUTH_BEARER_TOKEN; the Cloudflare token must be rotated or corrected.
Production Validate failed for awarewave-ops Grafana because the seeded endpoint is not reachable from SG next-admin; replace the local-only endpoint with an SG-reachable Grafana URL or proxy.
```

### 2026-05-14: Grafana Internal Health Path

Status:

```text
Source updated.
Build verified.
Production deployed.
Grafana validation restored.
```

Why this change exists:

```text
Grafana is intentionally loopback-only on SG at 127.0.0.1:3009.
That is safe for human access through an SSH tunnel, but next-admin runs in Docker and cannot reach host loopback through host.docker.internal when Grafana is bound only to 127.0.0.1.
Repair OS therefore needs a separate internal container URL for provider validation.
```

Source changes:

```text
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-os/integration-health.ts
  Grafana validation now prefers GRAFANA_INTERNAL_BASE_URL when present.
  GRAFANA_BASE_URL remains available for the public/operator-facing hint.

lobster-factory/infra/hetzner-phase1-core/docker-compose.yml
  Passes GRAFANA_INTERNAL_BASE_URL into next-admin.
  Connects next-admin to the external lobster-phase1_observability Docker network.
```

Production intent:

```text
Keep Grafana public exposure closed.
Run the observability stack on SG.
Set GRAFANA_INTERNAL_BASE_URL=http://lobster-grafana-obs:3000 for next-admin provider health checks.
Keep operator access through SSH tunnel to 127.0.0.1:3009.
```

Verification:

```text
npm run build passed in apps/next-admin after adding GRAFANA_INTERNAL_BASE_URL support.
SG observability stack started: Loki, Promtail, and Grafana.
Live next-admin joined lobster-phase1_observability Docker network.
Live GRAFANA_INTERNAL_BASE_URL set to http://lobster-grafana-obs:3000.
next-admin container can reach Grafana /api/health with HTTP 200.
Repair OS production Validate for awarewave-ops Grafana now returns active with last_error=null.
```

### 2026-05-14: Cloudflare Credential Candidate Validation

Status:

```text
Source updated.
Build verified.
Production deployment pending.
Cloudflare token replacement still required.
```

Why this change exists:

```text
Cloudflare validation should not fail forever because one secret_ref points to a stale token while a fallback env contains a valid replacement.
The provider adapter should try known credential candidates safely and record which env names were tried without exposing token values.
```

Source changes:

```text
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-os/integration-health.ts
  Cloudflare validation now tests secret_ref plus fallback env candidates.
  Returns active on the first accepted token.
  Returns failed with tried_credential_envs metadata when all configured candidates are rejected.
```

Current production finding:

```text
Both configured SG Cloudflare token candidates are present, but Cloudflare /client/v4/user/tokens/verify returns HTTP 401 Invalid API Token for both.
Repair OS cannot make Cloudflare active until a valid Cloudflare API token is provided and synced to SG.
```

Verification:

```text
npm run build passed in apps/next-admin after Cloudflare credential candidate validation changes.
```

### 2026-05-14: Tenant Credential Isolation Guard

Status:

```text
Source updated.
Build verified.
Production deployed.
Tenant isolation verified.
```

Why this change exists:

```text
When an integration record has an explicit vault:SECRET_REF, validation must use that exact secret.
It must not silently fall back to another customer's generic credential, because that can make a tenant integration look healthy with the wrong tenant's authority.
```

Source changes:

```text
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-os/integration-health.ts
  Generic token resolution now treats an explicit vault: reference as authoritative.
  Fallback env names are used only when the integration does not specify a vault: reference.
  Cloudflare keeps its candidate-testing behavior because Cloudflare is a first-party provider credential, not a tenant-specific Supabase service role.
```

Verification:

```text
npm run build passed in apps/next-admin after tenant credential isolation changes.
SG next-admin deployed commit c62922e.
Production Validate for soulful-expression Supabase now fails honestly with missing SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY.
Production Validate for awarewave-ops Supabase remains active.
```

### 2026-05-14: Remaining Credential Inputs

Status:

```text
Architecture and runtime behavior are now explicit.
The remaining failures require external credential/channel values, not more guessing in code.
```

Open inputs:

```text
Cloudflare:
  Both configured Cloudflare token env candidates are present on SG.
  Cloudflare token verification returns HTTP 401 Invalid API Token for both.
  Required action: create or locate a valid Cloudflare API token and sync it to SG.

Soulful Expression Supabase:
  SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY is empty locally and missing on SG.
  Production Validate now correctly marks soulful-expression Supabase failed instead of using another tenant's key.
  Required action: add the Soulful Expression Supabase service role key to local vault/user env and SG .env.

Slack GitHub PR digest:
  SLACK_GITHUB_PRS_CHANNEL_ID is not configured.
  Slack conversations.list cannot be used with the current token because Slack returns missing_scope for channel listing.
  Required action: either provide SLACK_GITHUB_PRS_CHANNEL_ID directly or add channel listing scopes to the Slack token.
```

Current clean state:

```text
Grafana is active through internal Docker networking.
AwareWave Supabase is active with its own explicit secret_ref.
Soulful Expression Supabase is failed until its own key is provided.
Cloudflare is failed until a valid API token is provided.
External digest reads Telegram and configured Slack channels; GitHub PR channel remains unconfigured.
```

### 2026-05-14: Integrations Action Required Panel

Status:

```text
Source updated.
Build verified.
Production deployed.
Production page verified.
```

Why this change exists:

```text
The system should not require the operator to read API logs or architecture notes to know why a customer connection is not production-clean.
/ops/integrations must make external credential and channel blockers visible as actionable work.
```

Source changes:

```text
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/integrations/page.tsx
  Adds an Action required section above the customer connection list.
  Converts known failure modes into operator-readable next steps.
  Covers Cloudflare invalid token, tenant Supabase missing service role key, generic failed integrations, and missing SLACK_GITHUB_PRS_CHANNEL_ID for external signal digest.
```

Verification:

```text
npm run build passed in apps/next-admin after adding the Action required panel.
SG next-admin deployed commit af0cddb.
Production /ops/integrations rendered with Action required items for Cloudflare, Soulful Expression Supabase, and missing SLACK_GITHUB_PRS_CHANNEL_ID.
```

### 2026-05-14: Integration RBAC And Admin Boundary

Status:

```text
Source updated.
Build verified.
Production deployed.
Live nginx boundary applied.
```

Why this change exists:

```text
/ops/integrations is where a customer or operator connects AI, diagnostics, alerting, monitoring, and repair-provider tools.
For a sellable Repair OS, this must not be an unscoped internal shortcut.
It must be a clear customer-facing integration surface with explicit permissions and audit records.
```

Source changes:

```text
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/integrations/route.ts
  POST now requires owner/admin via canWriteTenantConfig.
  PATCH validate allows owner/admin/operator.
  PATCH activate, revoke, and mark_failed require owner/admin.
  Audit events now record the resolved actor role and role source.

lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/aware-wave-app-api-subdomains.conf
  Adds a more-specific /api/ops/integrations location before the generic /api/ops/ block.
  Protects integration mutation APIs with the same Basic Auth admin boundary used by /ops pages.
  Sets x-ops-claims-role admin for the current production admin boundary.
```

Current boundary:

```text
Today, production /ops/integrations is admin-facing.
It is safe for AwareWave internal operation and early customer onboarding.
Before exposing this directly to customer employees, replace the Basic Auth admin mapping with real customer-scoped auth claims.
The API already has action-level role checks, so future customer auth can be introduced without rewriting the integration model.
```

Verification:

```text
npm run build passed in apps/next-admin after RBAC and nginx source changes.
Build warnings are existing Sentry configuration and ssh2 optional dependency warnings; they do not block the production build.
SG next-admin deployed commit e00625e.
Live system nginx reloaded with the /api/ops/integrations admin block.
Old backup files were moved out of /etc/nginx/sites-enabled so nginx no longer loads duplicate app.aware-wave.com/api.aware-wave.com server blocks.
Live /etc/nginx/snippets/ops-proxy-headers.inc was synchronized to match next-admin OPS_PROXY_SHARED_SECRET.
Unauthenticated https://app.aware-wave.com/api/ops/integrations returns 401 at nginx.
Direct app access without the trusted proxy header returns 403.
Direct app access with the live proxy secret and admin claim returns 200 and lists organizations/integrations.
```

### 2026-05-14: External Signals Digest Boundary

Status:

```text
Source updated.
Build verified.
Production deployed.
Live nginx proxy header snippet corrected.
```

Why this change exists:

```text
Slack, Telegram, webhooks, and the app were previously easy to compare incorrectly because they enter the system through different pipes.
Repair OS needs one readable operator digest during AO-RESUME without turning /ops/inbox back into a second maintenance center.
```

Source changes:

```text
lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/inbox/digest/route.ts
  Adds GET /api/ops/inbox/digest?since=<ISO timestamp>.
  Authenticates with Bearer OPS_INBOX_INGEST_TOKEN.
  Reads Telegram command_requests since the requested timestamp.
  Caps lookback to 48 hours and response size to 50 messages.
  Returns compact digest messages for AO-RESUME and external signal comparison.
  Normalizes command labels so persisted commands with or without a leading slash render as one slash only.

.gitignore
  Ignores agency-os/.agency-state/external-signals-digest.json because it is local runtime state, not source.

lobster-factory/infra/hetzner-phase1-core/nginx/system-sites/ops-proxy-headers.inc
  Removes duplicate x-ops-proxy-auth assignment.
  Keeps client spoofing protection by overwriting client-provided proxy headers exactly once.
```

Boundary:

```text
/api/ops/inbox/digest is an internal compatibility/read-model endpoint.
It does not make /ops/inbox a buyer-facing product surface.
Repair Center remains the main maintenance command center.
Slack digest collection remains in scripts/fetch-external-signals.ps1 through Slack conversations.history.
Telegram digest collection uses command_requests because Telegram commands are already persisted there.
```

Verification:

```text
npm run build passed in apps/next-admin after adding /api/ops/inbox/digest.
Build output includes the new dynamic route /api/ops/inbox/digest.
Build warnings are the same existing Sentry configuration and ssh2 optional dependency warnings.
SG next-admin deployed commit eaa3332.
Live /etc/nginx/snippets/ops-proxy-headers.inc now has a single x-ops-proxy-auth assignment matching next-admin OPS_PROXY_SHARED_SECRET.
Unauthenticated https://app.aware-wave.com/api/ops/inbox/digest returns 401 unauthorized.
Authenticated digest request with OPS_INBOX_INGEST_TOKEN returns 200 and a compact messages array.
Local AO-RESUME digest generated successfully: Telegram ok with unread messages; Slack partial because the GitHub PRs channel ID is not configured yet.
```
