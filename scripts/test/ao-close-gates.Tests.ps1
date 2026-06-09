<#
.SYNOPSIS
  Regression / characterization tests for the AO-CLOSE quality-gate collector
  (scripts/lib/ao-close-gates.ps1). Part of the four-phase refactor (2026-06-09).

.DESCRIPTION
  Pester-free (PS5.1-safe). Run: powershell -NoProfile -ExecutionPolicy Bypass -File this.ps1
  Exit 0 = all pass; exit 1 = any failure (with diff printed).

  Protects the behavior contract:
    publish IFF Test-CloseoutShouldBlock == $false  (i.e. zero blockers).
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$libPath = Join-Path $PSScriptRoot "..\lib\ao-close-gates.ps1"
. (Resolve-Path -LiteralPath $libPath).Path

$script:fail = 0
$script:pass = 0
function Assert([bool]$cond, [string]$name) {
    if ($cond) { $script:pass++; Write-Host ("  PASS  {0}" -f $name) -ForegroundColor Green }
    else       { $script:fail++; Write-Host ("  FAIL  {0}" -f $name) -ForegroundColor Red }
}

Write-Host "== ao-close-gates collector contract ==" -ForegroundColor Cyan

# 1. Fresh gate: no blockers -> must NOT block (publish allowed).
$g = New-CloseoutGate
Assert ((Test-CloseoutShouldBlock $g) -eq $false) "fresh gate does not block"
Assert ((Get-CloseoutGateReport $g) -eq "")        "fresh gate report is empty"

# 2. All-pass: recording only passes -> must NOT block.
$g = New-CloseoutGate
Add-CloseoutGateResult -Gate $g -Name "verify-build-gates" -Failed $false
Add-CloseoutGateResult -Gate $g -Name "health-100"        -Failed $false
Add-CloseoutGateResult -Gate $g -Name "completeness"      -Failed $false
Assert ((Test-CloseoutShouldBlock $g) -eq $false) "all-pass does not block"
Assert ($g.Passes.Count -eq 3)                    "all-pass records 3 passes"
Assert ($g.Blockers.Count -eq 0)                  "all-pass records 0 blockers"

# 3. Single failure -> must block, report names it.
$g = New-CloseoutGate
Add-CloseoutGateResult -Gate $g -Name "completeness" -Failed $true -Detail "missing AUTO_TASK_DONE" -Fix "add the line"
Assert ((Test-CloseoutShouldBlock $g) -eq $true)  "single failure blocks"
$rep = Get-CloseoutGateReport $g
Assert ($rep -match "completeness")               "report names the failed gate"
Assert ($rep -match "missing AUTO_TASK_DONE")     "report shows detail"
Assert ($rep -match "add the line")               "report shows fix"
Assert ($rep -match "1 quality-gate failure")     "report counts 1"

# 4. THE KEY CASE this refactor exists for: multiple failures surface together in ONE report.
$g = New-CloseoutGate
Add-CloseoutGateResult -Gate $g -Name "completeness" -Failed $true -Detail "missing AUTO_TASK_DONE"
Add-CloseoutGateResult -Gate $g -Name "bughunt"      -Failed $true -Detail "false hits=0"
Add-CloseoutGateResult -Gate $g -Name ".claude-guard" -Failed $true -Detail "staged .claude/ path"
Assert ((Test-CloseoutShouldBlock $g) -eq $true)  "multi-failure blocks"
Assert ($g.Blockers.Count -eq 3)                  "multi-failure records all 3 (no fail-fast)"
$rep = Get-CloseoutGateReport $g
Assert ($rep -match "completeness")               "multi report includes completeness"
Assert ($rep -match "bughunt")                    "multi report includes bughunt"
Assert ($rep -match "\.claude-guard")             "multi report includes .claude-guard"
Assert ($rep -match "3 quality-gate failure")     "multi report counts 3"

# 5. Mixed pass+fail -> blocks; only failures in report.
$g = New-CloseoutGate
Add-CloseoutGateResult -Gate $g -Name "verify-build-gates" -Failed $false
Add-CloseoutGateResult -Gate $g -Name "health-100"         -Failed $true -Detail "score 99.7%"
Assert ((Test-CloseoutShouldBlock $g) -eq $true)  "mixed blocks when any fails"
$rep = Get-CloseoutGateReport $g
Assert ($rep -match "health-100")                 "mixed report includes the failure"
Assert (-not ($rep -match "verify-build-gates"))  "mixed report excludes passes"

Write-Host ""
$summaryColor = if ($script:fail -eq 0) { 'Green' } else { 'Red' }
Write-Host ("RESULT: {0} passed, {1} failed" -f $script:pass, $script:fail) -ForegroundColor $summaryColor
if ($script:fail -gt 0) { exit 1 }
exit 0
