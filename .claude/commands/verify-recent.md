Verify all code files modified this session (syntax + critic + real exec test).

Companion to the harness-enforced rule (`mcp/claude-userlevel/hooks/code-change-tracker.js` +
`verify-gate-stop.js` + `verify-gate-commit.js`). git commit is HARD-blocked until tracker is cleared.

## Arguments

- (no arg) → **full verify**: syntax → critic → real exec test → clear tracker on success
- `--trivial` → **syntax-only**: for typo / comment-only / rename edits. Skips critic + exec test, clears tracker.
- `--ack "reason"` → **operator override**: log to daily memory + clear tracker. Use sparingly.
- Unknown flag → **error and exit**; do NOT default to full verify.

## Step 0 — Read tracker (SID derivation MUST match `_verify-shared.js`)

```powershell
function Get-VerifySid {
    $explicit = $env:CLAUDE_SESSION_ID
    if ($explicit -and $explicit.Trim()) {
        $clean = $explicit.Trim() -replace '[^a-zA-Z0-9_-]', '_'
        return $clean.Substring(0, [Math]::Min(64, $clean.Length))
    }
    $cwd = (Get-Location).Path
    $ppid = 0
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction SilentlyContinue
        if ($proc) { $ppid = [int]$proc.ParentProcessId }
    } catch {}
    $sha1 = [System.Security.Cryptography.SHA1]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("$cwd|$ppid")
    $hash = ($sha1.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
    return $hash.Substring(0, 16)
}
$sid = Get-VerifySid
$tf = "$env:TEMP\claude-unverified-code-$sid.txt"
if (-not (Test-Path -LiteralPath $tf)) {
    Write-Host "verify-recent: tracker is empty — nothing to verify."
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
- `.js`/`.jsx`: `node --check <path>`
- `.sh`: `bash -n <path>` (or `shellcheck` if available)
- `.py`: `python -m py_compile <path>`

Fail-fast: if any syntax error → report and STOP (do not clear tracker).

## Step 2 — Critic (skip if --trivial)

Spawn the `critic` subagent with all tracked files as the scope. Brief:

> "Deep review on these N files modified in this session: [files]. Run your full checklist. Focus on edge cases, encoding issues (CP950 / locale), race conditions, real-execution traps (atomicity / partial writes / FS case-sensitivity). Do NOT flag: theoretical risks with no concrete attack path, code not touched by this change, library replacement suggestions, style consistent with surrounding code."

If critic reports 🔴 Critical or 🟠 Major → STOP, present findings, do NOT clear tracker (operator must fix and re-run).

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

## `--ack "reason"` variant (atomic helper)

Do NOT inline the clear-and-log here — call the atomic helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-recent-ack.ps1 -Reason "<operator-supplied reason>"
```

The helper guarantees: WORKLOG/daily-memory append succeeds BEFORE tracker delete. If append fails, tracker stays, gate stays blocked.

If operator says `/verify-recent --ack` without a reason → ask: "What's the reason? (e.g. 'comment-only edit', 'rename only', 'time-critical hotfix')". Do not proceed without one.

## `--trivial` variant

Only do Step 1 (syntax). Skip Step 2 + 3. Clear tracker.

## Unknown flag

If args contain any token not in `{--trivial, --ack}` → error: "verify-recent: unknown flag '<flag>'. Valid: (none) | --trivial | --ack 'reason'". Exit without modifying tracker.

## Output format

```
verify-recent: <mode>
  files:    <N>
  syntax:   <OK | FAIL with paths>
  critic:   <OK | N issues | skipped>
  exec:     <OK | proposed | skipped>
  cleared:  <yes | no>
```

## Notes

- Operator flagged this 2026-05-22: critic + real-test were being skipped, accumulating silent bugs (CP950 encoding bug in `backfill-missed-daily.ps1` is the canonical example).
- Memory rules are soft. Hook + slash command + commit gate is the harness-enforced rule.
- SSOT: `mcp/claude-userlevel/hooks/{_verify-shared,code-change-tracker,verify-gate-stop,verify-gate-commit}.js` + `.claude/commands/verify-recent.md` + `scripts/verify-recent-ack.ps1`.
- Audit trail for failures: `~/.claude/verify-gate-failures.log` (one line per hook exception).
