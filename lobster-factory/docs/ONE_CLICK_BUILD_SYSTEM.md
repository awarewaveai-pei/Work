# One-Click Build System

> Version: v2.1
> Date: 2026-05-03
> Owner: Lobster Factory / AO
> Status: implementation spec, not marketing copy
> Canonical production URL: `https://app.aware-wave.com/build`
> Current app entry: `infra/hetzner-phase1-core/apps/next-admin/app/build`

This document defines the real one-click system for generating and deploying client websites and internal AO infrastructure. It is aligned with:

- `LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md`, Section 41
- `LOBSTER_FACTORY_DEPLOYMENT_CHECKLIST_v1.4.md`, Section 24A
- `LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`
- Current Build Console implementation in `next-admin`

## 0. Decision

The one-click system is not a button that blindly deploys production.

It is a guarded Build Console with two modes:

| Mode | Purpose | Writes DB | Executes provider / WordPress changes | Allowed by default |
|---|---|---:|---:|---:|
| `plan_only` | Generate the deployment plan, gates, smoke tests, blockers, and handoff shape | No | No | Yes |
| `enqueue` | Create a guarded run record for execution by workflows/adapters | Yes, `ops_action_runs` now; `workflow_runs` later | Not directly from UI | Yes, only if profile gates pass |

The UI must never execute high-risk production changes directly. It creates a plan or queues a controlled run. Durable workflows, approvals, provider adapters, smoke tests, rollback, and handoff reports do the actual delivery work.

## 1. Product Boundary

The app must support three deployment profiles:

| Profile | Scenario | Site state | Apply mode | Workflow target | Smoke profile | Risk |
|---|---|---|---|---|---|---|
| Profile A | AO-agent / aware-wave.com internal control plane | Internal tools controlled by AO | `internal_setup` | `ao_infrastructure_check` | `internal` | Medium or High |
| Profile B | New customer, full cloud, for example Mongolia Travel | No existing WordPress | `full_install` | `create_wp_site` | `basic` / `business` / `woocommerce` | Medium |
| Profile C | Existing WordPress adoption, for example Soulful Expression | Existing live WP with real content | `adopt_delta` | `adopt_client_os` | `adopt` | High |

The Build Console is an operator surface. The system of record is Supabase/Postgres. Trigger.dev is the long-running workflow layer. WordPress is the delivery surface, not the control plane.

### 1.1 Naming and scope layers (SSOT for “AO-agent”)

Two layers must stay separate in specs, tickets, and automation. **Do not merge them into one overloaded term.**

| Layer | Meaning | Authoritative text |
|------|---------|--------------------|
| **Product / company** | Aware Wave + Lobster Factory + Agency OS deliver **Client OS** end-to-end (new site, adopt existing site, internal control plane). This is the **whole business system** described in `LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md` §0 and `agency-os/docs/overview/ao-lobster-operating-model.md`. | §0 “一鍵生成雲端版 Client OS”; AO+Lobster operating model |
| **Build Console routing** | **`Profile A` / `Profile B` / `Profile C`** are **mutually exclusive execution paths** in `/build`: different workflows, smoke tests, gates, and artifacts. | This file §1 table; Master §41 |

**Invariant:** In code and DB records, use **`profile_a` | `profile_b` | `profile_c`** (or the same labels in UI copy). When someone says “AO-agent” in conversation, confirm whether they mean **(a)** the whole agency automation stack **or** **(b)** **Profile A only** (internal control plane). In Master §41 and in this document, **`AO-agent` names Profile A**—the path that **does not** run `provision_client_os` and **does not** emit a **client** `handoff_report` (see Master §41.2 and §7 below).

**Related:** `LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md` Section 41; `agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md` §0 (platform map).

## 2. Current Implementation

Implemented now:

| Area | Path | Status |
|---|---|---|
| Build Console UI | `infra/hetzner-phase1-core/apps/next-admin/app/build` | Exists |
| Profile plan contract | `infra/hetzner-phase1-core/apps/next-admin/lib/build-console/contracts.ts` | Exists |
| API route | `infra/hetzner-phase1-core/apps/next-admin/app/api/build/runs/route.ts` | Exists |
| Sidebar link | `infra/hetzner-phase1-core/apps/next-admin/app/layout.tsx` | Exists |
| CSS | `infra/hetzner-phase1-core/apps/next-admin/app/globals.css` | Exists |
| Action catalog seed | `packages/db/migrations/0021_seed_build_console_actions.sql` | Exists |

Current app route:

```text
Production: https://app.aware-wave.com/build
Local dev:  http://127.0.0.1:3002/build
```

Current API:

```text
Production: POST https://app.aware-wave.com/api/build/runs
Local dev:  POST http://127.0.0.1:3002/api/build/runs
```

Current action keys:

```text
ops.profile-a.ao-infrastructure-check
ops.profile-b.create-wp-site
ops.profile-c.adopt-client-os
```

## 3. Non-Negotiable Rules

1. A run must identify exactly one profile before execution.
2. `plan_only` must be safe: no provider calls, no WordPress changes, no production changes.
3. `enqueue` may write a guarded run record, but must not bypass workflow gates.
4. Production actions require `approval_request`.
5. High-risk actions require approval, resource lock, rollback plan, and audit trail.
6. Profile C must never use `full_install`.
7. Profile C must never overwrite existing content, theme, plugins, forms, SMTP, DNS, checkout, or tracking without explicit approval.
8. Profile C must have `backup_ref` before any delta apply.
9. Failed required smoke tests block handoff.
10. Secrets must never appear in handoff reports, logs, artifacts, or UI output.
11. Provider failure creates `operator_task`; it does not silently succeed.
12. **Profile B and Profile C** client-facing completion must include a structured handoff report. **Profile A** completes with an **internal** infrastructure status report (no client handoff); see §1.1 and §7.

## 4. Build Console User Flow

```text
Operator opens /build
  -> selects Profile A / B / C
  -> fills minimal profile-specific inputs
  -> chooses plan_only or enqueue
  -> Build Console validates gates
  -> Build Console generates BuildPlan
  -> if plan_only:
       returns plan, blockers, stages, smoke profile, handoff artifacts
  -> if enqueue:
       requires organization_id
       verifies action catalog entry
       inserts ops_action_runs
       writes ops_audit_events
       returns queued run + trace_id
```

Production operators should enter through:

```text
https://app.aware-wave.com/
```

The dashboard links to:

```text
https://app.aware-wave.com/build
```

`app.aware-wave.com` is the canonical tools host. Do not move this UI to `aware-wave.com/admin` or to a new standalone domain.

The next layer, not yet fully wired, is:

```text
ops_action_runs
  -> workflow dispatcher
  -> Trigger.dev durable workflow
  -> provider adapter / WP adapter
  -> smoke tests
  -> artifacts + handoff report
  -> final status in Supabase
```

## 5. Shared Request Contract

The API accepts this shape:

```ts
type BuildProfile = "profile_a" | "profile_b" | "profile_c";
type BuildExecutionMode = "plan_only" | "enqueue";
type BuildEnvironment = "staging" | "production";
type BuildPackageSlug = "wp-basic" | "wp-business" | "wc-core";
type WpSiteType = "tourism" | "brand" | "ecommerce"; // see WP_CLIENT_PLUGIN_STACK.md §八

interface BuildRunRequest {
  profile: BuildProfile;
  executionMode: BuildExecutionMode;
  environment?: BuildEnvironment;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  siteId?: string;
  actorUserId?: string;
  clientName: string;
  domain?: string;
  siteUrl?: string;
  wpAdminUrl?: string;
  packageSlug?: BuildPackageSlug;       // derived from wpSiteType + hasEcommerce when both present
  wpSiteType?: WpSiteType;              // tourism | brand | ecommerce — from OnboardWizard Step 2
  hasEcommerce?: boolean;               // drives ecommerce module inclusion (forced true when wpSiteType === "ecommerce")
  pluginSlugs?: string[];               // resolved installable slug list (free + alternativeSlug fallbacks) — see WP_CLIENT_PLUGIN_STACK.md §八.2
  provider?: "awarewave-internal" | "hostinger" | "cloudways" | "generic-wordpress" | "manual";
  locale?: string;
  credentialsRef?: string;
  backupRef?: string;
  backupConfirmed?: boolean;
  notes?: string;
  integrations?: BuildIntegrations;     // service wiring: Uptime Kuma, Sentry, PostHog, n8n, MainWP
}
```

> **Plugin stack fields** (`wpSiteType`, `hasEcommerce`, `pluginSlugs`) are wired (2026-05-13). Operator selects in OnboardWizard Step 2; resolved list comes from [`WP_CLIENT_PLUGIN_STACK.md`](../../agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md) §八 via [`wp-plugin-stack-catalog.ts`](../infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts). Implementation history: `PLAN_WP_PLUGIN_STACK_AUTOINSTALL.md`.

Validation rules:

| Field | Rule |
|---|---|
| `profile` | Required |
| `executionMode` | Defaults to `plan_only` |
| `organizationId` | Required only for `enqueue` |
| `clientName` | Required |
| `domain` | Required for Profile B |
| `siteUrl` | Required for Profile C |
| `wpAdminUrl` | Required gate for Profile C plan readiness |
| `credentialsRef` | Required gate for Profile C enqueue; never paste raw credentials |
| `backupRef` | Required gate for Profile C enqueue |
| `backupConfirmed` | Required gate for Profile C enqueue |

## 6. BuildPlan Contract

Every profile returns a BuildPlan:

```ts
interface BuildPlan {
  profile: BuildProfile;
  label: string;
  actionKey: string;
  workflowId: string;
  applyMode: "internal_setup" | "full_install" | "adopt_delta";
  siteType: "internal_control_plane" | "new_wordpress" | "existing_wordpress";
  riskLevel: "low" | "medium" | "high";
  approvalRequired: boolean;
  productionDeployAllowed: boolean;
  packageSlug: BuildPackageSlug | null;
  provider: string;
  smokeProfile: "internal" | "basic" | "business" | "woocommerce" | "adopt";
  stages: BuildPlanStage[];
  requiredEvidence: string[];
  smokeTests: string[];
  handoffArtifacts: string[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
}
```

`blockers` means the run must not enqueue. `warnings` means the operator must review, but `plan_only` may still return.

## 7. Profile A: AO-Agent Internal Infrastructure

Profile A is for aware-wave.com internal control plane operations.

### Inputs

| Field | Required | Default |
|---|---:|---|
| `clientName` | Yes | `AwareWave Ops` |
| `domain` | Yes | `aware-wave.com` |
| `provider` | Yes | `awarewave-internal` |
| `environment` | Yes | `staging` |

### Apply Mode

```text
internal_setup
```

### Workflow

```text
ao_infrastructure_check
```

Profile A must not use `create_wp_site` or `provision_client_os`.

### Stages

1. Control-plane precheck
2. Supabase staging/production separation check
3. RLS tenant isolation smoke
4. Cloudflare Access check
5. Trigger.dev / n8n / Sentry / PostHog / Uptime Kuma health check
6. Netdata check only where AO self-manages a server
7. AO infrastructure status report

### Required Evidence

- Supabase staging and production separation
- Trigger.dev reachable
- n8n reachable
- Cloudflare Access policy evidence
- RLS isolation smoke result
- Monitoring endpoint status

### Output

Profile A produces an internal status report, not a client handoff report.

```json
{
  "profile": "profile_a",
  "domain": "aware-wave.com",
  "environment": "staging",
  "checks": [],
  "blockers": [],
  "next_actions": []
}
```

## 8. Profile B: New Customer Full Cloud

Profile B is the default customer path. It assumes the customer does not already have a WordPress site.

Example: Mongolia Travel.

### Inputs

| Field | Required | Example |
|---|---:|---|
| `clientName` | Yes | `Mongolia Travel` |
| `domain` | Yes | `scenerytravelmongolia.com` |
| `provider` | Yes | `hostinger` |
| `packageSlug` | Yes | `wp-basic` |
| `locale` | Yes | `en_US` |

### Apply Mode

```text
full_install
```

### Workflow

```text
create_wp_site
```

Current repo implementation name:

```text
packages/workflows/src/trigger/create-wp-site.ts
```

### Stages

1. Create registry records
2. Provision staging WordPress through provider adapter
3. Apply package manifest (theme + postInstall + operational plugins — see [`WP_CLIENT_PLUGIN_STACK.md`](../../agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md) §八.1 boundary rule)
3.5. Install user-facing plugin stack via `wp-install-plugins` task (`pluginSlugs[]` from Wizard Step 2 → WP-CLI install + activate)
4. Install and connect MainWP Child
5. Register monitoring
6. Run smoke tests
7. Generate handoff report
8. Request approval before production promotion

### Provider Behavior

| Provider | Expected behavior |
|---|---|
| `hostinger` | Provision WordPress if credentials/API are available |
| `cloudways` | Provision Cloudways app if configured |
| `generic-wordpress` | Use existing reachable WP plus WP REST / WP-CLI path |
| `manual` | Create `operator_task` and resume workflow after operator inputs admin URL |

Provider failure must create an `operator_task`.

### Package and Smoke Mapping

| Package | Smoke profile | Required checks |
|---|---|---|
| `wp-basic` | `basic` | Homepage 200, wp-admin reachable, SSL valid, contact form reachable |
| `wp-business` | `business` | Basic checks plus lead capture / CRM / SEO baseline |
| `wc-core` | `woocommerce` | Woo checks; payment gateway is advisory, not required |

### Required Handoff Fields

```json
{
  "profile": "profile_b",
  "client": {},
  "site": {},
  "provider": {},
  "package": {},
  "manifest": {},
  "mainwp_site_id": null,
  "monitoring": {},
  "smoke_tests": {},
  "approval_requests": [],
  "operator_tasks": [],
  "artifacts": []
}
```

## 9. Profile C: Existing WordPress Adoption

Profile C is the highest-risk path. It is for adopting or migrating an existing WordPress site with real content and customer data.

Default case URL in the Build Console is `https://soulfulexpression.com/`. Repo and public evidence may also reference `https://soulfulexpression.org/`; confirm the canonical domain before enqueue.

### Inputs

| Field | Required | Example |
|---|---:|---|
| `clientName` | Yes | `Soulful Expression` |
| `siteUrl` | Yes | `https://soulfulexpression.com/` |
| `wpAdminUrl` | Yes | `https://soulfulexpression.com/wp-admin` |
| `credentialsRef` | Yes | `vault://wordpress/soulful-expression` |
| `backupRef` | Yes | `hostinger-backup-20260503` |
| `backupConfirmed` | Yes | `true` |
| `packageSlug` | Yes | `wp-basic` |

### Apply Mode

```text
adopt_delta
```

### Workflow

```text
adopt_client_os
```

Profile C must not use `create_wp_site` or `full_install`.

### Mandatory Flow

1. Create or confirm Supabase records
2. Confirm credential reference
3. Create backup and write `backup_ref`
4. Run adopt audit
5. Classify delta manifest items
6. Create approval request for risky items
7. Apply only safe delta items
8. Run adopt smoke tests
9. Roll back immediately if required checks fail
10. Generate adoption handoff report

### Adopt Classification

| Classification | Meaning | Action |
|---|---|---|
| `safe_to_install` | Missing and safe to add | Install |
| `skip_install` | Already installed or not needed | Skip |
| `update_required` | Installed but old/risky | Create `approval_request` |
| `conflict` | Conflicts with existing stack | Create `operator_task` |

### Must Not Change Without Explicit Approval

- Existing content
- Existing theme
- Existing forms
- Existing SMTP settings
- Existing checkout/payment settings
- Existing SEO redirects/canonicals
- Existing tracking snippets
- DNS records
- User roles and admin accounts

### Adopt Smoke Tests

All required checks must pass:

| Check | Required |
|---|---:|
| `homepage_status_unchanged` | Yes |
| `existing_content_count_unchanged` | Yes |
| `no_new_php_errors` | Yes |
| `wp_admin_accessible` | Yes |
| `ssl_valid` | Yes |
| `existing_forms_functional` | Yes |
| `mainwp_child_connected` | Yes |
| `uptime_monitor_registered` | Yes |

If `homepage_status_unchanged` or `existing_content_count_unchanged` fails, rollback is mandatory.

### Required Handoff Fields

```json
{
  "profile": "profile_c",
  "site_before": {},
  "backup_ref": "hostinger-backup-20260503",
  "adopt_audit": {},
  "delta_manifest": {},
  "plugins_added": [],
  "plugins_skipped": [],
  "pending_approvals": [],
  "operator_tasks": [],
  "smoke_tests": {},
  "rollback_ref": null,
  "residual_risks": []
}
```

## 10. Data Model

Current tables already relevant:

| Table | Current use |
|---|---|
| `organizations` | Tenant/customer org |
| `workspaces` | Work scope |
| `projects` | Delivery project |
| `sites` | Site record |
| `environments` | Local/staging/production |
| `workflow_runs` | Durable workflow execution |
| `package_install_runs` | Manifest/package install execution |
| `ops_action_catalog` | Operator action registry |
| `ops_action_runs` | Current Build Console queued run record |
| `ops_audit_events` | Audit event stream |
| `approval_policies` | Approval rule definitions |
| `approval_requests` | Actual approval requests |

Tables or fields still required for full one-click delivery:

| Gap | Required shape |
|---|---|
| `sites.site_type` | `new_client` / `existing_wp` / `ao_internal` |
| `sites.apply_mode` | `full_install` / `adopt_delta` / `internal_setup` |
| `sites.wp_site_type` | `tourism` / `brand` / `ecommerce` — populated from OnboardWizard Step 2 |
| `package_install_runs.result_summary` (JSONB) | Per-plugin row stores `{ plugin_slug, status: "installed"\|"skipped_license"\|"failed", version, error_message }` — zero-migration approach, written by `wp-install-plugins` task |
| `adopt_audits` | Profile C audit header |
| `adopt_audit_items` | Profile C item-level classification |
| `smoke_test_results` | Smoke test results per run |
| `handoff_reports` | Structured delivery report |
| `operator_tasks` | Manual fallback / conflict resolution |
| `resource_locks` | Prevent concurrent high-risk site workflows |
| `idempotency_keys` | Prevent duplicate step execution |

## 11. Workflow Mapping

| Canonical workflow | Current or target implementation | Profile |
|---|---|---|
| `ao_infrastructure_check` | Target workflow | A |
| `create_wp_site` | `packages/workflows/src/trigger/create-wp-site.ts` | B |
| `apply_manifest` | `packages/workflows/src/trigger/apply-manifest.ts` | B |
| `adopt_client_os` | Target workflow | C |
| `run_smoke_tests` | Target shared workflow | B/C |
| `generate_handoff_report` | Target shared workflow | B/C |
| `rollback_site` | Target Profile C rollback workflow | C |

The current Build Console queues `ops_action_runs`. The next implementation step is a dispatcher that converts those action runs into the correct durable workflow invocation.

## 12. Approval Policy

Approval is required for:

- Any production deployment
- Any Profile C `update_required` item
- Any Profile C conflict resolution that changes existing behavior
- DNS changes
- Payment gateway changes
- WooCommerce checkout changes
- Backup restore
- Security plugin removal or downgrade
- Bulk SEO changes on production

Rejected or expired approval blocks execution.

The system must use:

```text
approval_policies
approval_requests
```

Do not introduce a generic `approvals` table.

## 13. Rollback Rules

| Profile | Rollback rule |
|---|---|
| A | Roll back infra/config by versioned deployment path |
| B | Roll back staging or production deploy via provider snapshot/manifest rollback |
| C | Restore to pre-adopt backup snapshot if required smoke test fails |

Rollback artifacts must include:

```json
{
  "rollback_ref": "...",
  "backup_ref": "...",
  "triggered_by": "workflow",
  "reason": "...",
  "started_at": "...",
  "ended_at": "...",
  "status": "completed"
}
```

## 14. Observability and Artifacts

Every queued or executed run must produce:

- `trace_id`
- run status
- input snapshot
- output snapshot
- gate results
- smoke test results
- artifact references
- audit events
- incident or operator task on failure

Expected observability integrations:

| Tool | Use |
|---|---|
| Supabase/Postgres | System of record |
| Sentry | Workflow/app exceptions |
| PostHog | Console usage and product analytics |
| Uptime Kuma | Site and endpoint monitoring |
| MainWP | WordPress fleet maintenance |
| Cloudflare | DNS, WAF, Access |
| Netdata | Only where AO self-manages servers |

## 15. Security

Rules:

1. Store secrets in vault or environment variables only.
2. UI accepts `credentialsRef`, not raw passwords.
3. Handoff reports must redact secrets.
4. Internal tools must be protected by Cloudflare Access or equivalent.
5. Production mutations must require owner/admin approval.
6. Service role keys must never reach the browser.
7. Manual tasks must describe the action without leaking credentials.

## 16. API Behavior

### `POST /api/build/runs`

`plan_only` success:

```json
{
  "ok": true,
  "run": {
    "status": "planned",
    "executionMode": "plan_only",
    "plan": {}
  }
}
```

`plan_only` with profile blockers:

```json
{
  "ok": true,
  "run": {
    "status": "blocked",
    "executionMode": "plan_only",
    "plan": {
      "blockers": []
    }
  }
}
```

`enqueue` with blockers:

```json
{
  "ok": false,
  "error": "profile_gate_blocked",
  "details": "backupRef is required before adopt_delta"
}
```

`enqueue` success:

```json
{
  "ok": true,
  "run": {
    "status": "queued",
    "supabaseRunId": "...",
    "traceId": "build-console-..."
  }
}
```

## 17. UI Requirements

The `/build` UI must show:

- Profile selector
- Execution mode selector
- Environment selector
- Profile-specific form fields
- Actor role in local/staging simulation
- Profile gates
- Blockers and warnings
- Stage list
- Smoke test list
- Plan/output JSON

The UI must not hide blockers. It must make Profile C backup and credentials reference state obvious before enqueue.

## 18. MVP Definition

MVP is not "all providers fully automated."

MVP is:

1. Profile B can create a complete `plan_only` plan.
2. Profile B can enqueue a guarded run with org/workspace/project/site IDs.
3. A dispatcher can invoke `create_wp_site`.
4. Provider adapter can be `manual` fallback.
5. `apply_manifest` can run in staging.
6. Basic smoke tests are stored.
7. Handoff JSON is generated.
8. Production remains approval-gated.

This is enough to deliver Mongolia Travel with controlled manual fallback.

## 19. Phase Roadmap

### Phase 1: Build Console Control Surface

- canonical host: `https://app.aware-wave.com`
- `/build` UI
- `/api/build/runs`
- Profile plans
- action catalog seed
- `plan_only`
- guarded `enqueue`

### Phase 2: Dispatcher

- Poll or subscribe to `ops_action_runs`
- Invoke correct Trigger.dev workflow
- Map action run to `workflow_runs`
- Update terminal status

### Phase 3: Profile B Delivery

- Provider adapter contract tests
- Hostinger or ManualTaskAdapter path
- `create_wp_site` end-to-end staging run (orchestration of Stage 3 manifest + Stage 3.5 plugin stack now wired — runs gated by `LOBSTER_EXECUTE_MANIFEST_STEPS=true`)
- MainWP connection
- Basic smoke tests
- Handoff report

### Phase 4: Profile C Adoption

- `site_type` and `apply_mode`
- `adopt_audits`
- `adopt_audit_items`
- adopt delta manifest
- adopt smoke tests
- rollback workflow

### Phase 5: Profile A Infrastructure

- AO health workflow
- RLS isolation smoke
- Cloudflare Access verification
- internal status report

## 20. Acceptance Checklist

Before calling this system usable:

- [ ] `/build` loads
- [ ] Profile A plan returns `internal_setup`
- [ ] Profile B plan returns `full_install`
- [ ] Profile C plan returns `adopt_delta`
- [ ] Profile C without backup is blocked
- [ ] `enqueue` requires `organizationId`
- [ ] `enqueue` writes `ops_action_runs`
- [ ] `enqueue` writes `ops_audit_events`
- [ ] action catalog contains all three action keys
- [ ] production plans show approval warning
- [ ] production enqueue cannot bypass approval
- [ ] Profile B can trigger `create_wp_site`
- [ ] Profile C can trigger `adopt_client_os`
- [ ] required smoke tests are persisted
- [ ] Profile B/C: client handoff report is generated and linked to run; Profile A: internal status report is generated and linked (see §1.1)
- [ ] secrets are redacted

## 21. Known Gaps

These are not bugs in the Build Console; they are remaining system work:

- `adopt_client_os` workflow is not fully implemented.
- `ao_infrastructure_check` workflow is not fully implemented.
- Dispatcher from `ops_action_runs` to Trigger.dev is not implemented.
- Full Profile B provider automation depends on provider credentials/adapters.
- Profile C requires new adopt tables and rollback workflow.
- `site_type` / `apply_mode` DB migration still needs canonical implementation.
- **Plugin stack auto-install: implemented 2026-05-13**. SSOT = [`WP_CLIENT_PLUGIN_STACK.md`](../../agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md) §八. Boundary: Manifest handles theme + postInstall + operational plugins (`mainwp-child`, conditional `litespeed`); user-facing plugin list handled by `wp-install-plugins` task. SSH execution gated by `LOBSTER_EXECUTE_MANIFEST_STEPS=true` (default OFF, dry-run safe).
- `docs/hosting/*` is the canonical hosting adapter documentation path required by `npm run validate`; do not move those files under `docs/e2e/hosting`.

## 22. Verification Commands

Production route smoke after deploy:

```powershell
curl.exe -I https://app.aware-wave.com/build
```

If the tools host is protected by Basic Auth or Cloudflare Access, unauthenticated `curl` may return `401 Unauthorized`. That is acceptable for the public smoke; the authenticated browser check must reach the Build Console UI.

Next app build:

```powershell
cd <WORK_ROOT>\lobster-factory\infra\hetzner-phase1-core\apps\next-admin
cmd /c npm run build
```

Run dev server:

```powershell
cd <WORK_ROOT>\lobster-factory\infra\hetzner-phase1-core\apps\next-admin
cmd /c node node_modules\next\dist\bin\next dev -H 127.0.0.1 -p 3002
```

Profile B plan smoke:

```powershell
$body = @{
  profile = "profile_b"
  executionMode = "plan_only"
  clientName = "Mongolia Travel"
  domain = "scenerytravelmongolia.com"
  provider = "hostinger"
  packageSlug = "wp-basic"
  environment = "staging"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://127.0.0.1:3002/api/build/runs `
  -Method POST `
  -Body $body `
  -ContentType "application/json" `
  -Headers @{ "x-ops-simulated-role" = "operator" }
```

Profile C blocked smoke:

```powershell
$body = @{
  profile = "profile_c"
  executionMode = "plan_only"
  clientName = "Soulful Expression"
  siteUrl = "https://soulfulexpression.com/"
  wpAdminUrl = "https://soulfulexpression.com/wp-admin"
  provider = "generic-wordpress"
  packageSlug = "wp-basic"
  environment = "staging"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://127.0.0.1:3002/api/build/runs `
  -Method POST `
  -Body $body `
  -ContentType "application/json" `
  -Headers @{ "x-ops-simulated-role" = "operator" }
```

Expected Profile C result: `status = blocked`, with blockers for `credentialsRef`, `backupRef`, and `backupConfirmed`.

## 23. Deployment Target

This Build Console belongs on the existing tools host:

```text
https://app.aware-wave.com/build
```

Deployment target:

| Layer | Target |
|---|---|
| DNS | `app.aware-wave.com` → ks-aw-01（Cloudflare proxied） |
| Reverse proxy | host nginx `sg-stack.aware-wave.com` → lobster-nginx `:8083` → next-admin |
| Access | Supabase session gate；未登入回 `307 /login` |
| Local port | `127.0.0.1:3002` |
| Container | `lobster-next-admin` |
| App | `infra/hetzner-phase1-core/apps/next-admin` |

Repo evidence:

- `infra/hetzner-phase1-core/nginx/system-sites/sg-stack.aware-wave.com.conf`
- `infra/hetzner-phase1-core/nginx/default.conf`
- `infra/hetzner-phase1-core/docker-compose.yml`

Deploy only the Next tools app after code is merged:

```bash
cd /root/Work/lobster-factory/infra/hetzner-phase1-core
./deploy.sh next-admin
```

If the host uses Apache vhosts as the outer proxy, sync them first:

```bash
./deploy.sh --apache
./deploy.sh next-admin
```
