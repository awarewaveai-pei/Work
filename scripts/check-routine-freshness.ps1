<#
.SYNOPSIS
  Warn-only watchdog: are the 3 Anthropic cloud routines still landing their reports
  in awarewaveai-pei/Work? Writes agency-os/reports/status/routine-freshness-LATEST.md
  and exits non-zero if any routine output is stale or missing.

.DESCRIPTION
  Motivated by 2026-06-06: all 3 routines' cloud `sources` had drifted to a now-deleted
  public repo, so their reports silently stopped updating — and only AO-CLOSE §11 watched
  them (Phase 4 only). This script is the AO-RESUME leg: the operator is told at *startup*
  (when they can act), not only buried in the AO-CLOSE health report.

  SSOT note: the same 3 routines + thresholds are mirrored in system-health-check.ps1 §11
  (AO-CLOSE gate). Keep both in sync if a routine is added/removed. The EU server-side
  Telegram watchdog (always-on leg, for when the operator does NOT boot) checks the same
  report paths via git — see runbooks/ADD-PERIODIC-HEALTH-CHECK.md.

.NOTES
  Exit 0 = all fresh. Exit 1 = at least one stale/missing (warn-only; caller must not block).
#>
[CmdletBinding()]
param(
    [string] $WorkRoot
)

$ErrorActionPreference = "Stop"

# Resolve $WorkRoot robustly. ao-resume.ps1 always passes -WorkRoot; the fallback only
# matters for standalone runs. ($PSScriptRoot can be empty during param-default binding,
# which crashed the first cut — caught by real-exec test, not parse.)
if (-not $WorkRoot) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $scriptDir "..")).Path
}

# Routine output contract — SSOT mirrored in system-health-check.ps1 §11.
$routines = @(
    @{ Name = "Phase 4 weekly";  Path = "agency-os\reports\repair-center\phase4-LATEST.md";        MaxAgeDays = 8;  Routine = "AgencyOS-RepairCenterPhase4Weekly" }
    @{ Name = "Weekly review";   Path = "agency-os\reports\weekly\weekly-automation-LATEST.md";      MaxAgeDays = 9;  Routine = "AgencyOS-WeeklyReview" }
    @{ Name = "Monthly review";  Path = "agency-os\reports\monthly\monthly-review-LATEST.md";        MaxAgeDays = 35; Routine = "AgencyOS-MonthlyReview" }
)

$lines = @()
$lines += "# Claude routine output freshness"
$lines += ("- generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm") + " (local)")
$lines += ""
$anyStale = $false

foreach ($r in $routines) {
    $full = Join-Path $WorkRoot $r.Path
    if (Test-Path -LiteralPath $full) {
        $mtime = (Get-Item -LiteralPath $full).LastWriteTime
        # [Math]::Floor (not [int], which banker's-rounds and fires ~12h early).
        # Clamp to 0 so a future-dated mtime (git checkout / clock skew) never reads "-1d".
        $ageDays = [Math]::Max(0, [Math]::Floor(((Get-Date) - $mtime).TotalDays))
        if ($ageDays -gt $r.MaxAgeDays) {
            $anyStale = $true
            $lines += ("- WARN  {0}: {1}d old (max {2}d) -- routine {3} may have stopped firing or its source drifted; check https://claude.ai/code/routines" -f $r.Name, $ageDays, $r.MaxAgeDays, $r.Routine)
        } else {
            $lines += ("- OK    {0}: {1}d old (max {2}d)" -f $r.Name, $ageDays, $r.MaxAgeDays)
        }
    } else {
        $anyStale = $true
        $lines += ("- WARN  {0}: report MISSING -- routine {1} has never landed output in this repo; check https://claude.ai/code/routines" -f $r.Name, $r.Routine)
    }
}

$lines += ""
$lines += ("- overall: " + $(if ($anyStale) { "WARN (one or more routines stale/missing)" } else { "all fresh" }))

$statusDir = Join-Path $WorkRoot "agency-os\reports\status"
if (-not (Test-Path -LiteralPath $statusDir)) { New-Item -ItemType Directory -Force -Path $statusDir | Out-Null }
$outPath = Join-Path $statusDir "routine-freshness-LATEST.md"
Set-Content -LiteralPath $outPath -Value ($lines -join "`r`n") -Encoding UTF8

$lines | ForEach-Object { Write-Host $_ }

if ($anyStale) { exit 1 } else { exit 0 }
