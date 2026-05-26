# 一鍵架站系統 Logic Audit — 2026-05-26

> **Tier 3 monthly audit per [BUG_HUNT_PROTOCOL.md](../../docs/operations/BUG_HUNT_PROTOCOL.md).**
> Status SSOT: [AUDIT_REGISTRY.md §一鍵架站系統 logic audit](../../docs/operations/AUDIT_REGISTRY.md#一鍵架站系統-logic-audit-2026-05-26)

## Metadata

| Field | Value |
|-------|-------|
| Audit date | 2026-05-26 |
| Auditor | critic subagent (Tier 3 monthly) |
| Scope | 12 files declared + 8 cross-referenced |
| Method | Full file reads + cross-file grep + logic analysis + Zod schema cross-check |
| Wall-clock effort | ~6 min (critic subagent) |

## R0 [驗證計畫] 4-Action Evidence

| Action | Evidence |
|--------|---------|
| **1. 實測** | Read-only audit — no code changes. Full file reads of 12 declared + 8 cross-referenced files completed. |
| **2. Review** | Critic subagent read ALL files end-to-end: create-wp-site, orchestrate-tenant-provisioning, apply-manifest, dispatch-action-run, installManifestStaging, resolveStagingProvisioning, mockStagingAdapter, httpJsonStagingAdapter, integration-steps, wp-install-plugins, types, registry, + 8 cross-ref including build/runs route, contracts, supabaseRestInsert, postTenantIntegrationWebhook. |
| **3. 抓蟲** | grep callsites of create-wp-site / apply-manifest / wp-install-plugins / orchestrate-tenant-provisioning across monorepo; grep process.env inheritance in installManifestStaging; grep LOBSTER_ENABLE_DB_WRITES/LOBSTER_EXECUTE_MANIFEST_STEPS gates; grep shell exec paths for injection surface. |
| **4. WORKLOG** | This report + AUDIT_REGISTRY.md new section + WORKLOG.md 2026-05-26 entry. |

## Headline

**Overall risk: MEDIUM-HIGH** — Phase 1 codebase is well-architected with strong env-gating (`LOBSTER_ENABLE_DB_WRITES` / `LOBSTER_EXECUTE_MANIFEST_STEPS`) and good staging-only guardrails, but ships with **3 Critical** issues (approval gate bypass in dispatcher, missing siteId idempotency / re-run race, integration SSRF surface), **11 Major** issues, and **12 Minor** issues that will compound badly once production volume hits. The most dangerous defects sit at the seam between Build Console → dispatcher → workflows, where assumed-trusted upstream input meets fan-out execution.

---

## 🔴 Critical Findings

### C1 — `dispatch-action-run.ts:165-191` — Dispatcher bypasses `approval_required` / `approval_status` gates entirely

The scheduled dispatcher (`dispatchActionRunSchedule`, cron `*/1 * * * *`) selects ALL pending runs (`status: "eq.pending"`, limit 10) and dispatches them without consulting `approval_required` or `approval_status` columns. The `ActionRunSchema` (lines 29-38) does not even include these fields, and `dispatchRun` (lines 95-158) goes straight to `tasks.trigger(taskId, triggerPayload)` once the action_key resolves.

Meanwhile, `app/api/build/runs/route.ts:127-128` correctly writes `approval_required: plan.approvalRequired, approval_status: plan.approvalRequired ? "pending" : "none"`. For `profile_b` in `production`, `approvalRequired = true`.

**Consequence**: an `enqueue`-mode build run targeting production will sit with `status='pending', approval_required=true, approval_status='pending'` — and the cron dispatcher will pick it up within 60 seconds and execute it. The whole approval workflow is a paper tiger.

**Fix design**:
- Add `approval_required: z.boolean().nullish()` and `approval_status: z.string().nullish()` to `ActionRunSchema`.
- Change query filter in `dispatch-action-run.ts:172` to only select runs where `approval_required=false OR approval_status=approved`.
- Add explicit guard in `dispatchRun` before `tasks.trigger`: if `run.approval_required && run.approval_status !== "approved"`, mark `dispatch_blocked` and return.

---

### C2 — `create-wp-site.ts` + `app/api/build/runs/route.ts:114-143` — Zero idempotency on `siteId`; double-submit re-provisions everything

`InputSchema` validates `siteId: z.string().uuid()` but no check verifies the site has not already been provisioned. The `ops_action_runs` INSERT uses `crypto.randomUUID()` as primary key — there is no unique constraint or pre-flight check on `(site_id, action_key, status)`. Same for `applyManifest` and `wpInstallPlugins`.

`create-wp-site` then:
1. Calls `resolveStagingProvisioning` (may POST to vendor, creating a duplicate hosting account)
2. Calls `runAllIntegrations` (creates duplicate Sentry project, Uptime Kuma monitor, MainWP site, n8n webhook, PostHog event)
3. Calls `tasks.trigger("wp-install-plugins")` (creates duplicate `package_install_runs` rows)

The mock adapter's `deterministicMockEnvironmentId(siteId)` is the ONLY place with stable identity, and it does not extend to real adapters or integrations.

**Consequence**: any operator double-click, cron-dispatcher race, or Trigger.dev retry creates duplicate billable cloud resources + duplicate monitoring rows + corrupts artifact accounting.

**Fix design**:
- Add `siteId` uniqueness check at API route before insert: query `ops_action_runs WHERE site_id=<id> AND status IN (pending, running, dispatched, completed)` — return 409 if found.
- In `create-wp-site.ts`, before any external side-effect, check `staging_environments` and `tenant_integration_bindings` for existing `siteId` — if found, return `already_provisioned` short-circuit.
- Make each integration call idempotent (Sentry: lookup by slug before create; Uptime Kuma: list before POST).

---

### C3 — `integration-steps.ts` + `create-wp-site.ts:34-40` — SSRF surface: attacker-supplied integration URLs hit by worker

`IntegrationsSchema` declares `uptimeKuma.url: z.string()`, `n8n.onboardingWebhookUrl: z.string()`, `mainWp.dashboardUrl: z.string()`, `postHog.host: z.string().optional()` — **none use `z.string().url()`**, none block internal IP ranges. The Trigger.dev worker (EU VPS) then issues authenticated `fetch()` to each URL. Response body is echoed back into `IntegrationResult.detail` which surfaces in `output_snapshot` and PostHog event metadata — a data exfiltration channel.

The worker runs on the EU VPS shared with Supabase, Trigger.dev orchestrator, n8n, ClickHouse → the SSRF blast radius is the entire internal control plane.

**Fix design**:
- Change all URL fields to `z.string().url().refine(noInternalIp)` where `noInternalIp` rejects `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`, `127.x`, `::1`, `.internal`, `.local`, and non-https schemes.
- Add domain allowlist for known integrations.
- Do NOT include response bodies in `IntegrationResult.detail` — return only numeric status + status text.

---

## 🟠 Major Findings (11)

| # | File:line | Issue | Why-matters |
|---|-----------|-------|-------------|
| M1 | `create-wp-site.ts:222` | `sshHost: ... ?? "TODO_from_staging_ref"` literal string passed as SSH host | String `"TODO_from_staging_ref"` becomes the literal value in trigger payload; DNS error pollutes Sentry + buries the real problem |
| M2 | `create-wp-site.ts:323` | `(stagingRef as { sshHost?: string })?.sshHost` — cast on type that doesn't declare `sshHost` | Runtime read is silently always `undefined`; cast defeats refactor safety |
| M3 | `wp-install-plugins.ts:160-186` | Dry-run writes `status: "completed"` to `package_install_runs` | Operator dashboards think install happened; only tell is `version='dry_run'` deep in JSON column |
| M4 | `wp-install-plugins.ts:104-111` | `isLicenseError` uses substring matching on stderr | Misclassifies transient network errors as "paid plugin"; false-negatives hide real failures |
| M5 | `apply-manifest.ts:108-110` | `environmentType !== "staging"` check runs AFTER PostHog "workflow started" event | Pollutes analytics; error throws leaving caller-side state inconsistent |
| M6 | `apply-manifest.ts:112-114` | `fs.readFile(path.resolve(input.manifestPath))` — **arbitrary file read** via attacker-controlled path | `manifestPath: z.string().min(1)` — no allowlist, no path-traversal guard. `/root/.ssh/id_rsa` works. |
| M7 | `installManifestStaging.ts:99-106` | `spawn` inherits entire `process.env` including secrets | Secrets land in stdout/stderr → `output_snapshot` → PostHog/Sentry if script prints env |
| M8 | `wp-install-plugins.ts:163` | `wp plugin install ${slug} ... --path=${input.wpPath}` — **shell command injection** | `slug: z.string().min(1)` — no regex validation; runs via `ssh2.Client.exec()` through remote shell |
| M9 | `orchestrate-tenant-provisioning.ts:82-115` | Single webhook 502 short-circuits remaining providers | Partial state with no compensating rollback or retry record; `secretRef` lost forever |
| M10 | `dispatch-action-run.ts:118-156` | Mark-running → trigger → mark-dispatched non-atomic | Crash between trigger and mark-dispatched = duplicate dispatch on next poll |
| M11 | `apply-manifest.ts:389-419` | Failure-path `output_snapshot` omits `shellExecution` | Operators see no exit code, stderr tail, or script path for debugging failed runs |

---

## 🟡 Minor Findings (12)

| # | File:line | Issue | Fix sketch |
|---|-----------|-------|------------|
| m1 | `create-wp-site.ts:163-164` | `LOBSTER_ENABLE_DB_WRITES` inconsistent boolean parsing (`"yes"` / `"on"` not accepted) | Extract `parseBoolEnv(name)` helper used everywhere |
| m2 | `wp-install-plugins.ts:133-134` | Same inconsistency for `LOBSTER_EXECUTE_MANIFEST_STEPS` | Same helper |
| m3 | `apply-manifest.ts:135` | `(manifest as any)?.name` cast on Zod-parsed value | Drop cast; value already narrowed |
| m4 | `create-wp-site.ts:319,367,378-381` | `pluginInstall.pluginCount` non-zero even when skipped — misleads dashboards | Add `mode: "skipped_dry_run" | "skipped_no_ssh" | "triggered"` field |
| m5 | `integration-steps.ts:107` | `${cfg.url}/dashboard/${id}` — double slash if url has trailing slash | `cfg.url.replace(/\/$/, "")` |
| m6 | `integration-steps.ts:213` | Hardcoded `https://sentry.io/...` — incompatible with self-hosted Sentry | Make configurable via optional `cfg.host` |
| m7 | `integration-steps.ts:339` | `btoa(...)` — browser-only API | Use `Buffer.from(...).toString("base64")` |
| m8 | `integration-steps.ts:397-408` | `Promise.allSettled` rejected branch returns `service: "unknown"` | Return typed `IntegrationResult` per provider with correct service name |
| m9 | `apply-manifest.ts:281-283` | `Number(process.env.TIMEOUT || 120_000)` returns NaN on `"abc"` → `setTimeout(NaN)` fires immediately | Validate with `Number.isFinite()` |
| m10 | `installManifestStaging.ts:155-160` | `fs.statSync` swallowed → misleading "not a directory" message | Differentiate ENOENT vs EACCES |
| m11 | `mockStagingAdapter.ts:7-13` | `deterministicMockEnvironmentId` not technically valid v4 UUID (deterministic bits) | Document the trade-off explicitly |
| m12 | `httpJsonStagingAdapter.ts:38` | `LOBSTER_HOSTING_PROVISION_PATH` accepts absolute URLs — host substitution risk | Assert `path.startsWith("/")` and `!path.includes("//")` |

---

## ✓ Verified Clean

- `apply-manifest.ts:117-130` — 3 independent guardrails (env-type, allowEnvironments, manifest name) before any shell execution
- `installManifestStaging.ts:14-20` — LOBSTER_MANIFEST_EXECUTION_MODE defaults to `"off"` safely
- `installManifestStaging.ts:117-122` — SIGTERM then SIGKILL after 5s; timer unref'd
- `installManifestStaging.ts:140-211` — Retry loop bounded by `maxAttempts`; both timeout and non-zero exit retried
- `wp-install-plugins.ts:44-50` — `resolvePrivateKey` prefers per-client key over global fallback
- `wp-install-plugins.ts:73, 92` — SSH connection cleanup via `settle` guard; `conn.end()` inside try-catch
- `wp-install-plugins.ts:180` — Stderr truncated + explicit `.replace(sshPrivateKey, "[REDACTED]")` redaction
- `httpJsonStagingAdapter.ts:39-42` — Timeout clamped to `[1000, 120000]` range
- `httpJsonStagingAdapter.ts:56-57, 60-72, 135-137` — AbortController + finally clearTimeout
- `dispatch-action-run.ts:163-192` — Bounded fetch (limit 10); sequential loop; fair-queue ordering
- `orchestrate-tenant-provisioning.ts:82` — Provider dedup via `[...new Set(input.providers)]`
- `supabaseRestInsert.ts:25-80` — Exponential backoff; status-aware retry; `x-lobster-trace-id` correlation header
- `supabaseRestInsert.ts:98` — `encodeURIComponent(rowId)` prevents PostgREST filter injection
- `resolveStagingProvisioning.ts:6-30` — Strict allowlist for adapter mode; unknown mode returns `blocked`
- `create-wp-site.ts:95-135` — `hosting.outcome === "blocked"` short-circuits without firing integrations
- `apply-manifest.ts:389-419` — Both success and failure paths PATCH workflow_run before re-throwing
- `postTenantIntegrationWebhook.ts:14-52` — `OPS_INBOX_INGEST_TOKEN` required; Authorization: Bearer; response errors truncated
- No hardcoded secrets / credentials / API keys in any of the 12 files
- All credentials sourced from `process.env.LOBSTER_*` or `process.env.TENANT_PROVISION_*`

---

## Statistics

| Category | Count |
|----------|-------|
| Files in declared scope | 12 |
| Files cross-referenced | 8+ |
| 🔴 Critical | 3 |
| 🟠 Major | 11 |
| 🟡 Minor | 12 |
| ✓ Verified Clean | 19 items |
| Hardcoded credentials | 0 |
| TODO placeholders in critical paths | 5 |
| Plan-vs-code gaps | 2 (C1 approval gate, M3 dry-run status) |
| SSRF / injection vectors | 2 (C3 integration URLs, M8 slug + wpPath) |
| Path traversal vectors | 1 (M6 manifestPath) |

---

## Top-3 Priorities

1. **C1** — Wire approval gate into dispatcher (~15 lines: schema + filter + guard). Without this, `approval_required: true` is decoration.
2. **C2** — Add siteId idempotency check at API + workflow level. Any retry creates duplicate billable resources.
3. **C3 + M6 + M8** — Tighten Zod schemas at trust boundary: `z.string().url().refine(noSsrf)`, restrict `manifestPath` to allowlisted dir, restrict `slug`/`wpPath` to safe regex. One PR closes the entire injection/SSRF/path-traversal class.

---

## Recommended Next Steps

1. `vuln-verifier` PoC recommended for C3 (SSRF) — easiest to demonstrate against controlled internal endpoint
2. Create TASKS.md items for C1/C2/C3 — track as Phase 4+ blocking before any production `enqueue` mode is enabled
3. M8 shell injection is pre-production but HIGH priority — fix slug/wpPath validation before any real SSH host is used
