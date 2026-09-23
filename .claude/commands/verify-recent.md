---
name: verify-recent
description: Verify every code file modified this session: syntax, critic review, and a real execution test.
argument-hint: [--ack]
---

Verify all code files modified this session (syntax + critic + real exec test).

Companion to the harness-enforced rule (`mcp/claude-userlevel/hooks/rules/code-change-tracker.js` +
`rules/verify-gate-stop.js` + `rules/verify-gate-commit.js`). git commit is HARD-blocked until tracker is cleared.

## Arguments

- (no arg) → **full verify**: syntax → critic → real exec test → clear tracker on success
- `--trivial` → **syntax-only**: for typo / comment-only / rename edits. Skips critic + exec test, clears tracker.
- `--ack "reason"` → **operator override**: log to daily memory + clear tracker. Use sparingly.
- Unknown flag → **error and exit**; do NOT default to full verify.

> **Risk-tier routing (2026-06-12).** The verify-gate hooks classify every tracked file via
> `hooks/lib/shared.js classifyRisk()` and print its tier. **HIGH-risk files** (auth / RLS / permission /
> secrets / `.env` / api-key / payment / migration / deploy / docker / nginx / CI) **must use full
> verify (no arg)** — `--trivial` is NOT sufficient and `--ack` is discouraged (it still clears, but
> `verify-recent-ack.ps1` writes a LOUD high-risk section to the daily audit so the shortcut is never
> invisible). `--trivial` is appropriate only for **normal-tier** comment/rename/whitespace edits.

## Step 0 — Read tracker (SID via shared helper — same source of truth as JS hooks)

Anchor everything to repo root so the SID cwd-fallback in `Get-VerifySid` matches what the
Node hooks compute (Node hooks run with `process.cwd()` = repo root).

```powershell
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { $repoRoot = $PWD.Path }
$repoRoot = $repoRoot -replace '/', '\'   # normalise to Windows separators
. (Join-Path $repoRoot 'scripts\verify-sid-shared.ps1')
Push-Location -LiteralPath $repoRoot
try {
    $sid = Get-VerifySid
    $tf  = Get-VerifyTrackerPath -Sid $sid
} finally { Pop-Location }
if (-not (Test-Path -LiteralPath $tf)) {
    Write-Host "verify-recent: tracker is empty (sid=$sid) — nothing to verify."
    exit 0
}
$files = @(Get-Content -LiteralPath $tf -Encoding UTF8 | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '^#' }) | Sort-Object -Unique
```

Report: list of files to verify.

## Step 1 — Syntax check (always)

Per extension:

- `.ps1`:
  ```powershell
  $errs = $null
  [System.Management.Automation.Language.Parser]::ParseFile('<path>', [ref]$null, [ref]$errs) | Out-Null
  if ($errs) { Write-Host "PARSE FAIL: $($errs.Count) error(s)"; $errs | Format-List; exit 1 }
  ```
- `.ts`/`.tsx`: prefer project-level `npx tsc --noEmit -p <nearest-tsconfig>` (full context). Single-file `tsc --noEmit --isolatedModules <path>` only as fallback (lower fidelity — many real type errors will be missed because cross-file types aren't loaded).
- `.ts`/`.tsx` **after committing**: `powershell -NoProfile -File scripts/verify-head-typecheck.ps1`. The line above checks the WORKING tree; in a shared working directory that can be green while the commit is not, because a concurrent session's uncommitted declaration is satisfying your import (2026-09-11, commit 656216805 — HEAD did not build for one commit). The script typechecks the committed tree in a throwaway worktree, and refuses to run at all when the local `node_modules` is not the dependency set that ref's own `package-lock.json` declares — it names the drifting packages. Add `-Install` to `npm ci` the ref's own tree instead (minutes, not seconds).
- `.js`/`.jsx`: `node --check <path>`
- `.sh`: `bash -n <path>` (or `shellcheck` if available)
- `.py`: `python -m py_compile <path>`

Fail-fast: if any syntax error → report and STOP (do not clear tracker).

## Step 2 — Critic (skip if --trivial)

Spawn the `critic` subagent with all tracked files as the scope. Brief:

> "Deep review on these N files modified in this session: [files]. Run your full checklist. Focus on edge cases, encoding issues (CP950 / locale), race conditions, real-execution traps (atomicity / partial writes / FS case-sensitivity). Do NOT flag: theoretical risks with no concrete attack path, code not touched by this change, library replacement suggestions, style consistent with surrounding code."

If critic reports 🔴 Critical or 🟠 Major → STOP, present findings, do NOT clear tracker (operator must fix and re-run).

## Step 2.5 — BUGHUNT (skip if --trivial)

Execute per **AGENTS.md R0 §抓蟲** (single SSOT for scope, grep patterns, required roots). Then manually append one of the following to today's `agency-os/WORKLOG.md` before Step 3:

```
- BUGHUNT_DONE: scope=<agency-os,scripts,...> | grep=<pattern> | hits=<N>
- BUGHUNT_WAIVED: <DOC_ONLY|NA> -- <reason>
```

`verify-closeout-completeness` enforces `agency-os` + `scripts` root presence in `scope=` at commit time (see `$bhRequiredRoots` in that script). If stale cross-file references are found → fix in same commit before clearing tracker.

`bughunt-oracle.ps1` also runs at commit time: for ASCII identifier-type patterns in `grep=` (length ≥ 5, no spaces/CJK/regex specials), it runs a literal search in declared scope excluding staged files. Declaring `hits=0` for a symbol that still exists in other files → HARD FAIL.

## Step 3 — Real exec test (skip if --trivial)

For each file, **propose** (do not auto-run if side-effecting) a real-execution test:

- `.ps1` → run with crafted args, observe stdout/stderr/exit code
- `.ts`/`.tsx` → exercise smallest function via vitest, or one-shot `npx tsx`
- `.js` → `node --eval` with smallest function
- `.sh` → `bash -x` for trace
- `.py` → `python -c "from <mod> import <fn>; print(<fn>(...))"`

Report proposed tests as a checklist. Run any that are **safe + cheap** (read-only, no network, no DB).
For tests with side effects, present the command and ASK operator.

## Step 4 — Clear tracker on success

```powershell
Remove-Item -LiteralPath $tf -Force -ErrorAction SilentlyContinue
Write-Host "verify-recent: tracker cleared. git commit is unblocked."
```

或等價地跑 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-clear.ps1`（列出釋放的檔再刪 tracker；repo 外的 scratch 腳本另列）。**必須在一條不含 `git commit` 的指令裡做**：`verify-gate-commit.js` 在 PreToolUse 就擋整條指令，把清除跟 commit 寫在同一條會一起被擋（2026-09-04 實例）。

## `--ack "reason"` variant (atomic helper)

Do NOT inline the clear-and-log here — call the atomic helper via absolute repo-root path:

```powershell
$ackScript = Join-Path $repoRoot 'scripts\verify-recent-ack.ps1'
Push-Location -LiteralPath $repoRoot
try {
    powershell -NoProfile -ExecutionPolicy Bypass -File $ackScript -Reason "<operator-supplied reason>"
} finally { Pop-Location }
```

The helper guarantees: WORKLOG/daily-memory append succeeds BEFORE tracker delete. If append fails, tracker stays, gate stays blocked.

If operator says `/verify-recent --ack` without a reason → ask: "What's the reason? (e.g. 'comment-only edit', 'rename only', 'time-critical hotfix')". Do not proceed without one.

## `--trivial` variant

Only do Step 1 (syntax). Skip Steps 2, 2.5, and 3. Append `- BUGHUNT_WAIVED: DOC_ONLY -- trivial edit (verify-recent --trivial)` to today's WORKLOG. Clear tracker.

## Unknown flag

If args contain any token not in `{--trivial, --ack}` → error: "verify-recent: unknown flag '<flag>'. Valid: (none) | --trivial | --ack 'reason'". Exit without modifying tracker.

## Output format

```
verify-recent: <mode>
  files:    <N>
  syntax:   <OK | FAIL with paths>
  critic:   <OK | N issues | skipped>
  bughunt:  <DONE scope=... | WAIVED | skipped (--trivial)>
  exec:     <OK | proposed | skipped>
  cleared:  <yes | no>
```

## Notes

- Operator flagged this 2026-05-22: critic + real-test were being skipped, accumulating silent bugs (CP950 encoding bug in `backfill-missed-daily.ps1` is the canonical example).
- Memory rules are soft. Hook + slash command + commit gate is the harness-enforced rule.
- SSOT: `mcp/claude-userlevel/hooks/lib/shared.js` + `hooks/rules/{code-change-tracker,verify-gate-stop,verify-gate-commit}.js` + `.claude/commands/verify-recent.md` + `scripts/verify-recent-ack.ps1`.
- Audit trail for failures: `~/.claude/verify-gate-failures.log` (one line per hook exception).
- BUGHUNT spec lives in AGENTS.md R0 §抓蟲; required root list lives in `scripts/verify-closeout-completeness.ps1` `$bhRequiredRoots`. verify-recent only executes and records — no duplicate definitions here.
