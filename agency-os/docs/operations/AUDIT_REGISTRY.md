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

### 🟢 CLEAN (reviewed, no action)

#### Out of scope (no external command stdout capture)
- `scripts/merge-closeout-inbox-into-progress.ps1` — 0 external commands (pure markdown aggregator)
- `scripts/apply-closeout-task-checkmarks.ps1` — `[StringComparison]::Ordinal` for CJK substring, regex matches only ASCII structure
- `scripts/fetch-external-signals.ps1` — `Invoke-RestMethod` (HTTP charset header handled by .NET, no stdout encoding path)
- `scripts/generate-integrated-status-report.ps1` — pure .md aggregator (BOM cosmetic; cleanup deferred to TASKS)
- `lobster-factory/infra/trigger/{validate-config,preflight-clickhouse}.ps1` — 0 captures
- `lobster-factory/infra/hetzner-phase1-core/scripts/test-ops-inbox-webhooks.ps1` — `Invoke-WebRequest` (HTTP path, same safety as Invoke-RestMethod)

#### Pattern B protected (script-level `[Console]::OutputEncoding = UTF8`)
- `scripts/print-open-tasks.ps1` — subprocess model safe (process exit restores encoding)
- `scripts/print-today-closeout-recap.ps1` — same
- `scripts/backfill-missed-daily.ps1` — uses save+restore via Pattern B (fixed today)

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
| `scripts/sync-claude-userlevel.ps1` | 1 | Low |
| `scripts/verify-closeout-completeness.ps1` | 2 | Low |
| `lobster-factory/infra/trigger/deploy-workflows.ps1` | 1 | Low — `docker info` |
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
| 142 (PS) + 24 (SH) | 5 | 3 | 31 + 24 | 117 | 1 (`backfill-missed-daily.ps1`) | 3 (helper + tool + slash + AGENTS rule) |

---

<!-- next audit class goes here; copy from "## Template" section above -->

---

## Ops Inbox webhook CLEAR auto-resolve + fingerprint instability (2026-05-23)

**Class**: webhook handler completeness — "incident-creating but incident-not-closing" anti-pattern

**Status**: 🟡 TRACKED — bug confirmed, fix deferred to dedicated PR

**Discovered during**: 2026-05-23 B-Minimal VPS auto-reboot deployment, P3 incident closure step. After SG reboot manually cleared the underlying signal, the operator-visible Ops Inbox row remained `status=open` because the webhook code path did not actively resolve incidents on netdata CLEAR transitions.

**Evidence**:
- [`webhooks/netdata/route.ts:29-31`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/netdata/route.ts#L29-L31) — CLEAR signals return `{"skipped": "netdata_clear"}` without touching the matching open incident
- [`lib/ops-inbox/fingerprint.ts:32-33`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/fingerprint.ts#L32-L33) — netdata fingerprint = `sha256("netdata:${host}:${alarm}")`. `alarm` string includes value (e.g. `= 1 status` vs `= 0 status`), so CLEAR and WARNING fingerprints **don't match** even if active-resolve were introduced
- Manual SQL closure of incident `2e66435f-4439-4b6a-a045-ec93e98fbe48` confirms the design gap, not a one-off bug

**Impact** (per BUG_HUNT_PROTOCOL `blast_radius × likelihood × scope`):
- blast_radius: 2 — operator sees stale list, but no production impact
- likelihood: 5 — happens **every single time** a netdata-tracked signal transitions back to OK
- scope: medium — affects all netdata signals (not just `post_update_reboot_status`); ~24+ events/year × 30 years = 720+ stale incidents accumulated

**Fix scope** (NOT done today — separate PR):
1. Stabilize fingerprint: switch netdata to `alarm_id` (already in payload) or strip value from `alarm` string before hashing
2. Active resolve on CLEAR: replace line 29-31 skip-and-return with: look up matching open incident by stable fingerprint, set `status=resolved`, `resolved_at=now()`, `resolved_by='netdata-auto-resolve'`
3. Migration: backfill `ops_incidents.fingerprint` with new algorithm OR add parallel `alarm_id` lookup column
4. Test: vitest case for WARNING → CLEAR transition + duplicate CLEAR (idempotency)

**Why TRACKED, not FIXED today**:
- 2026-05-23 session focused on B-Minimal VPS auto-reboot deployment (15 phases, 8 file changes already)
- Fingerprint refactor + migration deserves independent PR with backup proof + staging dry-run
- Per R0 "最小修改" — not bundling unrelated DB schema concerns into infra automation PR

**Tracked task**: `agency-os/TASKS.md` §工具層 / 基礎建設 / 治理 → "Ops Inbox netdata CLEAR auto-resolve bug + fingerprint instability"

**Workaround until fixed**: manually run `UPDATE ops_incidents SET status='resolved' ...` via `docker exec supabase-db psql` when ops review finds stale incident. Pattern documented in `agency-os/WORKLOG.md` §2026-05-23.

---

## Auto-Repair logic audit (2026-05-23)

**Scope**: 14 in-scope + 5 cross-ref files. Repair Center logic (`lib/repair-center/*`), webhook intake (5 routes), Slack callback, GitHub workflows, sg-deploy.sh Step 6+7 + rollback-phase1.sh, migration 0027.

**Method**: Owner doc baseline read (plan v3.2 + BRIEF + app-architecture + phase2-handoff) → full file reads (no excerpts) → R0 [現況分析] + sequence diagram → 3 parallel `critic` subagent rounds (decision-logic / webhook-intake / orchestration+deploy) → real exec `curl /api/ops/repairs/health` → dogfood harness build + run.

**Tool**: [scripts/audit-tools/dogfood-auto-repair.ps1](../../../scripts/audit-tools/dogfood-auto-repair.ps1) — recurring health-probe + logic-finding reminder harness. Exit 0/1/2.

**Origin trigger**: Tier 3 monthly schedule + Phase 4 observation window closing 2026-06-19 (must clear Criticals before close).

**Audit report (full findings + R0 fix patches)**: [reports/audit/auto-repair-2026-05-23.md](../../reports/audit/auto-repair-2026-05-23.md)

### 🔴 FIXED (now protected)

_(none yet — patches designed in audit report, application deferred to dedicated R0 sessions; entries will move here as commits land)_

### 🟢 CLEAN (reviewed, no action)

- Slack signature verification at [`slack/route.ts:8-25`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/commands/slack/route.ts) — timing-safe + length check + freshness
- GitHub token handling at [`github.ts`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/github.ts) — header-only, no echo to body / logs
- `escalate / human-only / links / archive` routes — all gated by `canApproveCommand` (owner/admin)
- Branch name handling at [`auto-repair-claude.yml:50`](../../../.github/workflows/auto-repair-claude.yml) — claude-code-action emits git-validated `branch_name`, double-quoted, gh CLI not shell-interpreted
- 0027 migration: TypeScript unions match SQL CHECK constraints; foreign key `on delete cascade` intentional; jsonb defaults non-null
- `archiveRun` race: idempotency check via `archived_at`
- `computeFingerprint` SHA-256 use — collision-resistance sufficient for dedup
- `ssh.ts` — no user-data interpolation into commands (env-path concern tracked separately as M8)

### 🔴 TRACKED — Critical (must fix before Phase 4 closeout 2026-06-19)

| ID | File:line | Issue | Patch ref |
|---|-----------|-------|---------|
| C1 | [sg-deploy.sh:163-189](../../../lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh) | Step 7 smoke-fail does NOT invoke `rollback-phase1.sh` — Plan v3.2 §五 third-layer rollback promise unimplemented | Patch 1 in audit report |
| C2 | [redactSecrets.ts:1-35](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/redactSecrets.ts) | Redactor is key-only; payload values containing secrets reach `ops_incidents.raw_payload` unredacted | Patch 2 in audit report |
| C3 | All 5 `webhooks/*/route.ts` | No body-size cap; `await req.json()` accepts unbounded payload → memory DoS | Designed in §C3 of audit report |
| C4 | [api/ops/repairs/route.ts:9-25](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/route.ts) | GET has no role guard + `select("*")` returns `audit_log` (SSH stdout/stderr) to default viewers | Patch 3 in audit report |
| C5 | [service.ts:104](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts) + [policy.ts:82](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts) | `needs_human_review` is a flag, not a pipeline gate; `severityRequiresHumanReview()` is dead code with misleading docstring | Designed in §C5 of audit report |

### 🟠 TRACKED — Major (10 findings)

See audit report §Major Findings table. Includes: state-machine bypass via `updateRun` (M1), per-source HMAC missing (M2), `req.json` blocks future HMAC retrofit (M3), fingerprint forgery for silent suppression (M4), backup webhook accepts non-JSON 200 as success (M5), Claude allowed Edit on `.github/`/`nginx/`/migrations (M6), no mid-sequence recovery in `service.ts` (M7), `safeScriptPath` allows `..` (M8), `escalateAnalysisOnlyRun` TOCTOU (M9), Sentry retry storm loses occurrence_count increments (M10).

### 🟡 TRACKED — Minor (11 findings)

See audit report §Minor Findings table. Highlights: dead code at `policy.ts:74` (m1), bearer length leak (m2), posthog auth ordering (m3), uptime-kuma env from `monitor.hostname` (m4), **m5 netdata silent CLEAR — overlaps with [Ops Inbox webhook CLEAR auto-resolve audit (2026-05-23)](#ops-inbox-webhook-clear-auto-resolve--fingerprint-instability-2026-05-23) — same root cause, deduped here**, `isTerminalState(undefined)===true` footgun (m6), `github_pr_url` accepts `javascript:` (m7), GHA "completed" message on empty branch (m8), `severityRequiresHumanReview` doc lies (m9), `triage_needed` accumulation (m10), RLS missing deny-anon policy (m11).

### 🛠 TOOL

- [scripts/audit-tools/dogfood-auto-repair.ps1](../../../scripts/audit-tools/dogfood-auto-repair.ps1) — recurring health-probe + logic-finding reminder. Run via `powershell -ExecutionPolicy Bypass -File scripts/audit-tools/dogfood-auto-repair.ps1 -Mode HealthOnly`. Exit 0/1/2.
- `agency-os/reports/audit/` directory created (new — first Tier 3 logic audit; future audits append same path pattern)
- AGENTS.md `## 代理自動工具使用規則` — new trigger rule for `lib/repair-center/`, `webhooks/*/route.ts`, `sg-deploy.sh` edits (see AGENTS.md)

### Statistics

| Audited | 🔴 FIXED | 🟢 CLEAN | 🔴 TRACKED (Critical) | 🟠 TRACKED (Major) | 🟡 TRACKED (Minor) | Real production breaks pre-audit | Tooling shipped |
|---------|----------|----------|----------------------|--------------------|--------------------|---------------------------------|-----------------|
| 14 + 5 ref | 0 | 8 | 5 | 10 | 11 | 1 (`OPS_INBOX_INGEST_TOKEN` 2026-05-22 — partial overlap with C2/M2 root cause) | 3 (harness + reports/audit/ dir + AGENTS rule) |

### Plan v3.2 SSOT contract violations

| Plan reference | Violation finding | Severity |
|---------------|--------------------|---------|
| §五 第 3 層 "任何一個不 OK → rollback-phase1.sh 自動還原" | C1 | 🔴 Critical |
| §四 Critical severity 閘門 | C5 | 🔴 Critical |
| §六 備份驗證 "檔案大小 > 1KB" | M5 | 🟠 Major |

## Related Documents (Auto-Synced)
- `docs/operations/BUG_HUNT_PROTOCOL.md`

_Last synced: 2026-05-22 12:54:27 UTC_

