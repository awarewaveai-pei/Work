<#
.SYNOPSIS
  Start Claude Code on the Wda Gov profile (~/.claude-wda) in this PowerShell window; any arguments pass through.

.DESCRIPTION
  The operator's PowerShell profile defines `claude-wda` as a call to this script (scripts/claude-account.py is the
  SSOT for the profile itself: login, trust, verify-hooks). Environment variables are process-wide, so the parent's
  CLAUDE*/ANTHROPIC* markers are removed only for the run and everything is restored afterwards: a plain `claude`
  typed later in the same window must still use the operator's own account.

.EXAMPLE
  claude-wda
  claude-wda --resume <session id>
#>
$saved = @(Get-ChildItem Env: | Where-Object Name -match '^(CLAUDE|ANTHROPIC)' | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Value = $_.Value } })
try {
    $saved | ForEach-Object { Remove-Item -LiteralPath ("Env:" + $_.Name) }
    $env:CLAUDE_CONFIG_DIR = Join-Path $env:USERPROFILE '.claude-wda'
    & (Join-Path $env:USERPROFILE '.local\bin\claude.exe') @args
} finally {
    Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue
    $saved | ForEach-Object { Set-Item -LiteralPath ("Env:" + $_.Name) -Value $_.Value }
}
