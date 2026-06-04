---
name: feedback-test-artifact-isolation
description: Test scripts must live under $env:TEMP, NEVER inside the repo — auto-checkpoint hook will silently commit them. Also: bash heredoc mangles PowerShell $variable expansion; isolate PS tests in their own .ps1 file.
metadata:
  type: feedback
---

**Rule 1 — Test artifact location**: Any temporary test file (.ps1, .json, .md) created to verify code must go under `$env:TEMP`, NEVER inside the repo root.

**Why:** 2026-05-22 — I wrote `.tmp-l2-tail-capture-test.ps1` at repo root. The UserPromptSubmit hook (`mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1`) auto-checkpointed the dirty tree, committing my test files (commit `5fd54fa`). A subsequent auto-checkpoint cleaned them (`ce04c8a`), but the audit trail was polluted with [cursor] checkpoint of test junk that mixed with another IDE's legitimate work (`code-change-tracker.js`, etc.). Avoid by writing tests to `$env:TEMP\<name>-$(Get-Random).ps1` instead.

**How to apply:**
- `Write` tool: never target paths inside `d:/Work/` for one-off test scripts
- PowerShell tests: `$tmp = Join-Path $env:TEMP "test-$(Get-Random).ps1"; Set-Content $tmp $code; & powershell -File $tmp`
- Sandbox env vars set in outer shell do NOT propagate to `& powershell.exe -File ...` inner shells; pass them as arguments or read inside the script.

**Rule 2 — bash heredoc + PowerShell do not mix**: Multi-line PowerShell sent through bash heredoc with embedded `$varName` expressions gets mangled — bash evaluates `$rebootDj.slack` as a command before reaching PS, producing silent test failures (false 0-hit results).

**Why:** 2026-05-22 — first L2 detection test reported `Hits found: 0` falsely; root cause was bash heredoc mangling. Lost ~15 min troubleshooting "phantom bug" before realising the test harness itself was corrupted. Then, ironically, while writing THIS very memory, the bash heredoc mangled `$tmp` and `$(Get-Random)` again.

**How to apply:**
- For any PS code with `$rebootDj.slack` / `$obj.PSObject` / nested property access: write to `$env:TEMP	est.ps1` first, then `powershell -File` it
- bash heredoc is fine for simple PS one-liners with single-level `$var` interpolation only
- For writing files containing literal `$` characters: use Python (`python3 << 'PYEOF'` with single quotes) or the Write tool, not bash heredoc
- When test output looks "too clean" or "too zero", suspect the harness before suspecting the code under test

Related: [[feedback-test-review-default]] (the WHY/WHEN); [[feedback-verify-four-actions]] (the WHAT — 4 actions). This memory is the HOW (operational tooling).
