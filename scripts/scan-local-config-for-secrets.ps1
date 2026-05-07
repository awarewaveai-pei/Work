<#
.SYNOPSIS
  Scans local Claude/Cursor/MCP config files for plaintext secrets.

.DESCRIPTION
  Detects accidentally-accumulated plaintext credentials in local config files
  (Claude settings, Cursor MCP config, root .mcp.json, mcp/user-env.ps1).

  Two-tier severity:
    - FAIL (exit 2): secret found in a git-TRACKED file (would commit secret)
    - WARN (exit 1): secret found in a git-IGNORED local config file
    - PASS (exit 0): all scanned files clean

  This is COMPLEMENTARY to:
    - mcp/claude-userlevel/hooks/commit-quality.js  (commit-time, scans .js/.ts/.py)
    - mcp/claude-userlevel/hooks/audit-log.js       (post-tool, redacts logs)
  This scanner targets gitignored config files those hooks never see.

.PARAMETER Strict
  Treat WARN as FAIL. Use in CI / pre-deploy gates if you want zero plaintext anywhere.

.PARAMETER Path
  Override default scan paths. Comma-separated. Defaults to the canonical local config set.

.PARAMETER Quiet
  Suppress non-essential output. Always prints findings + final verdict.

.NOTES
  Schema version: 1
  Last reviewed: 2026-05-07
  Owner: agency-os
  Related: agency-os/docs/operations/mcp-secrets-hardening-runbook.md §Local Plaintext Scanner

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\scan-local-config-for-secrets.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\scan-local-config-for-secrets.ps1 -Strict
#>
param(
    [switch]$Strict,
    [string[]]$Path,
    [switch]$Quiet,
    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
}

# ============================================================================
# PATTERN REGISTRY — extend here. Each entry: name + regex.
# When adding a pattern: keep regex anchored to recognizable provider prefixes
# to minimize false positives. Comment with provider + scope.
# ============================================================================
$patterns = @(
    @{ Name = "JWT (Supabase / generic)";     Regex = 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' },
    @{ Name = "GitHub PAT (classic)";          Regex = 'ghp_[A-Za-z0-9]{30,}' },
    @{ Name = "GitHub fine-grained PAT";       Regex = 'github_pat_[A-Za-z0-9_]{40,}' },
    @{ Name = "GitHub OAuth token";            Regex = 'gho_[A-Za-z0-9]{30,}' },
    @{ Name = "Anthropic API key";             Regex = 'sk-ant-[A-Za-z0-9_-]{30,}' },
    @{ Name = "OpenAI API key";                Regex = 'sk-[A-Za-z0-9]{40,}' },
    @{ Name = "Google API key";                Regex = 'AIza[A-Za-z0-9_-]{35}' },
    @{ Name = "AWS access key";                Regex = 'AKIA[0-9A-Z]{16}' },
    @{ Name = "Trigger.dev token";             Regex = 'tr_(prod|dev)_[a-f0-9]{30,}' },
    @{ Name = "Uptime Kuma API key";           Regex = 'uk1_[A-Za-z0-9_-]{20,}' },
    @{ Name = "Postgres DSN with password";    Regex = 'postgresql://[^:\s]+:[^@\s]+@' },
    @{ Name = "Google app password (4x4x4)";   Regex = '[a-z]{4,}:[A-Za-z]{4} [A-Za-z0-9]{4} [A-Za-z0-9]{4} [A-Za-z0-9]{4} [A-Za-z0-9]{4} [A-Za-z0-9]{4}' }
)

# ============================================================================
# DEFAULT SCAN PATHS — extend by editing this list, or override via -Path.
# All paths are relative to $WorkRoot.
# ============================================================================
$defaultPaths = @(
    ".claude/settings.json",
    ".claude/settings.local.json",
    ".cursor/mcp.json",
    ".mcp.json",
    "mcp/user-env.ps1"
)

$targetPaths = if ($Path) { $Path } else { $defaultPaths }

# ============================================================================
# Helpers
# ============================================================================
function Test-PathTrackedByGit {
    param([string]$RelPath)
    Push-Location $WorkRoot
    try {
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & git ls-files --error-unmatch $RelPath *> $null
        $tracked = ($LASTEXITCODE -eq 0)
        $ErrorActionPreference = $prevEAP
        return $tracked
    } finally {
        Pop-Location
    }
}

function Get-Redacted {
    param([string]$Match)
    if ($Match.Length -le 8) { return "***" }
    return $Match.Substring(0, 4) + "***" + $Match.Substring($Match.Length - 4, 4)
}

# ============================================================================
# Scan
# ============================================================================
$findings = @()
$scannedCount = 0

foreach ($rel in $targetPaths) {
    $abs = Join-Path $WorkRoot $rel
    if (-not (Test-Path -LiteralPath $abs)) {
        if (-not $Quiet) { Write-Host "  - $rel (not present, skipped)" -ForegroundColor DarkGray }
        continue
    }
    $scannedCount++
    $tracked = Test-PathTrackedByGit -RelPath $rel
    $severity = if ($tracked) { "FAIL" } else { "WARN" }

    $lines = Get-Content -LiteralPath $abs -Encoding UTF8
    for ($i = 0; $i -lt $lines.Count; $i++) {
        foreach ($p in $patterns) {
            $m = [regex]::Match($lines[$i], $p.Regex)
            if ($m.Success) {
                $findings += [pscustomobject]@{
                    File     = $rel
                    Line     = $i + 1
                    Pattern  = $p.Name
                    Tracked  = $tracked
                    Severity = $severity
                    Redacted = Get-Redacted -Match $m.Value
                }
                break
            }
        }
    }
}

# ============================================================================
# Report
# ============================================================================
if (-not $Quiet) {
    Write-Host ""
    Write-Host "== scan-local-config-for-secrets ==" -ForegroundColor Cyan
    Write-Host "  WorkRoot: $WorkRoot"
    Write-Host "  Files scanned: $scannedCount"
    Write-Host "  Patterns: $($patterns.Count)"
}

if ($findings.Count -eq 0) {
    Write-Host "scan-local-config-for-secrets: PASS (no plaintext secrets in local config)" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "Findings ($($findings.Count)):" -ForegroundColor Yellow
foreach ($f in $findings) {
    $color = if ($f.Severity -eq "FAIL") { "Red" } else { "Yellow" }
    Write-Host ("  [{0}] {1}:{2}  {3}  match={4}  tracked={5}" -f $f.Severity, $f.File, $f.Line, $f.Pattern, $f.Redacted, $f.Tracked) -ForegroundColor $color
}

$hasFail = (@($findings | Where-Object { $_.Severity -eq "FAIL" })).Count -gt 0
$hasWarn = (@($findings | Where-Object { $_.Severity -eq "WARN" })).Count -gt 0

Write-Host ""
if ($hasFail) {
    Write-Host "scan-local-config-for-secrets: FAIL — secret(s) in git-tracked file(s). Sanitize before committing." -ForegroundColor Red
    Write-Host "Recipe: see agency-os/docs/operations/mcp-secrets-hardening-runbook.md §Local Plaintext Scanner"
    exit 2
}

if ($hasWarn) {
    if ($Strict) {
        Write-Host "scan-local-config-for-secrets: FAIL (strict mode) — secret(s) in gitignored local config files." -ForegroundColor Red
        Write-Host "Recipe: see agency-os/docs/operations/mcp-secrets-hardening-runbook.md §Local Plaintext Scanner"
        exit 2
    }
    Write-Host "scan-local-config-for-secrets: WARN — secret(s) in gitignored local config files." -ForegroundColor Yellow
    Write-Host "  These are not in git, but reduce local exposure by sanitizing."
    Write-Host "  Recipe: see agency-os/docs/operations/mcp-secrets-hardening-runbook.md §Local Plaintext Scanner"
    exit 1
}

exit 0
