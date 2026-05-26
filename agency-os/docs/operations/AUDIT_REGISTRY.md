# Audit Registry

> Canonical record of every code-quality / bug-class audit run against this monorepo.
> Future Claude / operator reads this first to avoid re-auditing what's already checked.
> Each audit class has its own subsection; entries are append-only.

## How to read this

| Status | Meaning |
|--------|---------|
| 🔴 FIXED | Was unprotected, hardened in commit `<hash>`. Now uses standard protection pattern. |
| 🟢 CLEAN | Reviewed, no protection needed (out of scope, different bug class, false positive). |
| 🟡 TRACKED | Known unprotected, lower-priority. Will be hardened on next Edit (per AGENTS.md auto-trigger). |
| 🛠 TOOL | Audit tooling built (slash command, helper, registry). |
| ⏳ PENDING | Scheduled audit not yet executed. |

## How to add a new audit

1. Run the audit tool / agent / manual review
2. Create new subsection here: `## <audit-class-slug> (YYYY-MM-DD)`
3. Use the template below
4. Cross-reference from `agency-os/WORKLOG.md` daily entry
5. Register: `powershell scripts/register-new-governance-doc.ps1 -DocPath agency-os/docs/operations/AUDIT_REGISTRY.md` (if first time only)

### Template

```markdown
## <audit-class-slug> (YYYY-MM-DD)

**Scope**: <N> files, paths: <glob list>
**Method**: <static grep / AST / runtime test / critic review>
**Tool**: <SSOT path if reusable>
**Origin trigger**: <real bug that started this | scheduled | post-mortem>

### 🔴 FIXED (now protected via <pattern>)
- `<path>:<line>` — <commit hash> — <one-line why>

### 🟢 CLEAN (reviewed, no action)
- `<path>` — <reason it's safe / out of scope>

### 🟡 TRACKED (low-priority, fix on next Edit)
- `<path>:<line>` — <risk level + reason for deferral>

### 🛠 TOOL
- `<path>` — <one-line purpose>

### Statistics
| Audited | Fixed | Clean | Tracked | Real production breaks pre-audit |
|---------|-------|-------|---------|----------------------------------|
| N | n | n | n | n |
```

---

## CP950 / encoding-trap audit (2026-05-22)

**Scope**: 142 PowerShell scripts under `scripts/` + `agency-os/scripts/` + `lobster-factory/infra/**/scripts/` + `lobster-factory/infra/trigger/` + `mcp/claude-userlevel/hooks/` (excluding `node_modules/` + `Backups/` + `*.test.ps1`)

**Method**: AST-based detection of external command captures (`& ssh|docker|wp|scp|git|kubectl|helm|curl|wget`) NOT inside `Invoke-WithUtf8Console { ... }` scriptblock AND NOT in a file with script-level `[Console]::OutputEncoding = UTF8` set. Implemented as `scripts/audit-cp950-traps.ps1`.

**Tool**: [scripts/audit-cp950-traps.ps1](../../../scripts/audit-cp950-traps.ps1) → invoked via `/audit-encoding` slash command

**Origin trigger**: 2026-05-22 `backfill-missed-daily.ps1` mojibake'd CJK commit messages from `git log` capture + ate newlines → two commits merged on one line (real production break; first surfaced by operator running `/verify-recent --ack` and seeing `??` + missing entries).

### 🔴 FIXED (now protected via `Invoke-WithUtf8Console`)

- `scripts/backfill-missed-daily.ps1` line 62-86 — commit `e807984` — script-level `[Console]::OutputEncoding = UTF8` set with save+restore (Pattern B). Original production break.
- `scripts/check-backup-health.ps1:39` — commit `8a18ecb` — SSH stdout capture
- `scripts/check-deploy-drift.ps1:87` — commit `2c62680` — SSH stdout capture + added `Set-StrictMode -Version Latest` (consistency fix)
- `scripts/diff-env-vs-vault.ps1:116, 118` — commit `faafbae` — SSH + docker exec captures
- `scripts/update-client-wp-plugins.ps1:105, 122, 128` — commit `8e0e33e` + `52e97d6` — SSH + scp captures (Copy-FromServer + Copy-ToServer also wrapped)
- `scripts/ao-resume.ps1:425` — commit `<this-commit>` — `git log --pretty=format:"%cd|%s"` (subject CJK) — **tool found bug I introduced today in commit `e807984`** — exact same pattern as the backfill original break
- `scripts/print-today-closeout-recap.ps1` — commit `<encoding-fix-commit>` 2026-05-26 — Pattern B → Pattern A: `git status -sb` (CJK paths) + `git log %s` (CJK subjects) wrapped in `Invoke-WithUtf8Console`; bare `[Console]::OutputEncoding` setter removed; dot-source added

### 🟢 CLEAN (reviewed, no action)

#### Out of scope (no external command stdout capture)
- `scripts/merge-closeout-inbox-into-progress.ps1` — 0 external commands (pure markdown aggregator)
- `scripts/apply-closeout-task-checkmarks.ps1` — `[StringComparison]::Ordinal` for CJK substring, regex matches only ASCII structure
- `scripts/fetch-external-signals.ps1` — `Invoke-RestMethod` (HTTP charset header handled by .NET, no stdout encoding path)
- `scripts/generate-integrated-status-report.ps1` — pure .md aggregator; no external command captures. BOM consistency fixed in commit `<encoding-fix-commit>` 2026-05-26: `Set-Content -Encoding UTF8` (PS5=BOM / PS7=no-BOM) replaced with `[System.IO.File]::WriteAllText($path, $text, UTF8NoBOM)` — PS5/PS7 consistent no-BOM output
- `lobster-factory/infra/trigger/{validate-config,preflight-clickhouse}.ps1` — 0 captures
- `lobster-factory/infra/hetzner-phase1-core/scripts/test-ops-inbox-webhooks.ps1` — `Invoke-WebRequest` (HTTP path, same safety as Invoke-RestMethod)

#### Pattern B protected (script-level `[Console]::OutputEncoding = UTF8`)
- `scripts/backfill-missed-daily.ps1` — uses save+restore via Pattern B (fixed today)

#### Pattern A upgraded (2026-05-26)
- `scripts/print-open-tasks.ps1` — no external command stdout captures; dot-source added for future-proofing; `chcp 65001` retained for PS5 terminal display; bare `OutputEncoding` setters removed (were no-ops for this script)
- `scripts/print-today-closeout-recap.ps1` — moved to 🔴 FIXED above

#### Linux scripts (CP950 trap class does NOT exist on Linux)
- 24 `.sh` files — bash is byte-oriented, VPS locale `C.UTF-8`, no `[Console]::OutputEncoding` equivalent. No fix needed and no `Invoke-WithUtf8Console` function exists for bash.

### 🟡 TRACKED (low-priority, hardening deferred — fix on next Edit per AGENTS.md auto-trigger)

Tool reports **117 remaining unprotected sites** across these files. Most are ASCII-only operations (`git rev-parse`, `git status`, `git rev-list --count`, `docker ps --format`) where CP950 trap won't materialize because the data flowing through is pure ASCII. Listed here as backlog:

| File | Capture count | Risk profile |
|------|---------------|--------------|
| `scripts/ao-close.ps1` | 22 | Medium — `git diff --cached` captures content (could have CJK); other 21 are ASCII metadata |
| `scripts/ao-resume.ps1` | 5 | Low — remaining are status/push/rev-parse (ASCII) after %s fix |
| `scripts/check-three-way-sync.ps1` | 16 | Low — all git status/rev-parse/fetch (ASCII) |
| `scripts/git-align-main-aoresume-feature.ps1` | 8 | Low — all git align ops (ASCII) |
| `scripts/git-audit-tracked-remote.ps1` | 7 | Low — git ls-files, status (could have CJK paths) |
| `scripts/check-deploy-drift.ps1` | 7 | Low — git fetch/rev-parse (ASCII commit hashes) |
| `scripts/commit-checkpoint.ps1` | 5 | Medium — `git commit -m $Message` (message may have CJK) |
| `scripts/bootstrap-local-wordpress-windows.ps1` | 5 | Medium — `wp core install --title=...` could have CJK title |
| `scripts/lobster-trigger-deploy.ps1` | 3 | Low — SSH to EU VPS (deployment output, mostly ASCII) |
| `scripts/sync-hetzner-*.ps1` (5 scripts) | 8 total | Medium — SSH + scp; remote bash stderr could contain non-ASCII |
| `scripts/git-prune-merged-local-branches.ps1` | 6 | Low — branch ops, ASCII |
| `scripts/check-claude-sync.ps1` | 2 | Low |
| `scripts/fetch-external-signals.ps1` | 1 | Low — `git rev-parse --show-toplevel` (ASCII path) |
| `scripts/machine-environment-audit.ps1` | 5 | Low |
| `scripts/phase4-weekly-check.ps1` | 1 | Low |
| `scripts/scan-local-config-for-secrets.ps1` | 1 | Low |
| `scripts/sync-claude-userlevel.ps1` | 1 | Low — 🔴 FIXED b791bfb+followup: wrapped `git rev-parse` in `Invoke-WithUtf8Console` |
| `scripts/verify-closeout-completeness.ps1` | 2 | Low |
| `lobster-factory/infra/trigger/deploy-workflows.ps1` | 1 | **False positive** — `docker info 2>&1 \| Out-Null` discards all output; no stdout decode occurs; CP950 trap does not apply. Also fixed commit `<encoding-fix-commit>` 2026-05-26: L72 `Get-Content $PkgPath -Raw` + L85 `Get-Content $PosthogEnvSource` now both use `-Encoding UTF8` |
| `mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1` | 1 | Low |
| `mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1` | 2 | Low |
| `scripts/generate-customer-delivery-status.ps1`, `scripts/playwright-runner.ps1` | parse-error reported | Pre-existing PS parse errors unrelated to encoding |

**Hardening strategy** (per AGENTS.md auto-trigger): when any of these scripts gets an `Edit`/`Write`, Claude must:
1. Run `/audit-encoding --file <path>` on the changed file
2. If still flagged, wrap the capture in `Invoke-WithUtf8Console { ... }` and add helper dot-source
3. Mark the entry here as `🔴 FIXED`

### 🛠 TOOL

- [scripts/audit-cp950-traps.ps1](../../../scripts/audit-cp950-traps.ps1) — AST-based detector + Pattern B detection + JSON output mode + single-file mode
- [scripts/_console-encoding-helpers.ps1](../../../scripts/_console-encoding-helpers.ps1) — `Invoke-WithUtf8Console` wrapper helper
- [.claude/commands/audit-encoding.md](../../../.claude/commands/audit-encoding.md) — `/audit-encoding` slash command (calls the tool)
- AGENTS.md `## 代理自動工具使用規則` — auto-trigger rule when Edit touches `.ps1` with capture pattern

### Statistics

| Audited | Fixed (Pattern A) | Fixed (Pattern B) | Clean | Tracked | Real production breaks pre-audit | Tooling shipped |
|---------|-------------------|-------------------|-------|---------|----------------------------------|-----------------|
| 142 (PS) + 24 (SH) | 6 | 1 | 32 + 24 | 117 | 1 (`backfill-missed-daily.ps1`) | 3 (helper + tool + slash + AGENTS rule) |

_2026-05-26 update: +1 Pattern A (print-today-closeout-recap); Pattern B 3→1 (print-today→A, print-open→Clean); Clean 31→32 (print-open-tasks added); deploy-workflows docker info annotated false-positive; generate-integrated-status-report BOM consistency fixed._

---

<!-- next audit class goes here; copy from "## Template" section above -->

---

## Ops Inbox webhook CLEAR auto-resolve + fingerprint instability (2026-05-23)

**Class**: webhook handler completeness — "incident-creating but incident-not-closing" anti-pattern

**Status**: 🔴 FIXED (code committed `f933312` 2026-05-23; **production effect pending sg-deploy**)

**Discovered during**: 2026-05-23 B-Minimal VPS auto-reboot deployment, P3 incident closure step. After SG reboot manually cleared the underlying signal, the operator-visible Ops Inbox row remained `status=open` because the webhook code path did not actively resolve incidents on netdata CLEAR transitions.

**Root cause** (historical):
- `fingerprint.ts` used `raw.alarm` (label text including runtime value e.g. `= 1 status`) — label changes between WARNING/CLEAR so fingerprints didn't match across transitions
- `route.ts` had skip-and-return on CLEAR (`{"skipped": "netdata_clear"}`) — no attempt to resolve the matching open incident

**Fix implemented** (commit `f933312` 2026-05-23):
1. **`lib/ops-inbox/fingerprint.ts:32-43`** — netdata case: use `raw.name` (stable metric ID e.g. `system_post_update_reboot_status`) as primary key; fallback chain `name → alarm_id → alarm`
2. **`app/api/webhooks/netdata/route.ts:44-70`** — CLEAR active resolve: look up open incident by stable fingerprint + environment, set `status=resolved` + `resolved_at` + `resolved_by='netdata-auto-resolve-on-clear'`; idempotent via `.eq("status","open")` filter
3. **`lib/ops-inbox/__tests__/fingerprint.test.ts`** — 5 vitest cases: WARNING/CLEAR same fingerprint, three-layer fallback, different host = different fingerprint
4. **SQL backfill** — `UPDATE 13` stale netdata incidents (`resolved_by='stale-backfill-2026-05-23-fingerprint-refactor'`); post-backfill `SELECT count(*) WHERE source='netdata' AND status='open'` = 0

**Production deploy**: code merged but `sg-deploy` not yet executed (18 commits behind as of 2026-05-26). Existing deployment still runs pre-fix logic during the gap. Workaround: manually `UPDATE ops_incidents SET status='resolved'` via `docker exec supabase-db psql` if stale incidents accumulate before deploy.

**Tracked task**: `agency-os/TASKS.md` §Encoding 防護延伸 → "Ops Inbox netdata CLEAR auto-resolve bug + fingerprint instability" — **AUDIT_REGISTRY updated 2026-05-26; close TASK after sg-deploy confirms live**

---

## Auto-Repair logic audit (2026-05-23)

**Scope**: 14 in-scope + 5 cross-ref files. Repair Center logic (`lib/repair-center/*`), webhook intake (5 routes), Slack callback, GitHub workflows, sg-deploy.sh Step 6+7 + rollback-phase1.sh, migration 0027.

**Method**: Owner doc baseline read (plan v3.2 + BRIEF + app-architecture + phase2-handoff) → full file reads (no excerpts) → R0 [現況分析] + sequence diagram → 3 parallel `critic` subagent rounds (decision-logic / webhook-intake / orchestration+deploy) → real exec `curl /api/ops/repairs/health` → dogfood harness build + run.

**Tool**: [scripts/audit-tools/dogfood-auto-repair.ps1](../../../scripts/audit-tools/dogfood-auto-repair.ps1) — recurring health-probe + logic-finding reminder harness. Exit 0/1/2.

**Origin trigger**: Tier 3 monthly schedule + Phase 4 observation window closing 2026-06-19 (must clear Criticals before close).

**Audit report (full findings + R0 fix patches + Patch Errata)**: [reports/audit/auto-repair-2026-05-23.md](../../reports/audit/auto-repair-2026-05-23.md)

**⚠️ Self-critic (2026-05-23)**: The audit deliverables were themselves critic-reviewed (R0+R4 iron rule applied to the audit itself). Findings are factually accurate but **patches contain 5 Major design defects** — see `Patch Errata` section in the report. **Do not apply any patch until Errata fixes are folded in.**

**✅ 2026-05-23 apply round complete**: all 5 🔴 Critical findings (C1–C5) applied to repo with Patch Errata folded in (EMaj-1 anchor-only regex for B64, EMaj-2 save-before-deploy + APPS filter, EMaj-3 column allow-list as primary fix, EMaj-4 MAX_DEPTH=64, EMin-7 PREVIOUS_COMMIT variable). All 109/109 next-admin vitest tests pass; bash -n on sg-deploy + auto-deploy clean; dogfood harness 10/10 invariants. C1 takes effect on operator's next sg-deploy run; C2/C3/C4/C5 active immediately on next `lobster-next-admin` container rebuild.

### 🔴 FIXED (now protected)

- **C1** sg-deploy.sh Step 7 — auto-rollback hook implemented + RESTORABLE_APPS partition (wordpress/node-api/next-admin) + AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=true default + DEPLOY_ROLLBACK_RUNBOOK.md line 72 updated + auto-deploy-next-admin.sh ROLLBACK suffix in Slack/Telegram. Implements Plan v3.2 §五 第 3 層 contract. Files: [sg-deploy.sh](../../../lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh), [auto-deploy-next-admin.sh](../../../lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh), [DEPLOY_ROLLBACK_RUNBOOK.md:72](DEPLOY_ROLLBACK_RUNBOOK.md), [AGENTS.md:79](../../AGENTS.md). Verification: `bash -n` clean both scripts; first real exercise on operator's next `sg-deploy.sh next-admin` run.
- **C2** redactSecrets.ts — value-aware scrubber (10 anchored patterns: Stripe, GitHub PAT, Slack token, Trigger.dev token, AWS access key, JWT, PEM private key, key=value pairs) + `OPS_AGGRESSIVE_REDACT=true` env gate for un-anchored B64 detection (EMaj-1) + MAX_DEPTH=64 (EMaj-4) + MAX_STRING_LENGTH=4096 truncation. 16 new vitest cases all pass. Files: [redactSecrets.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/redactSecrets.ts), [redactSecrets.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/__tests__/redactSecrets.test.ts).
- **C3** 5 webhook routes — 256KB body cap via shared `readWebhookBody` helper + req.text() refactor (preserves raw bytes for future per-source HMAC retrofit, closes M3). PostHog feature-flag now precedes auth check (closes m3 token-validity leak). Files: [readRequestBody.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/readRequestBody.ts) (new), all 5 `webhooks/*/route.ts`.
- **C4** GET /api/ops/repairs — explicit LIST_COLUMNS allow-list (audit_log NEVER returned in list view, primary fix per Errata EMaj-3 reframe) + `canModifyIncidentStatus + source !== 'default_viewer'` defense-in-depth guard + backup.ts SSH stdout/stderr 6000→500 byte truncation. Files: [repairs/route.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/route.ts), [backup.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/backup.ts).
- **C5** Severity gate is now a real pipeline stop — uses `severityRequiresHumanReview()` helper (closes m9 dead code + docstring lies), critical incidents create run at `triage_needed` state, NEW route POST /api/ops/repairs/[id]/confirm-critical for explicit operator second confirmation. Plan v3.2 §四 contract honored. Files: [service.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts), [confirm-critical/route.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/[id]/confirm-critical/route.ts) (new).

### 🟢 CLEAN (reviewed, no action)

- Slack signature verification at [`slack/route.ts:8-25`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/commands/slack/route.ts) — timing-safe + length check + freshness
- GitHub token handling at [`github.ts`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/github.ts) — header-only, no echo to body / logs
- `escalate / human-only / links / archive` routes — all gated by `canApproveCommand` (owner/admin)
- Branch name handling at [`auto-repair-claude.yml:50`](../../../.github/workflows/auto-repair-claude.yml) — claude-code-action emits git-validated `branch_name`, double-quoted, gh CLI not shell-interpreted
- 0027 migration: TypeScript unions match SQL CHECK constraints; foreign key `on delete cascade` intentional; jsonb defaults non-null
- `archiveRun` race: idempotency check via `archived_at`
- `computeFingerprint` SHA-256 use — collision-resistance sufficient for dedup
- `ssh.ts` — no user-data interpolation into commands (env-path concern tracked separately as M8)

### 🔴 TRACKED — Critical

_(all 5 moved to 🔴 FIXED above on 2026-05-23; Phase 4 closeout 2026-06-19 unblocked for the Critical-tier; Major-tier follow-up next iteration.)_

### 🔴 FIXED — Major (2026-05-26)

- **M1** `service.ts:updateRunLinks` — 2026-05-26 — Enum validation + terminal state guard added. `body.state` validated against `REPAIR_RUN_STATES` const; terminal run writes blocked; `body.deploy_status` validated against `REPAIR_DEPLOY_STATUSES` const. Files: [types.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/types.ts) (new consts), [service.ts:updateRunLinks](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts). Tests: [update-run-links.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/update-run-links.test.ts) 14 cases.
- **M5** `backup.ts:33-67` — 2026-05-26 — Backup webhook integrity gate: rejects non-JSON 200 (Cloudflare/nginx page), rejects JSON with no `backup_id`/`backup_ref`, enforces `size_bytes >= 1024` when present. Implements Plan §六 "No backup means no repair run". File: [backup.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/backup.ts). Tests: [backup-webhook.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/backup-webhook.test.ts) 10 cases.
- **M6** `.github/workflows/auto-repair-claude.yml` — 2026-05-26 — Forbidden-path-check CI step added between Claude run and PR creation. Blocks PR if Claude touched `.github/workflows/`, `nginx/`, `Dockerfile`, `docker-compose*`, `/migrations/`, `.env*`. File: [auto-repair-claude.yml](../../../.github/workflows/auto-repair-claude.yml).

### 🟠 TRACKED — Major (7 remaining)

~~M1~~ ~~M5~~ ~~M6~~ FIXED above. Remaining: per-source HMAC missing (M2), `req.json` blocks future HMAC retrofit (M3), fingerprint forgery for silent suppression (M4), no mid-sequence recovery in `service.ts` (M7), `safeScriptPath` allows `..` (M8), `escalateAnalysisOnlyRun` TOCTOU (M9), Sentry retry storm loses occurrence_count increments (M10).

### 🔴 FIXED — Minor (2026-05-26)

- **m1** `policy.ts:74` — 2026-05-26 — Dead code `if (severity === "critical") return "triage_needed"` deleted. Unreachable because only `source=manual` reaches this branch, and the following line already covers that case. File: [policy.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts).
- **m7** `service.ts:updateRunLinks` — 2026-05-26 — `github_pr_url` hostname validated via `new URL()` — rejects `javascript:` and non-`github.com` hostnames before storage. Bundled with M1 fix. Tests: [update-run-links.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/update-run-links.test.ts) 4 dedicated URL cases.

### 🟡 TRACKED — Minor (9 remaining)

~~m1~~ ~~m7~~ FIXED above. ~~m3 posthog ordering~~ ~~m9 dead helper wired~~ closed alongside Criticals (2026-05-23). Remaining: bearer length leak (m2), uptime-kuma env from `monitor.hostname` (m4), **m5 netdata silent CLEAR — overlaps with [Ops Inbox webhook CLEAR auto-resolve audit (2026-05-23)](#ops-inbox-webhook-clear-auto-resolve--fingerprint-instability-2026-05-23) — same root cause, deduped here**, `isTerminalState(undefined)===true` footgun (m6), GHA "completed" message on empty branch (m8), `triage_needed` accumulation (m10), RLS missing deny-anon policy (m11).

### 🛠 TOOL

- [scripts/audit-tools/dogfood-auto-repair.ps1](../../../scripts/audit-tools/dogfood-auto-repair.ps1) — recurring health-probe + logic-finding reminder. Run via `powershell -ExecutionPolicy Bypass -File scripts/audit-tools/dogfood-auto-repair.ps1 -Mode HealthOnly`. Exit 0/1/2.
- `agency-os/reports/audit/` directory created (new — first Tier 3 logic audit; future audits append same path pattern)
- AGENTS.md `## 代理自動工具使用規則` — new trigger rule for `lib/repair-center/`, `webhooks/*/route.ts`, `sg-deploy.sh` edits (see AGENTS.md)

### Statistics

| Audited | 🔴 FIXED | 🟢 CLEAN | 🔴 TRACKED (Critical) | 🟠 TRACKED (Major) | 🟡 TRACKED (Minor) | Real production breaks pre-audit | Tooling shipped |
|---------|----------|----------|----------------------|--------------------|--------------------|---------------------------------|-----------------|
| 14 + 5 ref | **10** (5 Critical + 3 Major + 2 Minor) | 8 | 0 | **7** | **9** | 1 (`OPS_INBOX_INGEST_TOKEN` 2026-05-22 — partial overlap with C2/M2 root cause) | 4 (harness + reports/audit/ dir + AGENTS rule + readRequestBody shared helper) |

### Plan v3.2 SSOT contract violations

| Plan reference | Violation finding | Severity | Status |
|---------------|--------------------|---------|--------|
| §五 第 3 層 "任何一個不 OK → rollback-phase1.sh 自動還原" | C1 | 🔴 Critical | 🔴 FIXED 2026-05-23 |
| §四 Critical severity 閘門 | C5 | 🔴 Critical | 🔴 FIXED 2026-05-23 |
| §六 備份驗證 "檔案大小 > 1KB" | M5 | 🟠 Major | 🔴 FIXED 2026-05-26 |

---

## 一鍵架站系統 logic audit (2026-05-26)

**Scope**: 12 files, `lobster-factory/packages/workflows/src/` (create-wp-site, orchestrate-tenant-provisioning, apply-manifest, dispatch-action-run, executor/installManifestStaging, hosting/{resolveStagingProvisioning,mockStagingAdapter,providers/httpJsonStagingAdapter}, integrations/integration-steps, tasks/wp-install-plugins, lib/tenant-provisioning/{types,providers/registry}) + 8 cross-referenced files (build/runs route, contracts, supabaseRestInsert, postTenantIntegrationWebhook, http/env helpers)

**Method**: Full file reads (no excerpts) + critic subagent × 1 round + cross-file grep (callers + SSRF surface + shell injection vectors + env-gate bypass)

**Tool**: critic subagent (manual trigger)

**Origin trigger**: Tier 3 monthly schedule (Bug Hunt 隊列)

**Audit report (full findings)**: [reports/audit/lobster-factory-one-click-site-2026-05-26.md](../../reports/audit/lobster-factory-one-click-site-2026-05-26.md)

### 🔴 FIXED — Critical (3)

- `dispatch-action-run.ts` — **C1** 🔴 FIXED (PENDING_COMMIT) — `ActionRunSchema` + PostgREST `or=` filter + `dispatchRun()` guard; approval_required=true runs blocked at DB query + double-check in application layer
- `app/api/build/runs/route.ts` — **C2** 🔴 FIXED (PENDING_COMMIT) — siteId duplicate check (`.maybeSingle()` before INSERT → 409 `site_run_already_active`); TOCTOU acknowledged, partial unique index noted as follow-up DB migration (out of scope for application-layer patch)
- `create-wp-site.ts` + `integration-steps.ts` — **C3** 🔴 FIXED (PENDING_COMMIT) — `noSsrfUrl()` refine on all 4 URL fields (https-only + RFC-1918 + IPv6 bracket-strip + numeric/hex IP + localhost aliases); response body exfil channel removed from all 5 integration error paths + n8n success path; `btoa` → `Buffer.from()` (m7 bundled)

### 🟠 FIXED — Major (2 of 11)

- `apply-manifest.ts:39` — **M6** 🟠 FIXED (PENDING_COMMIT) — `manifestPath` regex allowlist (`^[a-zA-Z0-9][a-zA-Z0-9_\-./]*\.(json|yaml|yml)$`) + `!p.includes("..")` refine + `path.resolve(MANIFESTS_BASE, ...)` + `startsWith(MANIFESTS_BASE + path.sep)` containment; also fixed stale `manifestAbsolutePath = path.resolve(input.manifestPath)` that re-escaped containment
- `wp-install-plugins.ts:30,33` — **M8** 🟠 FIXED (PENDING_COMMIT) — `slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)` + `wpPath: z.string().regex(^/[a-zA-Z0-9_\-/.]{1,200}$).refine(!includes(".."))` — injection blocked at Zod parse before any SSH exec

### 🟠 TRACKED — Major (9 remaining)

See [full report §Major Findings](../../reports/audit/lobster-factory-one-click-site-2026-05-26.md#-major-findings-11). Still tracked: literal `"TODO_from_staging_ref"` as sshHost (M1), `as { sshHost? }` cast (M2), dry-run writes `status="completed"` to DB (M3), isLicenseError stderr misclassification (M4), production-block check after PostHog event (M5), spawn inherits entire process.env incl. secrets (M7), partial state on webhook 502 (M9), non-atomic dispatch sequence (M10), failure `output_snapshot` omits shellExecution (M11).

### 🟡 FIXED — Minor (1 of 12)

- `integration-steps.ts:339` — **m7** 🟡 FIXED (PENDING_COMMIT) — `btoa` → `Buffer.from(..).toString("base64")` (bundled with C3 PR)

### 🟡 TRACKED — Minor (11 remaining)

Inconsistent bool env parsing (m1/m2), `any` cast on Zod value (m3), misleading pluginCount (m4), double-slash URL (m5), hardcoded sentry.io (m6), allSettled loses service identity (m8), Number(NaN) setTimeout (m9), statSync swallowed (m10), non-valid-v4 mock UUID (m11), HOSTING_PROVISION_PATH accepts absolute URL (m12).

### 🟢 CLEAN

19 items verified clean — see [full report §Verified Clean](../../reports/audit/lobster-factory-one-click-site-2026-05-26.md#-verified-clean). No hardcoded secrets. All credentials sourced from `process.env.LOBSTER_*`. Env-gates (`LOBSTER_ENABLE_DB_WRITES`, `LOBSTER_EXECUTE_MANIFEST_STEPS`) correctly enforced. `supabaseRestInsert` has solid retry + correlation logic.

### Statistics

| Audited | 🔴 Critical | 🟠 Major | 🟡 Minor | ✓ Verified Clean | Hardcoded secrets | Real production breaks pre-audit |
|---------|-------------|----------|----------|------------------|-------------------|----------------------------------|
| 12 + 8 ref | 3 | 11 | 12 | 19 | 0 | 0 (pre-emptive Tier 3 monthly) |

---

## Related Documents (Auto-Synced)
- `docs/operations/BUG_HUNT_PROTOCOL.md`

_Last synced: 2026-05-26 11:05:00 UTC_

