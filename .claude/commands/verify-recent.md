Verify all code files modified this session (syntax + critic + real exec test).

Companion to the harness-enforced rule (`mcp/claude-userlevel/hooks/code-change-tracker.js` +
`verify-gate-stop.js` + `verify-gate-commit.js`). git commit is blocked until tracker is cleared.

## Arguments

- (no arg) → **full verify**: syntax → critic → real exec test → clear tracker on success
- `--trivial` → **syntax-only**: for typo / comment-only / rename edits. Skips critic + exec test, clears tracker.
- `--skip` → **operator override**: clear tracker without verification. Use sparingly; logs to WORKLOG.

## Procedure

### Step 0 — Read tracker

```powershell
$sid = if ($env:CLAUDE_SESSION_ID) { $env:CLAUDE_SESSION_ID } else { "default" }
$tf = "$env:TEMP\claude-unverified-code-$sid.txt"
if (-not (Test-Path $tf)) { Write-Host "verify-recent: tracker is empty — nothing to verify."; exit 0 }
$files = @(Get-Content $tf | ForEach-Object { $_.Trim() } | Where-Object { $_ }) | Sort-Object -Unique
```

Report: list of files to verify.

### Step 1 — Syntax check (always)

Per extension:
- `.ps1` → `powershell -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile('<path>', [ref]$null, [ref]$null) | Out-Null; exit $LASTEXITCODE"`
- `.ts`/`.tsx` → `npx tsc --noEmit --skipLibCheck <path>` (or project-level if inside next-admin)
- `.js`/`.jsx` → `node --check <path>`
- `.sh` → `bash -n <path>`
- `.py` → `python -m py_compile <path>`

Fail-fast: if any syntax error → report and STOP (do not clear tracker).

### Step 2 — Critic (skip if --trivial)

Spawn the `critic` subagent with all tracked files as the scope. Brief:

> "Deep review on these N files modified in this session: [files]. Run your full checklist. Focus on edge cases, encoding issues, race conditions, real-execution traps (CP950 / locale / atomicity / partial writes). Do NOT flag: theoretical risks with no concrete attack path, code not touched by this change, library replacement suggestions, style consistent with surrounding code."

If critic reports 🔴 Critical or 🟠 Major → STOP, present findings, do NOT clear tracker (operator must fix and re-run).

### Step 3 — Real exec test (skip if --trivial)

For each file, **propose** (do not auto-run) a real-execution test:
- `.ps1` running directly with crafted args → observe stdout/stderr
- `.ts`/`.tsx` → run smallest containing function via vitest or a one-shot script
- `.sh` → run with `bash -x` for trace
- `.py` → `python -c "from <mod> import <fn>; print(<fn>(...))"`

Report the proposed tests as a checklist. Run any that are safe + cheap (read-only / no side effects).
For tests that have side effects (writes / network / DB), present the command and ask operator.

### Step 4 — Clear tracker on success

```powershell
Remove-Item -LiteralPath $tf -Force
Write-Host "verify-recent: tracker cleared. git commit is unblocked."
```

### `--skip` variant

When `--skip` arg present:
1. Read tracker file list
2. Append to `agency-os/WORKLOG.md` today's section: `### verify-recent --skip` with file list + one-line reason
3. Delete tracker file
4. Report: "Tracker cleared without verification. Risk acknowledged in WORKLOG."

### `--trivial` variant

Only do Step 1 (syntax). Skip Step 2 + 3. Clear tracker.

## Output format

```
verify-recent: <mode>
  files:  <N>
  syntax: <OK|FAIL with paths>
  critic: <OK|N issues|skipped>
  exec:   <OK|proposed|skipped>
  cleared: <yes|no>
```

## Notes

- This skill exists because the operator flagged 2026-05-22 that critic + real-test were being skipped, accumulating silent bugs (e.g. PowerShell CP950 decoding bug in `backfill-missed-daily.ps1`).
- Memory-based rules are soft. This hook + slash command + commit gate is the harness-enforced rule.
- See `mcp/claude-userlevel/hooks/{code-change-tracker,verify-gate-stop,verify-gate-commit}.js`.
