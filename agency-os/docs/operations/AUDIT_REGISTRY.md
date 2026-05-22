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

## Related Documents (Auto-Synced)
- `docs/operations/BUG_HUNT_PROTOCOL.md`

_Last synced: 2026-05-22 12:54:27 UTC_

