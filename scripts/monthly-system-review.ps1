# Monthly pipeline: verify-build-gates (monorepo) -> integrated status report -> optional WORKLOG appendix.
# Run from monorepo scheduled task. ASCII-friendly; Windows PowerShell 5.1.

param(
    [string]$AgencyOsRoot = "",
    [switch]$SkipWorklog,
    [switch]$ReportOnly,
    [switch]$NoAlert
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'lib\repo-text.ps1')

. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')

$agencyRoot = Resolve-AgencyRoot -InputRoot $AgencyOsRoot
$workRoot = Get-MonorepoRoot
$verifyScript = Join-Path $PSScriptRoot "verify-build-gates.ps1"
$genScript = Join-Path $PSScriptRoot "generate-integrated-status-report.ps1"
$memScript = Join-Path $PSScriptRoot "check-supabase-memory-monthly.ps1"
$worklogPath = Join-Path $agencyRoot "WORKLOG.md"
$alertFile = Join-Path $agencyRoot "ALERT_REQUIRED.txt"

$gatesRan = $false

if (-not $ReportOnly) {
    if (-not (Test-Path -LiteralPath $verifyScript)) {
        Write-Error "monthly-system-review: missing verify-build-gates at $verifyScript"
        exit 1
    }
    $gatesRan = $true
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verifyScript -WorkRoot $workRoot
    $gateExit = $LASTEXITCODE
    if ($gateExit -ne 0) {
        if (-not $NoAlert) {
            $iso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            $lines = @(
                "verify-build-gates failed at $iso (exit $gateExit)",
                "Remediation: from monorepo root run scripts/verify-build-gates.ps1 and fix reported issues.",
                "Then run agency-os scripts/system-health-check.ps1; see docs/operations/end-of-day-checklist.md",
                "Remove this file after fixing."
            )
            Set-Content -LiteralPath $alertFile -Value ($lines -join "`r`n") -Encoding UTF8
        }
        Write-Error "monthly-system-review: verify-build-gates failed (exit $gateExit)"
        exit $gateExit
    }
}

if (-not (Test-Path -LiteralPath $genScript)) {
    Write-Error "monthly-system-review: missing $genScript"
    exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $genScript -WorkspaceRoot $agencyRoot
if ($LASTEXITCODE -ne 0) {
    Write-Error "monthly-system-review: generate-integrated-status-report failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
}
$reportLabel = "OK"
$memStatus = "SKIPPED"
$memSummary = "memory check script missing"

if (Test-Path -LiteralPath $memScript) {
    $memOutput = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $memScript -AgencyOsRoot $agencyRoot 2>&1)
    $memExit = $LASTEXITCODE
    $memStatusLine = $memOutput | Where-Object { "$_" -like "RESULT_STATUS=*" } | Select-Object -First 1
    $memSummaryLine = $memOutput | Where-Object { "$_" -like "RESULT_SUMMARY=*" } | Select-Object -First 1

    if ($memStatusLine) {
        $memStatus = ("$memStatusLine" -replace "^RESULT_STATUS=", "").Trim()
    } elseif ($memExit -eq 0) {
        $memStatus = "PASS"
    } else {
        $memStatus = "ERROR"
    }

    if ($memSummaryLine) {
        $memSummary = ("$memSummaryLine" -replace "^RESULT_SUMMARY=", "").Trim()
    } elseif ($memOutput.Count -gt 0) {
        $memSummary = ("$memOutput" | Select-Object -Last 1).ToString().Trim()
    } else {
        $memSummary = "no output"
    }
}

if ($gatesRan -and (Test-Path -LiteralPath $alertFile)) {
    Remove-Item -LiteralPath $alertFile -Force
}

$gateSummary = if ($ReportOnly) { "gates=SKIPPED (ReportOnly)" } else { "gates=PASS (exit 0)" }

if (-not $SkipWorklog) {
    $dateHeading = "## " + (Get-Date).ToString("yyyy-MM-dd")
    $stampLocal = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $append = @(
        "",
        $dateHeading,
        "",
        "### Machine appendix (monthly-system-review)",
        "- $stampLocal : $gateSummary ; integrated-status: generate-integrated-status-report.ps1 $reportLabel ; supabase-memory: $memStatus ($memSummary)",
        ""
    ) -join "`n"
    $wlNow = if (Test-Path -LiteralPath $worklogPath) { [System.IO.File]::ReadAllText($worklogPath, [System.Text.Encoding]::UTF8) } else { "" }
    Write-RepoTextFile -Path $worklogPath -Content ($wlNow.TrimEnd("`r", "`n") + "`n" + $append)
}

Write-Output "monthly-system-review: done ($gateSummary, report $reportLabel)."
exit 0
