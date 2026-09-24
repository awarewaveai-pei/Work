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
- `scripts/print-today-closeout-recap.ps1` — commit `27d36dc` 2026-05-26 — Pattern B → Pattern A: `git status -sb` (CJK paths) + `git log %s` (CJK subjects) wrapped in `Invoke-WithUtf8Console`; bare `[Console]::OutputEncoding` setter removed; dot-source added
- `scripts/ao-resume.ps1` — **17/17 sites, 2026-08-25** — every native-git capture wrapped (helper was already dot-sourced at L36; only the call sites were bare). REALTEST: extracted the real `Invoke-NonFastForwardRecovery` via AST and ran it against a fixture repo with a CJK `-LATEST.md` conflict and `core.quotePath=false` — OLD aborted (`git checkout --theirs` failed on the mojibaked path, rc=1, remote commit lost), NEW auto-resolved, rebased, pushed, rc=0.
- `scripts/lib/git-safe-ops.ps1` — **4/4 sites, 2026-08-25** — this file is the documented SSOT for safe git invocation but only ever handled the EAP=Stop/NativeCommandError footgun, never the CP950 decode footgun, and it was **never registered in the backlog table below** (created 2026-05-30, after that table was written). Helper dot-source added + `Invoke-SafeGitFetch`/`Push`/`Capture` wrapped, so all 5 dot-sourcing callers inherit the protection. Verified: `-SelfTest` 12/12, `test-git-safe-ops-matrix.ps1` T1-T8 8/8.
- `scripts/ao-close.ps1` — **6 of 23 sites, 2026-08-25** (all line numbers below are post-change) (18 remain, still 🟡 TRACKED below) — surfaced by `codex-oracle -Mode review` on the two fixes above. Both were **safety gates disarmed by mojibake**, not cosmetics:
  - `:216` `git log --format=%s` feeding the `-AllowAheadCommits` bypass. Reproduced on a big5 console: 400 commits (200 human + 200 CJK-subject checkpoints) → bare capture returned **377 lines / 177 human**, wrapped returned **400 / 200**. A human subject absorbed into the preceding `[claude] checkpoint:` line matches the checkpoint regex, so `$humanCommits` can reach 0 and AO-CLOSE waves through unpublished human work. Same shape as the 2026-05-22 origin incident.
  - `:152` (+ `:253`, `:390`, `:683` — the three identical `$branch` siblings) `git rev-parse --abbrev-ref HEAD`. Reproduced with a non-ASCII branch: OLD returned a corrupted name (2 CJK chars → 3), `origin/<garbled>` failed to verify, `RemoteFound=$false` → **the whole ahead/behind preflight block, including the `:216` gate, was skipped**. NEW returns the correct name and `RemoteFound=$true`.
  - `:605` `git diff --cached --name-only` feeding the sensitive-path guard. **Hardening, not a reachable bug** — recorded honestly because an overstated note would make the next reader treat it as load-bearing. `git diff --cached --name-only` emits index order (sorted by path bytes), so ASCII sensitive prefixes (`.claude/` 0x2E, `mcp-local-wrappers/` 0x6D) always precede non-ASCII paths (0xE4+) and can never be the absorbed tail of a mojibaked predecessor; a sensitive path under a CJK directory keeps the `/` before `.claude`, and `\.credentials\.json$` still anchors at the end of a merged string. Verified: 303 staged files / 3 sensitive / `core.quotePath=false` / big5 console → bare and wrapped both matched 3/3. Wrapped anyway plus `-c core.quotepath=false`, so a security gate stops depending on a git config nobody owns and matches the sibling gate at `verify-closeout-completeness.ps1:61` byte-for-byte.

### 🟢 CLEAN (reviewed, no action)

#### Out of scope (no external command stdout capture)
- `scripts/merge-closeout-inbox-into-progress.ps1` — 0 external commands (pure markdown aggregator)
- `scripts/apply-closeout-task-checkmarks.ps1` — `[StringComparison]::Ordinal` for CJK substring, regex matches only ASCII structure
- `scripts/fetch-external-signals.ps1` — `Invoke-RestMethod` (HTTP charset header handled by .NET, no stdout encoding path)
- `scripts/generate-integrated-status-report.ps1` — pure .md aggregator; no external command captures. BOM consistency fixed in commit `27d36dc` 2026-05-26: `Set-Content -Encoding UTF8` (PS5=BOM / PS7=no-BOM) replaced with `[System.IO.File]::WriteAllText($path, $text, UTF8NoBOM)` — PS5/PS7 consistent no-BOM output
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

Tool reports **85 remaining unprotected sites** across these files (was 117; 2026-08-25 closed 27 across `ao-resume.ps1`, `lib/git-safe-ops.ps1` and 6 of `ao-close.ps1`). Most are ASCII-only operations (`git rev-parse`, `git status`, `git rev-list --count`, `docker ps --format`) where CP950 trap won't materialize because the data flowing through is pure ASCII. Listed here as backlog:

| File | Capture count | Risk profile |
|------|---------------|--------------|
| `scripts/ao-close.ps1` | 17 (was 23) | **Low — every remaining site classified 2026-08-25, no unknowns left.** The old "other 21 are ASCII metadata" blanket note was wrong and is what hid a live gate bypass for 3 months; it is replaced by the per-site table below. 6 sites 🔴 FIXED above. Remaining 17: **12 capture nothing that reaches a decision** (`:131` `:371` `:578` `rev-parse --git-dir` → `$LASTEXITCODE` only; `:159` `:259` `:393` `rev-parse --verify` → `Out-Null` + exit code; `:145` `status -sb` → `Write-Host` only; `:382` `fetch` / `:584` `add -A` / `:671` `:673` `commit` / `:690` `push` → `Out-Host`/discarded). **5 feed a decision but are structurally ASCII**: `:162` `:395` `rev-list --left-right --count` (digits); `:172` `status --porcelain` (used only as `.Count -gt 0` — a swallowed newline can take N to N-1 but never a non-empty set to 0); `:266` `log --pretty=format:"%h"` (short hashes); `:318` `log -1 --pretty=format:"%s" --grep="chore: AO-CLOSE sync"` (the `--grep` pins the subject to ASCII and `-1` leaves no neighbouring line to merge with — **note this is the same command as the broken `:216`, and it is NOT the same bug; "looks like" needed verifying in both directions**). If a future oracle round reports this file again, the classification above is wrong — that is a falsifiable claim, which is the point. |
| ~~`scripts/ao-resume.ps1`~~ | 0 (was 17) | 🔴 **FIXED 2026-08-25** — see FIXED section. The old "diff --name-only captures ASCII paths / no CJK capture risk" rationale silently depended on `core.quotePath` keeping its default `true`; nothing owned that config, and `codex-oracle.ps1:93` + `verify-closeout-completeness.ps1:61,349` deliberately pass `-c core.quotepath=false`, so raw UTF-8 paths are a live code path in this repo, not a hypothetical. |
| `scripts/check-three-way-sync.ps1` | 16 | Low — all git status/rev-parse/fetch (ASCII) |
| `scripts/git-align-main-aoresume-feature.ps1` | 9 | Low — all git align ops (ASCII); count bumped 8→9 on 2026-05-28 by Phase Z adding `Invoke-GitFetchWithRetry` (line 140 `& git fetch origin --prune 2>&1`); same risk profile as the other 8 sites in this file |
| `scripts/git-audit-tracked-remote.ps1` | 7 | Low — git ls-files, status (could have CJK paths) |
| `scripts/check-deploy-drift.ps1` | 7 | Low — git fetch/rev-parse (ASCII commit hashes) |
| `scripts/commit-checkpoint.ps1` | 5 | Medium — `git commit -m $Message` (message may have CJK) |
| `scripts/bootstrap-local-wordpress-windows.ps1` | 5 | Medium — `wp core install --title=...` could have CJK title |
| `scripts/lobster-trigger-deploy.ps1` | 3 | Low — SSH to EU VPS (deployment output, mostly ASCII) |
| `scripts/sync-{endpoint-alert-heartbeat,slack-alert-webhooks,pagerduty-endpoint-alert,observability-grafana-content,grafana-alerting-slack}.ps1` (5 scripts) | 8 total | Medium — SSH + scp; remote bash stderr could contain non-ASCII |
| `scripts/git-prune-merged-local-branches.ps1` | 6 | Low — branch ops, ASCII |
| `scripts/check-claude-sync.ps1` | 2 | Low |
| `scripts/fetch-external-signals.ps1` | 1 | Low — `git rev-parse --show-toplevel` (ASCII path) |
| `scripts/machine-environment-audit.ps1` | 5 | Low |
| `scripts/phase4-weekly-check.ps1` | 1 | Low — 🔴 FIXED 2026-05-30: wrapped `git rev-parse --show-toplevel` in `Invoke-WithUtf8Console` (same edit also rewrote Check 3 to status-frontmatter logic) |
| `scripts/scan-local-config-for-secrets.ps1` | 1 | Low |
| `scripts/sync-claude-userlevel.ps1` | 1 | Low — 🔴 FIXED b791bfb+followup: wrapped `git rev-parse` in `Invoke-WithUtf8Console` |
| `scripts/verify-closeout-completeness.ps1` | 2 | Low — 🔴 FIXED 2026-06-04: added `_console-encoding-helpers.ps1` dot-source + wrapped `git rev-parse` (L40) and `git diff --cached` (L45) in `Invoke-WithUtf8Console`; same edit also adds DEBUG-TAG gate for `/diagnose` Phase 4 cleanup |
| ~~`lobster-factory/infra/trigger/deploy-workflows.ps1`~~ | 0 (was 1) | **Retired 2026-09-23** — now a tombstone (`Write-Error` + `exit 1`, no external command); the deploy path is `scripts/lobster-trigger-deploy.ps1` (SITE_WATCH_MASTER_PLAN §7 step 9). Previous note: **False positive** — `docker info 2>&1 \| Out-Null` discards all output; no stdout decode occurs; CP950 trap does not apply. Also fixed commit `27d36dc` 2026-05-26: L72 `Get-Content $PkgPath -Raw` + L85 `Get-Content $PosthogEnvSource` now both use `-Encoding UTF8` |
| `mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1` | 1 | Low |
| `mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1` | 2 | Low |
| `scripts/playwright-runner.ps1` | parse-error | 🔴 FIXED 2026-05-30: root cause **WAS** encoding (BOM-less non-ASCII decorative glyphs `╔═╗ ► ✔ ⚠ ✘ → —` mis-decoded by PS5.1 under CP950 → broken string terminator at L340). Fixed by converting all decorative chars to ASCII (`[OK]`/`[!]`/`[X]`/`->`/`--`). Verified: `Parser::ParseFile` OK + smoke 26/0/4 + `audit-cp950-traps` clean. Original "unrelated to encoding" diagnosis was incorrect. |
| `scripts/generate-customer-delivery-status.ps1` | parse-error (79) | 🔴 TRACKED: same encoding root cause (41 non-ASCII, PARSE FAIL under CP950) but **distinct subclass** — non-ASCII is CJK **data** (department cluster labels e.g. `倉儲/履約`), NOT strippable to ASCII. Fix = add UTF-8 BOM **or** externalize catalog to UTF-8 JSON read with `-Encoding UTF8` (preferred, matches DEPARTMENT_CLUSTER_CATALOG pattern). Not yet fixed — separate task. |
| `scripts/rebuild-content-studio-4cards.ps1` | parse-error (46) | 🔴 FIXED 2026-08-29: same subclass as `generate-customer-delivery-status.ps1` above — non-ASCII is real CJK **data** (React/JSX UI strings, e.g. `電子報導讀（FluentCRM 草稿）`), not decorative. Fixed by adding a UTF-8 BOM (byte-level prepend, content bytes unchanged, verified valid-UTF-8 before and after). Never previously listed in this registry (only tracked in TASKS.md) — surfaced for real fixing because this was `-ParseBreakOnly`'s first-ever live run (see the `system-health-check.ps1 $root` fix, `unencoded-raw-read` section below): the gate had silently skipped since 2026-05-30 due to an unrelated path-resolution bug, so this known drift was never actually blocking AO-CLOSE until today. Verified: `Parser::ParseFile` OK + `audit-cp950-traps.ps1 -ParseBreakOnly -Quiet` scanned=167 clean=167 drift=0. |

**Hardening strategy** (per AGENTS.md auto-trigger): when any of these scripts gets an `Edit`/`Write`, Claude must:
1. Run `/audit-encoding --file <path>` on the changed file
2. If still flagged, wrap the capture in `Invoke-WithUtf8Console { ... }` and add helper dot-source
3. Mark the entry here as `🔴 FIXED`

---

## CP950 class 3: unencoded-raw-read (2026-08-29)

**Scope**: same 5 default scan roots as class 1/2 above (167 `.ps1` files). Detector added as a
third function (`Get-UnencodedRawReadFindings`) inside the same tool — same "CP950 encoding-trap
audit" umbrella, distinct code shape (data-file read, not command capture or script self-parse).

**Method**: AST detection of `Get-Content` CommandAst nodes where `-Raw` is present and
`-Encoding` is absent (both matched by unambiguous PowerShell parameter-name prefix, not exact
string). Deliberately scoped to `-Raw`; non-Raw (line-array) `Get-Content` carries the same
theoretical CP950 fallback-decode risk but is out of scope for this class (see 🟢 CLEAN /
scope-boundary note below).

**Tool**: [scripts/audit-cp950-traps.ps1](../../../scripts/audit-cp950-traps.ps1) (`Get-UnencodedRawReadFindings`, `-RawReadOnly` gate switch) → invoked via `/audit-encoding` slash command

**Origin trigger**: 2026-08-29 `codex-oracle.ps1:143,406,495` `Get-Content -Raw` without
`-Encoding` — Windows PowerShell 5.1 on a zh-TW host decoded a BOM-less UTF-8 artifact file
(written by the external `codex` CLI) using the system ANSI codepage (CP950). CP950's
unmappable-sequence fallback (`0x3F '?'`) makes the loss of multi-byte CJK sequences
**irreversible** — no way to recover original bytes from the corrupted string. 29 prior artifacts
under `agency-os/reports/oracle/` were corrupted this way before discovery; those are not
recoverable and were left as-is (the corruption is unrecoverable, re-generating history is not
useful). Fixed same day, commit `fe87cf05`.

### Real-world validation this is a distinct class, not overlap with class 1

`scripts/lib/git-safe-ops.ps1` had **all 4 of its class-1 (capture-trap) sites already hardened**
(see class 1 FIXED list above). This audit still found 2 **new, independent** unencoded-raw-read
sites in the exact same file (`:325`, `:332`, inside the `-SelfTest` block) — proof this class
catches real gaps that class-1 hardening does not touch, not a re-detection of the same bug.

### 🔴 FIXED (23/23 sites found by the initial full scan — 0 backlog left; gate `-RawReadOnly` wired as a hard AO-CLOSE check, same tier as class 2)

All fixed by adding `-Encoding UTF8` (repo convention — verified 100% of ~90 pre-existing
`-Raw -Encoding` call sites already use this value, no case-by-case judgment needed):

- `scripts/ao-close.ps1:881` — reads back `ao-close-last.txt` before overwriting it (writer uses BOM-less UTF8; content is a `.Trim()`-ed ISO-8601 timestamp, so CP950-decode-safe today, but implicit/fragile — fixed rather than left to that assumption)
- `scripts/ao-resume.ps1:843` — monthly-checks-last.txt stamp read (same ASCII-timestamp shape as above)
- `scripts/ao-resume.ps1:993` — ao-resume-last.txt stamp read (same shape)
- `scripts/bootstrap-local-wordpress-windows.ps1:112` — reads `php.ini` before regex-editing it; a CJK path component (e.g. non-ASCII Windows username) would have corrupted the whole content on read
- `scripts/check-claude-sync.ps1:237` — reads `.mcp.json` for placeholder-syntax linting; config JSON, real risk if any field ever carries non-ASCII
- `scripts/check-supabase-memory-monthly.ps1:56,57` (this is `scripts/`, distinct from the like-named `agency-os/scripts/check-supabase-memory-monthly.ps1`, which was already clean) — SSH stdout/stderr capture; remote docker error text could carry non-ASCII
- `scripts/open-supabase-ssh-tunnel.ps1:107,129` — SSH stderr tail read for diagnostics; remote error text could carry non-ASCII
- `scripts/ops-network-precheck.ps1:31` — `curl.exe` stderr capture
- `scripts/phase4-weekly-check.ps1:115` — Python checker stderr capture
- `scripts/refresh-cf-origin-ips.ps1:46` — SSH stdout capture, parsed by regex for a range count
- `scripts/system-guard.ps1:211` — reads back a status file this script itself writes via `Set-Content -Encoding UTF8` (PS5.1 always BOM-writes "UTF8", so this read was safe today via BOM round-trip — same "Pattern B safe" logic already coded for class 2's BOM short-circuit) — fixed anyway rather than rely on an implicit round-trip nothing else guards
- `scripts/test-git-safe-ops-matrix.ps1:87,126,152,162,170,177` — test fixture reads (git-network ledger JSON + `ao-close.ps1` content-grep); this file matches the audit's default scan filter (`test-` prefix, not `.test.ps1` suffix, so not excluded) — fixed for consistency since the fix is harmless and future test fixtures could add CJK content
- `scripts/verify-build-gates.ps1:118` — reads `.env.example`; effectively ASCII today (env var names) but no guarantee
- `scripts/verify-shared-ai-governance.ps1:89` — `Read-JsonFileOrFail` reads MCP registry JSON (`.mcp.json` / `mcp/registry.template.json`) for cross-file server-name diffing
- `scripts/lib/git-safe-ops.ps1:325,332` — reads back the git-network ledger JSON inside `-SelfTest`; see "distinct from class 1" note above

### 🟢 CLEAN (scope boundary, not a finding)

- **Non-`-Raw` `Get-Content` calls** — line-array reads carry the same CP950 fallback-decode risk in principle, but this class is scoped to `-Raw` only, matching the actual 2026-08-29 incident and the task that commissioned this class. Documented here as an explicit boundary (not silently ignored) — candidate for a future Tier-3/4 backlog item if it ever bites in practice. Critic review (2026-08-29, S3) sized this: exactly 1 site currently in scan scope, `scripts/ops-console-bootstrap.ps1:20` — cheap to close if ever prioritized.
- **`agency-os/scripts/check-supabase-memory-monthly.ps1`** — no `-Raw` reads at all (different file from `scripts/check-supabase-memory-monthly.ps1` above, which is the one with the finding).
- **Files outside the 5 default scan roots** — critic review (2026-08-29, m5) found 17 tracked `.ps1` files never reach this tool, including `automation/TENANT_AUTOMATION_RUNNER.ps1` and `agency-os/automation/*`. Ran the detector over all 17 explicitly: currently clean (drift=0), so this is a latent blind spot, not a live miss. Candidate: add `automation`, `agency-os\automation`, `mcp\claude-userlevel\hooks` to `$script:DefaultScanPaths`, or drive scanning off `git ls-files '*.ps1'` instead of a fixed root list.
- **Splatted parameters and variable-dispatched command names** — critic review (2026-08-29, m6/S1) found `Get-Content -Raw $p @se` (splat carrying `-Encoding`) and `& $cmd -Raw $p` (variable-held command name) both evade detection entirely (0 occurrences in repo today). The splat case for `-Encoding`'s value specifically fails closed via the M1 fix (unverifiable), but a fully-splatted `-Raw` itself is invisible to the detector, same as it always was for class 1. Not fixed — zero real occurrences to justify the added AST complexity right now.
- **Standalone `agency-os` checkout (no monorepo parent)** — critic review (2026-08-29, m8) noted `system-health-check.ps1:129`'s own comment claims to support this layout, but with 7b/7c now `Add-CriticalFailure`-ing on a missing tool (this session's Codex FINDING 2 fix), that layout would permanently fail both hard gates with no self-heal path, since `audit-cp950-traps.ps1` cannot exist outside a monorepo checkout. Not resolved — needs an operator decision (drop the standalone-layout claim, or give 7b/7c a distinct "no monorepo root at all" branch that doesn't hard-fail), not a code change made unilaterally here.

**Backlog candidate raised by this class (not this class's own scope)**: critic review (2026-08-29, S2) found the WRITE side of this exact bug shape is completely unguarded — `Set-Content`/`Add-Content`/`Out-File` without `-Encoding` also writes CP950/Big5 on this host (measured), and an AST scan of the same 167 files found **10 such sites** (9× `Add-Content` in `mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1`, plus the site fixed as part of M3 above). This is arguably the larger half of the same invariant ("every file I/O declares its encoding," not just "-Raw reads declare theirs") and is sized enough to be its own Build Playbook class, not a `--raw-read-only` scope creep. Logged in [BUG_HUNT_PROTOCOL.md](BUG_HUNT_PROTOCOL.md) backlog as **CP950 class 4: unencoded-file-write**.

### Statistics
| Audited | Fixed | Clean | Tracked | Real production breaks pre-audit |
|---------|-------|-------|---------|----------------------------------|
| 167 files scanned, 23 sites | 23 | scope boundary only (no false-positive backlog) | 0 | 1 (codex-oracle.ps1, 29 corrupted artifacts) |

**FP-rate note (BUG_HUNT_PROTOCOL Step 7 gate)**: detector found 0 false positives in the sense
of "flagged something that didn't need `-Encoding UTF8`" — every one of the 23 sites got the fix
applied, and the fix is a strict improvement with no possible regression (an already-BOM'd or
already-ASCII file decodes identically whether `-Encoding UTF8` is explicit or not; only a
BOM-less non-ASCII file's behavior changes, from wrong to right). The three sites noted above as
"technically safe today" (`ao-close.ps1:881`, `ao-resume.ps1:843`, `ao-resume.ps1:993` via
guaranteed-ASCII content; `system-guard.ps1:211` via BOM round-trip) are not false positives in
the sense that matters here — they were still fixed, at zero cost, rather than left depending on
an implicit assumption nothing else enforces.

### 🛠 TOOL

- [scripts/audit-cp950-traps.ps1](../../../scripts/audit-cp950-traps.ps1) — AST-based detector + Pattern B detection + JSON output mode + single-file mode
- [scripts/_console-encoding-helpers.ps1](../../../scripts/_console-encoding-helpers.ps1) — `Invoke-WithUtf8Console` wrapper helper
- [scripts/lib/git-safe-ops.ps1](../../../scripts/lib/git-safe-ops.ps1) — SSOT for safe git invocation; since 2026-08-25 it satisfies BOTH invariants (EAP=Continue **and** UTF-8 decode), so routing a new git call through `Invoke-SafeGit*` is now the one-step way to be correct
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

**Status**: 🔴 FIXED — committed `f933312` 2026-05-23; **confirmed deployed on SG VPS 2026-05-26** (`.deployed-commit = 2311d6e`, which is a descendant of `f933312`). Handler is live.

**Discovered during**: 2026-05-23 B-Minimal VPS auto-reboot deployment, P3 incident closure step. After SG reboot manually cleared the underlying signal, the operator-visible Ops Inbox row remained `status=open` because the webhook code path did not actively resolve incidents on netdata CLEAR transitions.

**Root cause** (historical):
- `fingerprint.ts` used `raw.alarm` (label text including runtime value e.g. `= 1 status`) — label changes between WARNING/CLEAR so fingerprints didn't match across transitions
- `route.ts` had skip-and-return on CLEAR (`{"skipped": "netdata_clear"}`) — no attempt to resolve the matching open incident

**Fix implemented** (commit `f933312` 2026-05-23):
1. **`lib/ops-inbox/fingerprint.ts:32-43`** — netdata case: use `raw.name` (stable metric ID e.g. `system_post_update_reboot_status`) as primary key; fallback chain `name → alarm_id → alarm`
2. **`app/api/webhooks/netdata/route.ts:44-70`** — CLEAR active resolve: look up open incident by stable fingerprint + environment, set `status=resolved` + `resolved_at` + `resolved_by='netdata-auto-resolve-on-clear'`; idempotent via `.eq("status","open")` filter
3. **`lib/ops-inbox/__tests__/fingerprint.test.ts`** — 5 vitest cases: WARNING/CLEAR same fingerprint, three-layer fallback, different host = different fingerprint
4. **SQL backfill** — `UPDATE 13` stale netdata incidents (`resolved_by='stale-backfill-2026-05-23-fingerprint-refactor'`); post-backfill `SELECT count(*) WHERE source='netdata' AND status='open'` = 0

**Production deploy**: `f933312` is ancestor of deployed commit `2311d6e` on SG VPS — confirmed live 2026-05-26.

**Tracked task**: `agency-os/TASKS.md` §Encoding 防護延伸 → closed 2026-05-26 (sg-deploy confirmed).

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

### 🔴 FIXED — Major (2026-05-26 / 2026-05-28)

- **M1** `service.ts:updateRunLinks` — 2026-05-26 — Enum validation + terminal state guard added. `body.state` validated against `REPAIR_RUN_STATES` const; terminal run writes blocked; `body.deploy_status` validated against `REPAIR_DEPLOY_STATUSES` const. Files: [types.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/types.ts) (new consts), [service.ts:updateRunLinks](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts). Tests: [update-run-links.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/update-run-links.test.ts) 14 cases.
- **M5** `backup.ts:33-67` — 2026-05-26 — Backup webhook integrity gate: rejects non-JSON 200 (Cloudflare/nginx page), rejects JSON with no `backup_id`/`backup_ref`, enforces `size_bytes >= 1024` when present. Implements Plan §六 "No backup means no repair run". File: [backup.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/backup.ts). Tests: [backup-webhook.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/backup-webhook.test.ts) 10 cases.
- **M6** `.github/workflows/auto-repair-claude.yml` — 2026-05-26 — Forbidden-path-check CI step added between Claude run and PR creation. Blocks PR if Claude touched `.github/workflows/`, `nginx/`, `Dockerfile`, `docker-compose*`, `/migrations/`, `.env*`. File: [auto-repair-claude.yml](../../../.github/workflows/auto-repair-claude.yml).
- **M7** `service.ts:approveRepairRun` — 2026-05-28 — commit `c872012` — Null-check after backup→state-transition: `updateRun("approved")` returning null now causes early return with `error: "state_transition_failed_after_backup"` instead of silently falling back to `?? run` (stale state) and continuing. Backup_ref preserved in error detail for manual recovery. File: [service.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts).
- **M8** `backup.ts:safeScriptPath` — 2026-05-28 — commit `c872012` — Added `value.includes("..")` check before the allowlist regex. Prevents path-traversal env-var injection (e.g. `../../etc/cron.daily/evil.sh`). The `.` character in the charset is still allowed for valid filenames like `backup-phase1.sh`. Shell-safety invariant documented in comment. File: [backup.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/backup.ts).

### 🔴 FIXED — Major (Batch 3, 2026-06-04)

- **M9** `service.ts:escalateAnalysisOnlyRun` — commit `<batch3>` — Replaced `updateRun(id, patch)` (blind UPDATE WHERE id=X) with atomic conditional UPDATE `.eq("policy","analysis_only").not("state","in",(terminal list))`. Concurrent double-escalation now returns `state_conflict_concurrent_modify` instead of silently overwriting. File: [service.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts). Tests: [run-state.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/run-state.test.ts) 3 new M9 contract cases.
- **M10** All 6 webhook routes (`sentry`, `uptime-kuma`, `grafana`, `netdata`, `posthog`, `deploy`) — commit `<batch3>` — Replaced JS-computed `occurrence_count = snapshot + 1` upsert with `upsertIncidentAtomic()` helper calling `upsert_incident_atomic` PL/pgSQL RPC (migration [0035](../../../lobster-factory/packages/db/migrations/0035_upsert_incident_atomic.sql)). `SET occurrence_count = ops_incidents.occurrence_count + 1` is row-locked and evaluated atomically. Concurrent retries (Sentry auto-retry class) no longer lose increments. Applied to EU Supabase 2026-06-04. New helper: [upsertIncidentAtomic.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/upsertIncidentAtomic.ts).

### 🟡 Phase 1 CODE COMPLETE — Major (M2/M4, 2026-06-05, rollout pending)

~~M1~~ ~~M5~~ ~~M6~~ ~~M7~~ ~~M8~~ ~~M9~~ ~~M10~~ FIXED above. ~~M3~~ closed by C3. M2/M4 = Phase 1 code landed (向後相容、env 未設=現況、**未部署**)；Phase 2 rollout + Phase 3 constraint swap 為 operator-gated。

- **M2** per-source webhook token — **Phase 1 code done (not yet live)**. New `verifyIngestSource()` for the 5 monitoring webhooks with per-source `OPS_INBOX_<SOURCE>_TOKEN` + dual-accept legacy fallback; shared `verifyIngestToken()` LEFT UNCHANGED for the server-to-server/read endpoints (ops/probe, inbox/digest, inbox/incidents, webhooks/deploy, webhooks/tenant-integration). docker-compose + .env.example plumbed (empty defaults = identical to today). 12 matrix tests. tsc 0 + vitest 197/197 + critic (no Critical; Major docker-compose env-passthrough + Minor captureMessage-DoS + empty-string contract all fixed). Files: [verifyIngestToken.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/verifyIngestToken.ts), 5 `webhooks/*/route.ts`. **Phase 2 rollout (secrets→vault→SG .env→sg-deploy→per-platform token→flip dual-accept off) = operator-gated.** Tier-2 HMAC (Sentry/Grafana) deferred — no signing secret exists today, greenfield. Design SSOT: [auto-repair-m2-m4-design-research-2026-06-05.md](../../reports/audit/auto-repair-m2-m4-design-research-2026-06-05.md). Handoff: handoffs/2026-06-05-2017-tomo-201752.md.
- **M4** fingerprint forgery — **Phase 1 code done (not yet live, depends on M2)**. New `computeFingerprintV2()` = HMAC-SHA256(key=salt, msg=v1); `computeFingerprint()` (the live dedup key) LEFT UNCHANGED. Migration [0036](../../../lobster-factory/packages/db/migrations/0036_fingerprint_v2.sql) adds nullable `fingerprint_v2` + extends `upsert_incident_atomic` RPC (ON CONFLICT stays `(fingerprint, environment)`); **not yet applied**. 6 V2 tests. critic (sha256-concat→HMAC Major fixed) + db-expert (additive migration safe; down-block + CREATE OR REPLACE added). **Phase 2 apply+backfill / Phase 3 constraint swap = operator-gated.**

### 🔴 FIXED — Minor (2026-05-26 / 2026-05-28)

- **m1** `policy.ts:74` — 2026-05-26 — Dead code `if (severity === "critical") return "triage_needed"` deleted. Unreachable because only `source=manual` reaches this branch, and the following line already covers that case. File: [policy.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts).
- **m7** `service.ts:updateRunLinks` — 2026-05-26 — `github_pr_url` hostname validated via `new URL()` — rejects `javascript:` and non-`github.com` hostnames before storage. Bundled with M1 fix. Tests: [update-run-links.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/update-run-links.test.ts) 4 dedicated URL cases.
- **m6** `run-state.ts` — 2026-05-28 — commit `c872012` — Added `isStrictTerminalState(state: string)` export for write gates where `undefined` must not bypass the gate. Kept `isTerminalState(undefined→true)` for UI display callers (hides buttons on unknown state, the safe direction). Write gate in `service.ts:updateRunLinks` updated to use strict version. Tests: 15 new cases in [run-state.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/run-state.test.ts).
- **m8-GHA** `.github/workflows/auto-repair-claude.yml` — 2026-05-28 — commit `c872012` — Slack notification now distinguishes "code patch ready for review" vs "analysis only (no code changes produced)" based on `BRANCH_NAME` presence. Operator now knows whether to expect a PR. `BRANCH_NAME` guarded via `[ -n ]` only — not interpolated into payload (injection-safe). File: [auto-repair-claude.yml](../../../.github/workflows/auto-repair-claude.yml).
- **m9-docstring** `policy.ts:severityRequiresHumanReview` — 2026-05-28 — commit `c872012` — Docstring corrected to accurately describe the `triage_needed` gate: run is held at `triage_needed` state until explicit operator confirmation via POST `/confirm-critical`. C5 introduced this gate; m9 (dead-helper wired) was already closed alongside C5. File: [policy.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts).

### 🔴 FIXED — Minor (Batch 2, 2026-05-28)

- **m2** `verifyIngestToken.ts` + `telegramAuth.ts` — commit `832c562` — Removed `if (a.length !== b.length) return false` length-leak. Both sides now HMAC-SHA256 digested to fixed 32-byte output before `crypto.timingSafeEqual` — timing is independent of input length. Fixed same pattern in `telegramAuth.ts` (private copy, same root cause). Tests: 17 cases in [verifyIngestToken.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/__tests__/verifyIngestToken.test.ts).
- **m10** `archive_stale_repair_runs` function — commit `832c562` — Migration [0032_archive_triage_needed.sql](../../../lobster-factory/packages/db/migrations/0032_archive_triage_needed.sql): `CREATE OR REPLACE FUNCTION` extended to also archive `triage_needed` runs older than 14 days. Same `(int)` signature — pg_cron job and service.ts callers require no changes. Applied to EU Supabase 2026-05-28.
- **m11** `repair_runs` RLS deny-anon policy — commit `832c562` — Migration [0033_repair_runs_rls_deny_anon.sql](../../../lobster-factory/packages/db/migrations/0033_repair_runs_rls_deny_anon.sql): `CREATE POLICY "deny_anon_all" … USING (false) WITH CHECK (false)` for anon role. Eliminates silent-empty-result footgun for future anon-key queries. Applied to EU Supabase 2026-05-28.

### 🔴 FIXED — Minor (Batch 3, 2026-06-04)

- **m4** `normalize/uptime-kuma.ts:16` — commit `<batch3>` — Removed `monitor.hostname` from environment inference fallback. `hostname` is attacker-controlled in the webhook payload; an attacker could set `hostname="staging.evil.com"` to downgrade a production `critical` alert to `staging medium`. Fix: environment now relies exclusively on the explicit operator-set `env` tag. `kumaHostnameToService(monitor.hostname)` service lookup retained (whitelist map, attacker cannot add entries). Tests: [normalize-uptime-kuma.test.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/__tests__/normalize-uptime-kuma.test.ts) 6 new m4 regression cases.

### 🟡 TRACKED — Minor (0 remaining from original audit)

~~m1~~ ~~m2~~ ~~m4~~ ~~m6~~ ~~m7~~ ~~m8~~ ~~m9~~ ~~m10~~ ~~m11~~ FIXED above. ~~m3 posthog ordering~~ ~~m9 dead helper wired~~ closed alongside Criticals (2026-05-23). ~~m5 netdata silent CLEAR~~ deduped → [Ops Inbox webhook CLEAR auto-resolve audit](#ops-inbox-webhook-clear-auto-resolve--fingerprint-instability-2026-05-23). ~~m8-GHA~~ FIXED Batch 1. All original minors resolved.

### 🛠 TOOL

- [scripts/audit-tools/dogfood-auto-repair.ps1](../../../scripts/audit-tools/dogfood-auto-repair.ps1) — recurring health-probe + logic-finding reminder. Run via `powershell -ExecutionPolicy Bypass -File scripts/audit-tools/dogfood-auto-repair.ps1 -Mode HealthOnly`. Exit 0/1/2.
- `agency-os/reports/audit/` directory created (new — first Tier 3 logic audit; future audits append same path pattern)
- AGENTS.md `## 代理自動工具使用規則` — new trigger rule for `lib/repair-center/`, `webhooks/*/route.ts`, `sg-deploy.sh` edits (see AGENTS.md)

### Statistics

| Audited | 🔴 FIXED | 🟢 CLEAN | 🔴 TRACKED (Critical) | 🟠 TRACKED (Major) | 🟡 TRACKED (Minor) | Real production breaks pre-audit | Tooling shipped |
|---------|----------|----------|----------------------|--------------------|--------------------|---------------------------------|-----------------|
| 14 + 5 ref | **15** (5 Critical + 5 Major + 5 Minor) | 8 | 0 | **4** | **5** | 1 (`OPS_INBOX_INGEST_TOKEN` 2026-05-22 — partial overlap with C2/M2 root cause) | 4 (harness + reports/audit/ dir + AGENTS rule + readRequestBody shared helper) |
| _+Batch 1 (c872012, 2026-05-28)_ | _+5: M7, M8, m6, m8-GHA, m9-doc_ | | | _M3 also closed by C3_ | | | |

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

- `dispatch-action-run.ts` — **C1** 🔴 FIXED (9b27506) — `ActionRunSchema` + PostgREST `or=` filter + `dispatchRun()` guard; approval_required=true runs blocked at DB query + double-check in application layer
- `app/api/build/runs/route.ts` — **C2** 🔴 FIXED (9b27506) — siteId duplicate check (`.maybeSingle()` before INSERT → 409 `site_run_already_active`); TOCTOU acknowledged, partial unique index noted as follow-up DB migration (out of scope for application-layer patch)
- `create-wp-site.ts` + `integration-steps.ts` — **C3** 🔴 FIXED (9b27506) — `noSsrfUrl()` refine on all 4 URL fields (https-only + RFC-1918 + IPv6 bracket-strip + numeric/hex IP + localhost aliases); response body exfil channel removed from all 5 integration error paths + n8n success path; `btoa` → `Buffer.from()` (m7 bundled)

### 🟠 FIXED — Major (2 of 11)

- `apply-manifest.ts:39` — **M6** 🟠 FIXED (9b27506) — `manifestPath` regex allowlist (`^[a-zA-Z0-9][a-zA-Z0-9_\-./]*\.(json|yaml|yml)$`) + `!p.includes("..")` refine + `path.resolve(MANIFESTS_BASE, ...)` + `startsWith(MANIFESTS_BASE + path.sep)` containment; also fixed stale `manifestAbsolutePath = path.resolve(input.manifestPath)` that re-escaped containment
- `wp-install-plugins.ts:30,33` — **M8** 🟠 FIXED (9b27506) — `slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)` + `wpPath: z.string().regex(^/[a-zA-Z0-9_\-/.]{1,200}$).refine(!includes(".."))` — injection blocked at Zod parse before any SSH exec

### 🟠 TRACKED — Major (9 remaining)

See [full report §Major Findings](../../reports/audit/lobster-factory-one-click-site-2026-05-26.md#-major-findings-11). Still tracked: literal `"TODO_from_staging_ref"` as sshHost (M1), `as { sshHost? }` cast (M2), dry-run writes `status="completed"` to DB (M3), isLicenseError stderr misclassification (M4), production-block check after PostHog event (M5), spawn inherits entire process.env incl. secrets (M7), partial state on webhook 502 (M9), non-atomic dispatch sequence (M10), failure `output_snapshot` omits shellExecution (M11).

### 🟡 FIXED — Minor (1 of 12)

- `integration-steps.ts:339` — **m7** 🟡 FIXED (9b27506) — `btoa` → `Buffer.from(..).toString("base64")` (bundled with C3 PR)

### 🟡 TRACKED — Minor (11 remaining)

Inconsistent bool env parsing (m1/m2), `any` cast on Zod value (m3), misleading pluginCount (m4), double-slash URL (m5), hardcoded sentry.io (m6), allSettled loses service identity (m8), Number(NaN) setTimeout (m9), statSync swallowed (m10), non-valid-v4 mock UUID (m11), HOSTING_PROVISION_PATH accepts absolute URL (m12).

### 🟢 CLEAN

19 items verified clean — see [full report §Verified Clean](../../reports/audit/lobster-factory-one-click-site-2026-05-26.md#-verified-clean). No hardcoded secrets. All credentials sourced from `process.env.LOBSTER_*`. Env-gates (`LOBSTER_ENABLE_DB_WRITES`, `LOBSTER_EXECUTE_MANIFEST_STEPS`) correctly enforced. `supabaseRestInsert` has solid retry + correlation logic.

### Statistics

| Audited | 🔴 Critical | 🟠 Major | 🟡 Minor | ✓ Verified Clean | Hardcoded secrets | Real production breaks pre-audit |
|---------|-------------|----------|----------|------------------|-------------------|----------------------------------|
| 12 + 8 ref | 3 | 11 | 12 | 19 | 0 | 0 (pre-emptive Tier 3 monthly) |

---

## Repo-hygiene audit (2026-09-05)

**Scope**: all `git ls-files`-tracked paths (4715 at time of final run) for `case-collision`; tracked source files (`.ps1 .mjs .js .jsx .ts .tsx .py .sql .sh .cjs`, excluding `node_modules/ Backups/ .next/ dist/ build/ agency-os/reports/ agency-os/memory/daily/ .git/ vendor/ __pycache__/ .venv/ coverage/ out/ .turbo/` and `*.min.*`) for `oversized-file`.

**Method**: deterministic, zero-LLM-judgment. `case-collision` expands every tracked path into all of its directory-prefix levels plus the full path itself, then groups ACROSS THE WHOLE REPO by lowercased form; a group holding more than one distinct original casing is a hit (catches both same-depth file/file collisions and cross-depth file-vs-directory-ancestor collisions — see M1 below for why the depth expansion matters). `oversized-file` is a plain streamed line-count/byte-size threshold (1000 lines OR 100KB) per file.

**Tool**: [scripts/audit-repo-hygiene.ps1](../../../scripts/audit-repo-hygiene.ps1) → invoked via `/audit-repo-hygiene` slash command

**Origin trigger**: 2026-09-05, discovered by hand while closing out `agency-os/TASKS.md:822` — `Projects/internal/hci30` (git index, lowercase) vs `Projects/internal/HCI30/` (disk, uppercase) had drifted apart under Windows' case-insensitive filesystem. By the time it was found the drift had already self-resolved (only lowercase remained, migration `0002_wave1_case_aggregate_up.sql` correctly tracked there), but the underlying risk class — two tracked paths that collide case-insensitively — was never mechanically checked for anywhere else in the repo. Prompted by comparing against a third-party Claude Skill (`Hao0321/claude-skill-code-cleanup`) that does general duplicate/naming-drift/oversized-file scanning; general duplicate-code and naming-drift detection were evaluated and explicitly declined for this repo (see script header comment) since both need judgment calls this repo's critic subagent + `/code-review` + `/simplify` already cover, and a naive mechanical version would risk the >10% FP-rate death spiral this protocol's own Step 7 warns about. Only the fully-mechanical, zero-legitimate-case subset (`case-collision`) and a cheap size threshold (`oversized-file`) were built.

**Critic review BEFORE the hard gate was wired (Build Playbook Step 7)** — first draft ran clean on the real repo (0/4707 case-collision hits) but a dedicated critic pass built and ran three adversarial fixtures against the actual script rather than reasoning abstractly, and reproduced **3 CRITICAL + 4 MAJOR** findings end-to-end:

| # | Finding | Reproduction | Fix |
|---|---------|---------------|-----|
| C1 | This machine's live console is CP950/Big5 (`zh-TW`, confirmed via `[Console]::OutputEncoding`); `git ls-files`'s raw UTF-8 output decoded through it mojibakes CJK filenames, turning two legitimately DIFFERENT tracked files (`docs/丁1.md`, `docs/丁2.md`) into a false collision — and the repo already has 95 non-ASCII tracked paths, 18/19 CJK ones already losing an ASCII char under this decode | Fixture `D:\tmp\hyg-verify-cjk2`: false COLLISION before fix → **0 hits, 2 correctly-distinct tracked files** after | Route every `git` capture through `Invoke-SafeGitCapture` (`scripts/lib/git-safe-ops.ps1`, wraps `Invoke-WithUtf8Console`) instead of a bare `&` capture |
| C2 | An unmerged/mid-merge index lists the same path once per conflict stage (1/2/3); ungrouped, that reads as the path colliding with itself | Fixture `D:\tmp\hyg-verify-unmerged2` (built via `git update-index --index-info` at 3 stages): false `COLLISION: file.txt <-> file.txt <-> file.txt` before fix → **exit 2 with an explicit "index unmerged" message** after | Detect in-progress merge/rebase/cherry-pick/revert markers + `git ls-files --unmerged` up front; refuse (exit 2, not a false exit-1 drift) instead of guessing |
| C3 | The original `try/catch` around a native `git` call does NOT catch a non-zero exit (PowerShell native commands don't throw); a broken git returned `$null`, both loops no-opped, and the tool reported "clean" having checked nothing | Fixture: `-WorkRoot` pointed at a non-git directory → **exit 2** ("could not resolve a git repository root") instead of a silent false "clean" | Check `Invoke-SafeGitCapture`'s explicit `.ExitCode`; treat a 0-path `ls-files` result as an error, not an empty-but-clean repo |
| M1 | Same-depth-only comparison misses the actual origin incident's shape: a **file** colliding with a **different-depth directory ancestor** (`Projects/internal/HCI30/notes.md` vs `Projects/internal/hci30/plan.md` — different leaf names, so same-depth grouping never puts them together) | Fixture `D:\tmp\hyg-verify-dircase2` (built via `git update-index --add --cacheinfo`, since Windows' own case-insensitive filesystem can't even hold both directories to set the fixture up naturally): **0 hits (blind spot)** before fix → **`COLLISION: Projects/internal/HCI30 <-> Projects/internal/hci30`** after | Expand every path into all directory-prefix levels, not just the full leaf path, before grouping |
| M2 | `git rev-parse --show-toplevel` with no `-C` resolves against the *caller's* CWD, not the script's location — the exact bug `audit-cp950-traps.ps1` already fixed under its own M2 (2026-08-29) | Ran from `D:\tmp` (unrelated CWD) → still correctly resolved and audited `D:\Work` | Mirror `audit-cp950-traps.ps1`'s `Resolve-RepoRoot` (`git -C $PSScriptRoot`, Split-Path fallback); added `-WorkRoot` override (same pattern as `commit-checkpoint.ps1`) for explicit callers/tests |
| M3 | `Write-Error` under `$ErrorActionPreference='Stop'` is a terminating error — any `exit <n>` written after it never ran, so every intended "exit 2" was actually an indistinguishable "exit 1" | Mutual-exclusion test (`-CaseCollisionOnly -OversizedOnly` together) → **exit 2** (previously would have been silently 1) | Use `[Console]::Error.WriteLine` + `exit`, never `Write-Error`, for early-exit paths |
| M4 | `TOOL_TRIGGER_MAP.md` declared the `system-health-check.ps1` check 7d hard gate before it was actually wired — a documentation claim pointing at something that didn't exist yet | N/A (doc-only) | Gate wiring landed in the same commit as these fixes; no longer a dangling claim |

Minor/suggestion findings also fixed in the same pass: m1 (`@()`-wrap `.Count` against StrictMode null-crash), m2 (TOCTOU — `Get-Item` moved inside `try`), m3 (stale comment claimed the oversized-file exclude list also applied to case-collision; it never did and correctly shouldn't — a hard gate must have no blind spots, so the comment was fixed, not the behavior), m4 (`-TargetFile`/single-file mode now errors on an untracked path instead of silently reporting "clean"), s1 (broadened the oversized-file exclude list + skip `*.min.*`), s2 (renamed `-File` → `-TargetFile`, avoiding ambiguity with PowerShell's own `-File <script>` launch switch), s3 (wiring comment warns against omitting `-CaseCollisionOnly`), s4 (streamed line-counting via `StreamReader` instead of loading the whole file as a line array — this also fixed an incidental undercount: `scripts/ao-close.ps1` was reported as 1417 lines by the old `Get-Content | Measure-Object -Line` approach when `wc -l` ground-truth is 1492).

**Final re-verification after all fixes** (Build Playbook Step 7, repeated): all three reproduction fixtures re-run and now behave correctly (see table above); full real-repo dogfood re-run: `-CaseCollisionOnly` → **0 hits across 4715 tracked paths**; `audit-cp950-traps.ps1` (the sibling gate) now reports the fixed script itself as clean (was drift=2 on the pre-fix draft). `case-collision` wired as a **hard AO-CLOSE gate** (`scripts/system-health-check.ps1` check 7d, passing `-CaseCollisionOnly -Quiet -WorkRoot $monoRoot`) on the strength of this re-verified 0-hit run; `oversized-file` stays informational-only per its own design (legitimate hits are expected, not a defect class).

### 🛠 TOOL
- `scripts/audit-repo-hygiene.ps1` — case-collision (hard gate) + oversized-file (informational) detectors, `/audit-repo-hygiene` slash command

### 🟡 TRACKED (oversized-file backlog, informational — not required to fix, monthly Tier 3 candidates)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/ContentStudio.tsx` — 4598 lines, 285794 bytes (largest hit)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx` — 2315 lines, 131064 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudio.tsx` — 2186 lines, 108565 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx` — 2187 lines, 108800 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/studio/StudioWorkbench.tsx` — 2121 lines, 117945 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx` — 2066 lines, 109475 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx` — 1873 lines, 86487 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/designs/DesignsGallery.tsx` — 1613 lines, 64801 bytes
- `scripts/ao-close.ps1` — 1492 lines, 93937 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/publish/PublishWizard.tsx` — 1360 lines, 73135 bytes
- `scripts/ao-resume.ps1` — 1348 lines, 79734 bytes
- `Projects/internal/hci30/database/tests/wave1-negative-tests.sql` — 1329 lines, 96163 bytes
- `tests/hooks/runner-parity.test.mjs` — 1307 lines, 73422 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/mockup/MockupStudio.tsx` — 1184 lines, 61279 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/onboard/OnboardWizard.tsx` — 1149 lines, 48340 bytes
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ScriptForge.tsx` — 966 lines, 158375 bytes (byte-threshold trip, not line-count)
- `lobster-factory/scripts/script_forge_video.jsx` — 703 lines, 135285 bytes (byte-threshold trip, not line-count)

### Statistics
| Audited (tracked paths) | case-collision hits | oversized-file hits | Critic findings (pre-deploy) | Real production breaks pre-audit |
|---------|-------|-------|-------|-----------------------------------|
| 4715 | 0 | 17 | 3 Critical + 4 Major + 4 Minor + 4 Suggestion, all fixed same day | 0 (Tier 3-style: incident-adjacent, not itself a production break) |

---

## Related Documents (Auto-Synced)
- `docs/operations/BUG_HUNT_PROTOCOL.md`

_Last synced: 2026-09-04 14:48:33 UTC_

