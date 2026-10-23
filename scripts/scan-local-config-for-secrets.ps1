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
    - mcp/claude-userlevel/hooks/rules/commit-quality.js  (commit-time, scans .js/.ts/.py)
    - mcp/claude-userlevel/hooks/rules/audit-log.js       (post-tool, redacts logs)
  This scanner targets gitignored config files those hooks never see.

.PARAMETER Strict
  Treat WARN as FAIL. Use in CI / pre-deploy gates if you want zero plaintext anywhere.

.PARAMETER Path
  Override default scan paths. Comma-separated. Defaults to the canonical local config set.

.PARAMETER Quiet
  Suppress non-essential output. Always prints findings + final verdict.

.PARAMETER KnownSuppressedBaseline
  Optional JSON baseline of already-governed gitignored findings. The baseline
  must not contain secret values. Matching WARN findings are hidden; new
  baseline-miss findings fail with exit 2.

.NOTES
  Schema version: 2
  Last reviewed: 2026-06-12
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
    [string]$KnownSuppressedBaseline = "",
    [string]$WorkRoot = ""
)

# CP950 protection for native stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
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
# KNOWN GAP, tracked in TASKS.md ("claude_desktop_config.json 至今無人治理"):
# %APPDATA%\Claude\claude_desktop_config.json is NOT scanned, and as of 2026-08-28 it holds six
# plaintext API keys. It is absent for two reasons, neither of them "we think it is safe":
#   1. Join-Path $WorkRoot $rel below cannot express an absolute path outside the repo.
#   2. In baseline mode (how verify-build-gates calls this) any unsuppressed WARN exits 2, so
#      adding it today would hard-block AO-RESUME / AO-CLOSE until those keys are rotated.
# Wiring it in belongs with that rotation, not before it.
$defaultPaths = @(
    ".claude/settings.json",
    ".claude/settings.local.json",
    ".mcp.json",
    "mcp/user-env.ps1"
)

$targetPaths = if ($Path) { $Path } else { $defaultPaths }

# ============================================================================
# Known-suppressed baseline. Match key: file + pattern + sourceKey.
# SourceKey is a non-secret label, usually an env var name. The baseline is
# intentionally value-free, so it can be committed safely.
# ============================================================================
$baselineMode = -not [string]::IsNullOrWhiteSpace($KnownSuppressedBaseline)
$baselineSuppressions = @()

function Normalize-RelPath {
    param([string]$RelPath)
    return (($RelPath -replace '\\', '/') -replace '^\./', '').ToLowerInvariant()
}

if ($baselineMode) {
    $baselinePath = if ([System.IO.Path]::IsPathRooted($KnownSuppressedBaseline)) {
        $KnownSuppressedBaseline
    } else {
        Join-Path $WorkRoot $KnownSuppressedBaseline
    }
    if (-not (Test-Path -LiteralPath $baselinePath)) {
        Write-Host "scan-local-config-for-secrets: FAIL -- known-suppressed baseline not found: $baselinePath" -ForegroundColor Red
        exit 2
    }
    try {
        $baselineRaw = Get-Content -LiteralPath $baselinePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $baselineSuppressions = @($baselineRaw.suppressions | Where-Object { -not ($_.PSObject.Properties.Name -contains 'enabled') -or $_.enabled -ne $false })
    } catch {
        Write-Host "scan-local-config-for-secrets: FAIL -- cannot parse known-suppressed baseline: $($_.Exception.Message)" -ForegroundColor Red
        exit 2
    }
}

# ============================================================================
# Helpers
# ============================================================================
function Test-PathTrackedByGit {
    param([string]$RelPath)
    Push-Location $WorkRoot
    try {
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        Invoke-WithUtf8Console { & git ls-files --error-unmatch $RelPath *> $null }
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

function Get-SourceKey {
    param(
        [string]$Line,
        [int]$LineNumber
    )

    $sourceKeyPatterns = @(
        '(?i)\$env:([A-Z][A-Z0-9_]{2,})',
        '(?i)\b([A-Z][A-Z0-9_]{2,})\s*=',
        '(?i)"([A-Z][A-Z0-9_]{2,})"\s*:'
    )
    foreach ($rx in $sourceKeyPatterns) {
        $m = [regex]::Match($Line, $rx)
        if ($m.Success) {
            return $m.Groups[1].Value.ToUpperInvariant()
        }
    }

    return "line:$LineNumber"
}

function Test-KnownSuppressed {
    param(
        [string]$File,
        [string]$Pattern,
        [string]$SourceKey
    )
    if (-not $baselineMode) { return $false }

    $fileNorm = Normalize-RelPath -RelPath $File
    foreach ($s in $baselineSuppressions) {
        $sFile = Normalize-RelPath -RelPath ([string]$s.file)
        $sPattern = [string]$s.pattern
        $sSourceKey = ([string]$s.sourceKey).ToUpperInvariant()
        if (
            $sFile -eq $fileNorm -and
            $sPattern -eq $Pattern -and
            $sSourceKey -eq $SourceKey.ToUpperInvariant()
        ) {
            return $true
        }
    }

    return $false
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

    $lines = @(Get-Content -LiteralPath $abs -Encoding UTF8)
    for ($i = 0; $i -lt $lines.Count; $i++) {
        foreach ($p in $patterns) {
            $m = [regex]::Match($lines[$i], $p.Regex)
            if ($m.Success) {
                $sourceKey = Get-SourceKey -Line $lines[$i] -LineNumber ($i + 1)
                $suppressed = (-not $tracked) -and (Test-KnownSuppressed -File $rel -Pattern $p.Name -SourceKey $sourceKey)
                $findings += [pscustomobject]@{
                    File       = $rel
                    Line       = $i + 1
                    Pattern    = $p.Name
                    SourceKey  = $sourceKey
                    Tracked    = $tracked
                    Severity   = $severity
                    Suppressed = $suppressed
                    Redacted   = Get-Redacted -Match $m.Value
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
    if ($baselineMode) {
        Write-Host "  Known-suppressed baseline: $KnownSuppressedBaseline ($($baselineSuppressions.Count) rule(s))"
    }
}

$suppressedFindings = @($findings | Where-Object { $_.Suppressed })
$visibleFindings = @($findings | Where-Object { -not $_.Suppressed })

if ($visibleFindings.Count -eq 0) {
    if ($suppressedFindings.Count -gt 0) {
        Write-Host "scan-local-config-for-secrets: PASS ($($suppressedFindings.Count) known-suppressed local finding(s) hidden)" -ForegroundColor Green
    } else {
        Write-Host "scan-local-config-for-secrets: PASS (no plaintext secrets in local config)" -ForegroundColor Green
    }
    exit 0
}

Write-Host ""
Write-Host "Findings ($($visibleFindings.Count) visible$(if ($suppressedFindings.Count -gt 0) { ", $($suppressedFindings.Count) suppressed" })):" -ForegroundColor Yellow
foreach ($f in $visibleFindings) {
    $color = if ($f.Severity -eq "FAIL") { "Red" } else { "Yellow" }
    Write-Host ("  [{0}] {1}:{2}  {3}  source={4}  match={5}  tracked={6}" -f $f.Severity, $f.File, $f.Line, $f.Pattern, $f.SourceKey, $f.Redacted, $f.Tracked) -ForegroundColor $color
}

$hasFail = (@($visibleFindings | Where-Object { $_.Severity -eq "FAIL" })).Count -gt 0
$hasWarn = (@($visibleFindings | Where-Object { $_.Severity -eq "WARN" })).Count -gt 0

Write-Host ""
if ($hasFail) {
    Write-Host "scan-local-config-for-secrets: FAIL — secret(s) in git-tracked file(s). Sanitize before committing." -ForegroundColor Red
    Write-Host "Recipe: see agency-os/docs/operations/mcp-secrets-hardening-runbook.md §Local Plaintext Scanner"
    exit 2
}

if ($hasWarn) {
    if ($baselineMode) {
        Write-Host "scan-local-config-for-secrets: FAIL (baseline mode) -- new unsuppressed local secret finding(s)." -ForegroundColor Red
        Write-Host "  Add only already-governed findings to the known-suppressed baseline; never add secret values."
        Write-Host "Recipe: see agency-os/docs/operations/mcp-secrets-hardening-runbook.md §Local Plaintext Scanner"
        exit 2
    }
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
