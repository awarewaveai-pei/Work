# Trigger.dev Task Reference

> **Who this is for**: operators running Lobster Factory tasks from the Trigger.dev dashboard or CLI.  
> **What each task does, what env vars it needs, and copy-paste test payloads.**  
> All UUIDs in payloads below are test sentinels — replace with real IDs for production runs.

---

## Environment Variables

Set these in Trigger.dev → Project → **Environment Variables** (or they are auto-synced on each deploy via `syncEnvVars` in `trigger.config.ts`):

| Variable | Required by | Notes |
|---|---|---|
| `LOBSTER_SUPABASE_URL` | all DB tasks | `https://supabase.aware-wave.com` |
| `LOBSTER_SUPABASE_SERVICE_ROLE_KEY` | all DB tasks | Secret — set as Secret type in dashboard |
| `LOBSTER_ENABLE_DB_WRITES` | all DB tasks | `"true"` to enable actual DB inserts (default: off) |
| `LOBSTER_MANIFEST_EXECUTION_MODE` | `apply-manifest` | `"off"` \| `"dry_run"` \| `"apply"` (default: `"off"`) |
| `LOBSTER_AO_ORG_ID` | `ao-infrastructure-check-schedule` | AwareWave org UUID for audit records |
| `TRIGGER_API_URL` | `ao-infrastructure-check` | `https://trigger.aware-wave.com` |
| `N8N_URL` | `ao-infrastructure-check` | n8n base URL |
| `UPTIME_KUMA_URL` | `ao-infrastructure-check` | Uptime Kuma base URL |
| `SENTRY_URL` | `ao-infrastructure-check` | Sentry base URL e.g. `https://sentry.aware-wave.com` |
| `POSTHOG_API_KEY` | all tasks | PostHog server-side project API key |
| `POSTHOG_HOST` | all tasks | `https://us.i.posthog.com` or self-hosted |
| `OPS_INBOX_INGEST_TOKEN` | `record-tenant-integration`, `orchestrate-tenant-provisioning` | Bearer token for AW webhook ingest |
| `AWAREWAVE_WEBHOOK_BASE_URL` | `record-tenant-integration`, `orchestrate-tenant-provisioning` | `https://app.aware-wave.com` |
| `COLLECT_SCHEDULE_INGEST_TOKEN` | `collect-scheduled-crawl` | Dedicated bearer token (never `OPS_INBOX_INGEST_TOKEN`) for `/api/internal/collect/run-due-schedules` |
| `SENTRY_AUTH_TOKEN` | `orchestrate-tenant-provisioning` | Sentry provisioning auth token |
| `SENTRY_ORG_SLUG` | `orchestrate-tenant-provisioning` | e.g. `aware-wave` |
| `TENANT_PROVISION_GITHUB_TOKEN` | `orchestrate-tenant-provisioning` | GitHub PAT with org:write scope |
| `POSTHOG_PERSONAL_API_KEY` | `orchestrate-tenant-provisioning` | PostHog personal API key |
| `N8N_API_KEY` | `orchestrate-tenant-provisioning` | n8n API key |
| `N8N_API_BASE_URL` | `orchestrate-tenant-provisioning` | n8n API base URL |
| `UPTIME_KUMA_API_KEY` | `orchestrate-tenant-provisioning` | Uptime Kuma API key |
| `TENANT_PROVISION_SUPABASE_ACCESS_TOKEN` | `orchestrate-tenant-provisioning` | Supabase management API token |

---

## Tasks

### `ao-infrastructure-check`

**What it does**: Pings all AwareWave control-plane services and runs an RLS isolation smoke test. No side effects — read-only. Safe to run at any time.

Checks (7 total): Supabase REST, Trigger.dev API, n8n, Uptime Kuma, Sentry (`/api/0/`), PostHog (`/_health`), RLS isolation smoke. Each check is `"skip"` if the corresponding env var is not set — no env var ever causes a failure by itself.

**Minimum payload** (can test immediately, no env vars required):
```json
{
  "organizationId": "11111111-1111-1111-1111-111111111111"
}
```

**Full payload** (override service URLs):
```json
{
  "organizationId": "11111111-1111-1111-1111-111111111111",
  "domain": "aware-wave.com",
  "supabaseUrl": "https://supabase.aware-wave.com",
  "triggerApiUrl": "https://trigger.aware-wave.com",
  "n8nUrl": "https://n8n.aware-wave.com",
  "uptimeKumaUrl": "https://uptime.aware-wave.com",
  "sentryUrl": "https://sentry.aware-wave.com",
  "posthogHost": "https://us.i.posthog.com"
}
```

**Expected output**: `{ status: "pass"|"fail", checks: [...], summary: { passed, failed, skipped } }`

---

### `ao-infrastructure-check-schedule`

**What it does**: Scheduled task — triggers `ao-infrastructure-check` every day at **04:00 UTC (12:00 TPE)**. Appears in the Trigger.dev Schedules tab.  
No payload needed — uses `LOBSTER_AO_ORG_ID` env var automatically.

---

### `dispatch-action-run`

**What it does**: Polls `ops_action_runs` table for pending records (up to 10 at a time) and routes each to the correct workflow by `action_key`:
- `ops.profile-a.ao-infrastructure-check` → `ao-infrastructure-check`
- `ops.profile-b.create-wp-site` → `create-wp-site`
- `ops.profile-c.adopt-client-os` → `adopt-client-os`

**Requires**: `LOBSTER_SUPABASE_URL` + `LOBSTER_SUPABASE_SERVICE_ROLE_KEY` + `LOBSTER_ENABLE_DB_WRITES=true`

**Test payload** (trigger manually — reads from DB, so works best when there are pending rows):
```json
{}
```

**Expected output**: `{ dispatched: 0, total: 0 }` when no pending runs.

---

### `dispatch-action-run-schedule`

**What it does**: Cron `*/10 * * * *` — **safety-net** backstop that triggers `dispatch-action-run` every 10 min.  
The PRIMARY dispatch path is on-demand: every `ops_action_runs` enqueue calls `kickActionRunDispatcher()`
(`next-admin/lib/kick-dispatcher.ts`) → immediate dispatch. This schedule only catches the rare case a kick
fails so an enqueued action is never silently stuck. Cadence was cut `*/1`→`*/10` on 2026-06-25 (the
every-minute poll spawned ~1,440 no-op runner containers/day; queue is usually empty). Do NOT remove entirely
— that reintroduces a single point of failure on the kick. Appears in Trigger.dev Schedules tab.

---

### `create-wp-site`

**What it does**: Profile B — creates a new WP staging environment record. Steps:
1. Validates input (siteName, manifestSlug, organizationId/workspaceId/projectId/siteId)
2. Resolves hosting adapter (`LOBSTER_HOSTING_ADAPTER`: `none|mock|provider_stub|http_json`)
3. Writes `workflow_runs` record to Supabase (if `LOBSTER_ENABLE_DB_WRITES=true`)
4. Runs integrations (Uptime Kuma, Sentry, PostHog, n8n, MainWP — only those provided in payload)
5. Returns `next` block with `apply-manifest` parameters for the operator to chain manually

**Phase 1 limitation**: Does NOT auto-chain to `apply-manifest`. The operator must trigger `apply-manifest` separately using the `next.applyManifestViaWorkflow` values from this task's output.

**Test payload** (mock adapter, no DB writes):
```json
{
  "organizationId": "11111111-1111-1111-1111-111111111111",
  "workspaceId": "22222222-2222-2222-2222-222222222222",
  "projectId": "33333333-3333-3333-3333-333333333333",
  "siteId": "44444444-4444-4444-4444-444444444444",
  "siteName": "demo-staging-site",
  "manifestSlug": "wp-basic"
}
```

**Expected output**: `{ status: "mock_staging_provisioned"|"vendor_staging_provisioned"|"pending_next_step", next: { applyManifestViaWorkflow: {...} } }`

---

### `apply-manifest`

**What it does**: Core install workflow — reads a manifest JSON, validates guardrails (staging-only), builds the install plan, optionally runs the shell install script, writes DB records.

**Shell execution**: Controlled by `LOBSTER_MANIFEST_EXECUTION_MODE`:
- `"off"` (default) — returns the install plan template; no shell is run
- `"dry_run"` — runs the install script in dry-run mode; no actual changes
- `"apply"` — installs plugins/themes on the WP root

**Important**: `wpRootPath` must be accessible from the machine running this task. For the EU Trigger.dev worker, this means the WP site must be on the same server. For local testing, use `<WORK_ROOT>\dummy` or any existing directory.

**Test payload** (dry-run on mock path, no DB writes):
```json
{
  "organizationId": "11111111-1111-1111-1111-111111111111",
  "workspaceId": "22222222-2222-2222-2222-222222222222",
  "projectId": "33333333-3333-3333-3333-333333333333",
  "siteId": "44444444-4444-4444-4444-444444444444",
  "environmentId": "55555555-5555-5555-5555-555555555555",
  "wpRootPath": "/tmp/lobster-mock-wp",
  "manifestPath": "packages/manifests/wp-basic.json",
  "manifestSlug": "wp-basic",
  "environmentType": "staging"
}
```

**Expected output**: `{ status: "pending_shell_execution"|"staging_shell_dry_run_complete"|"staging_shell_apply_complete", installPlan: {...}, shellExecution: {...} }`

---

### `adopt-client-os`

**What it does**: Profile C — integrates an existing WordPress site into Lobster Factory using `adopt_delta` mode. Steps:
1. Validates site is accessible (HTTP check)
2. Verifies backup is confirmed (`backupConfirmed: true` required)
3. Runs adopt audit (Phase 1: returns `manual_review` items — SSH/WP-CLI audit is Phase 2)
4. Creates `operator_tasks` rows for manual review items (if DB writes enabled)
5. Runs adopt smoke tests (homepage, wp-admin, SSL)
6. Runs integrations (Uptime Kuma, Sentry, PostHog, n8n, MainWP)
7. Generates handoff report

**Phase 1 limitation**: Audit step (`stepRunAdoptAudit`) is a stub — returns `manual_review` requiring operator to complete the audit manually. Real WP-CLI/SSH audit is Phase 2.

**Test payload**:
```json
{
  "organizationId": "11111111-1111-1111-1111-111111111111",
  "workspaceId": "22222222-2222-2222-2222-222222222222",
  "projectId": "33333333-3333-3333-3333-333333333333",
  "siteId": "44444444-4444-4444-4444-444444444444",
  "siteUrl": "https://example.com",
  "wpAdminUrl": "https://example.com/wp-admin",
  "credentialsRef": "vault:lobster/example-com/wp-admin",
  "backupRef": "backup-2026-01-01",
  "backupConfirmed": true,
  "packageSlug": "wp-basic"
}
```

**Expected output**: `{ status: "completed_audit_pending_manual"|"completed", steps: {...}, handoffReport: {...} }`

---

### `orchestrate-tenant-provisioning`

**What it does**: Fan-out provisioning of multiple vendor accounts for a new tenant. Providers: `github`, `n8n`, `trigger`, `supabase`, `sentry`, `uptime_kuma`, `posthog`. Each provider's result is recorded to `tenant_integration_bindings` via the AW webhook.

**Requires**: Provider-specific env vars (see table above). Only provisions the providers listed in `providers` array.

**Test payload** (provision Sentry + PostHog only):
```json
{
  "organizationId": "11111111-1111-1111-1111-111111111111",
  "customerEmail": "client@example.com",
  "providers": ["sentry", "posthog"],
  "hints": {
    "sentryProjectSlug": "client-staging",
    "sentryProjectName": "Client Staging",
    "posthogProjectName": "Client"
  }
}
```

**Expected output**: `{ organizationId: "...", results: [{ provider: "sentry", ok: true }, ...] }`

---

### `collect-scheduled-crawl`

**What it does**: Hourly cron (`0 * * * *`, declarative schedule) that pokes next-admin's
`/api/internal/collect/run-due-schedules`. Owns no scheduling logic itself -- next-admin's
`lib/collect/schedule.ts` (`isDueNow`) decides which tenants are actually due. Every tenant
defaults to `collection_schedules.enabled = false`, so this firing hourly does nothing until an
operator enables a tenant via `PATCH /api/ops/clients/[slug]/collection-schedule`.

**Requires**: `COLLECT_SCHEDULE_INGEST_TOKEN` + `AWAREWAVE_WEBHOOK_BASE_URL`

**Test payload**: none (scheduled task, no input). Safe to test-run any time --
0 schedules enabled returns `{"ok":true,"checked":0,"due":0,"results":[]}` with no side effects.

---

### `record-tenant-integration`

**What it does**: Simple helper — records a single integration binding to the AW webhook (`/api/tenant-integrations/ingest`). Used when you want to manually register an integration that was set up outside of automated provisioning.

**Requires**: `OPS_INBOX_INGEST_TOKEN` + `AWAREWAVE_WEBHOOK_BASE_URL`

**Test payload**:
```json
{
  "organizationId": "11111111-1111-1111-1111-111111111111",
  "provider": "sentry",
  "secretRef": "vault:sentry/client-dsn",
  "externalHint": "sentry-project-123456",
  "provisioningSource": "manual",
  "status": "active"
}
```

---

## Quick-start: First Run

The easiest task to run first (no env vars required):

1. Go to **Tasks → ao-infrastructure-check → Test**
2. Paste:
   ```json
   { "organizationId": "11111111-1111-1111-1111-111111111111" }
   ```
3. Click **Run test**
4. Check the output — service checks marked `"skip"` mean the env vars aren't set yet on the Trigger.dev server

Once `LOBSTER_SUPABASE_URL` + `LOBSTER_SUPABASE_SERVICE_ROLE_KEY` are set in Environment Variables, the `rls_isolation_smoke` check will also run.

**Via REST API** (confirmed working 2026-05-07):
```bash
# Trigger a run
curl -X POST "https://trigger.aware-wave.com/api/v1/tasks/ao-infrastructure-check/trigger" \
  -H "Authorization: Bearer tr_prod_<key>" \
  -H "Content-Type: application/json" \
  -d '{"payload": {"organizationId": "11111111-1111-1111-1111-111111111111"}}'
# → {"id": "run_xxx", "isCached": false}

# Poll run status (use /api/v3/runs/, NOT /api/v1/runs/)
curl "https://trigger.aware-wave.com/api/v3/runs/run_xxx" \
  -H "Authorization: Bearer tr_prod_<key>"
# → {"status": "COMPLETED", "output": {...}, ...}
```

---

## Current Prod Env Var Status

As of 2026-05-07, the following vars are set in the Trigger.dev prod environment:

| Variable | Status |
|---|---|
| `POSTHOG_API_KEY` | ✅ set |
| `POSTHOG_HOST` | ✅ set |
| `LOBSTER_SUPABASE_URL` | ❌ missing — sync on next deploy |
| `LOBSTER_SUPABASE_SERVICE_ROLE_KEY` | ❌ missing — sync on next deploy |
| `LOBSTER_ENABLE_DB_WRITES` | ❌ missing — sync on next deploy |
| `TRIGGER_API_URL` | ❌ missing — sync on next deploy |
| `N8N_URL` | ❌ missing — sync on next deploy |
| `UPTIME_KUMA_URL` | ❌ missing — sync on next deploy |
| `SENTRY_URL` | ❌ missing — sync on next deploy |
| `LOBSTER_AO_ORG_ID` | ❌ missing — must be set before next deploy |
| All tenant provisioning vars | ❌ missing — sync on next deploy |

To sync all vars, export them locally then run `npx trigger.dev@4.4.6 deploy` (see §Deploy below).

---

## Chaining `create-wp-site` → `apply-manifest` (manual, Phase 1)

`create-wp-site` returns a `next.applyManifestViaWorkflow` block. Use those values as the payload for a manual `apply-manifest` trigger:

```
create-wp-site output:
  next.applyManifestViaWorkflow = {
    workflowId: "apply-manifest",
    environmentId: "<new env UUID>",
    organizationId, workspaceId, projectId, siteId,
    wpRootPath: "<provisioned WP root>",
    manifestSlug: "wp-basic",
    ...
  }

→ Trigger apply-manifest with that payload + add:
  "manifestPath": "packages/manifests/wp-basic.json",
  "environmentType": "staging"
```

Auto-chaining (Phase 2) will require SSH execution mode to be configured for the Trigger.dev worker.

---

## Deploy

```bash
# From EU VPS (recommended — registry is on the same machine)
cd /root/Work/lobster-factory/packages/workflows
export TRIGGER_ACCESS_TOKEN=tr_pat_<your-pat>
export TRIGGER_API_URL=https://trigger.aware-wave.com
# Set any env vars you want synced:
export LOBSTER_SUPABASE_URL=https://supabase.aware-wave.com
export LOBSTER_SUPABASE_SERVICE_ROLE_KEY=<key>
export LOBSTER_AO_ORG_ID=<ao-org-uuid>
npx trigger.dev@4.4.6 deploy
```

See [README.md §7a](README.md#7a-完整-deploy-registry5000-為何會失敗怎麼做才對) for registry connectivity details.
