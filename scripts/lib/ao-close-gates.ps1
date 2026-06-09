<#
.SYNOPSIS
  Single quality-gate collector for AO-CLOSE Phase 3 (four-phase refactor, 2026-06-09).

.DESCRIPTION
  ASCII-only header for Windows PowerShell 5.1 safety. CJK only in comments below if needed.

  Behavior contract (the invariant the regression matrix protects):
    AO-CLOSE publishes (commit + push + cross-machine export) IFF the quality gate
    has zero recorded blockers. Preconditions (git topology, infra-script failures)
    remain fail-fast in ao-close.ps1 and are NOT routed through this collector.

  Why this exists:
    Before this, AO-CLOSE evaluated ~7 quality gates with scattered `exit 1` calls
    interleaved through 480 lines. A failing gate aborted immediately, so the operator
    discovered blockers ONE AT A TIME across multiple full re-runs (root cause of the
    recurring "AO-CLOSE took 30+ min" friction). This collector lets every quality gate
    record pass/fail and continue; a single decision point before publish reports ALL
    blockers at once. Same gates, same pass/fail logic, same final commit decision --
    only the reporting changes from serial to batched.

  Modeled on system-health-check.ps1's proven Add-Check / criticalFailures pattern;
  not a new paradigm.
#>

Set-StrictMode -Version Latest

function New-CloseoutGate {
    <# Returns a fresh collector. One per AO-CLOSE run. #>
    return [pscustomobject]@{
        Blockers = New-Object System.Collections.Generic.List[object]
        Passes   = New-Object System.Collections.Generic.List[string]
    }
}

function Add-CloseoutGateResult {
    <#
    Record one quality-gate outcome.
      -Failed $true  -> recorded as a blocker (will prevent publish).
      -Failed $false -> recorded as a pass (informational).
    Detail = what was observed; Fix = the one-line remediation hint shown to the operator.
    #>
    param(
        [Parameter(Mandatory = $true)] $Gate,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Failed,
        [string]$Detail = "",
        [string]$Fix = ""
    )
    if ($Failed) {
        $Gate.Blockers.Add([pscustomobject]@{ Name = $Name; Detail = $Detail; Fix = $Fix })
    } else {
        $Gate.Passes.Add($Name)
    }
}

function Test-CloseoutShouldBlock {
    <# $true if any blocker recorded -> caller must NOT publish. #>
    param([Parameter(Mandatory = $true)] $Gate)
    return ($Gate.Blockers.Count -gt 0)
}

function Get-CloseoutGateReport {
    <# Human-readable consolidated blocker list (empty string if none). #>
    param([Parameter(Mandatory = $true)] $Gate)
    if ($Gate.Blockers.Count -eq 0) { return "" }
    $lines = @()
    $lines += ("AO-CLOSE blocked by {0} quality-gate failure(s) -- fix all, then re-run once:" -f $Gate.Blockers.Count)
    $i = 0
    foreach ($b in $Gate.Blockers) {
        $i++
        $lines += ("  [{0}] {1}" -f $i, $b.Name)
        if ($b.Detail) { $lines += ("       what: {0}" -f $b.Detail) }
        if ($b.Fix)    { $lines += ("       fix:  {0}" -f $b.Fix) }
    }
    return ($lines -join [Environment]::NewLine)
}
