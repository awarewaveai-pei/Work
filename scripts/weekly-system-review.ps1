# Weekly pipeline: verify-build-gates (monorepo) -> integrated status report -> optional WORKLOG appendix.
# Run from agency-os (scheduled task) or via D:\Work\scripts\weekly-system-review.ps1 wrapper.
# ASCII-friendly; Windows PowerShell 5.1.

param(
    [string]$AgencyOsRoot = "",
    [switch]$SkipWorklog,
    [switch]$ReportOnly,
    [switch]$NoAlert
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AgencyRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path $InputRoot)) { return (Resolve-Path $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

# Junction/symlink display path (e.g. D:\agency-os) yields parent D:\; use link target for monorepo root.
function Resolve-PhysicalDirectory {
    param([string]$Path)
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        $tgt = $item.Target
        if ($tgt) {
            $first = if ($tgt -is [string]) { $tgt } else { $tgt[0] }
            return (Resolve-Path -LiteralPath $first).Path
        }
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Resolve-MonorepoRoot {
    param([string]$AgencyPhysicalPath)
    $cursor = $AgencyPhysicalPath
    for ($i = 0; $i -lt 10; $i++) {
        $gate = Join-Path $cursor "scripts\verify-build-gates.ps1"
        # agency-os may ship a copy of verify-build-gates.ps1; require lobster bootstrap so root is the real monorepo.
        $boot = Join-Path $cursor "lobster-factory\scripts\bootstrap-validate.mjs"
        if ((Test-Path -LiteralPath $gate) -and (Test-Path -LiteralPath $boot)) { return $cursor }
        $parent = Split-Path -Parent $cursor
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
    return (Split-Path -Parent $AgencyPhysicalPath)
}

$agencyRoot = Resolve-AgencyRoot -InputRoot $AgencyOsRoot
$agencyPhysical = Resolve-PhysicalDirectory -Path $agencyRoot
$workRoot = Resolve-MonorepoRoot -AgencyPhysicalPath $agencyPhysical
$verifyScript = Join-Path $workRoot "scripts\verify-build-gates.ps1"
$genScript = Join-Path $agencyRoot "scripts\generate-integrated-status-report.ps1"
$worklogPath = Join-Path $agencyRoot "WORKLOG.md"
$alertFile = Join-Path $agencyRoot "ALERT_REQUIRED.txt"

$gatesRan = $false

if (-not $ReportOnly) {
    if (-not (Test-Path $verifyScript)) {
        Write-Error "weekly-system-review: missing verify-build-gates at $verifyScript"
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
        Write-Error "weekly-system-review: verify-build-gates failed (exit $gateExit)"
        exit $gateExit
    }
}

if (-not (Test-Path $genScript)) {
    Write-Error "weekly-system-review: missing $genScript"
    exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $genScript -WorkspaceRoot $agencyRoot
if ($LASTEXITCODE -ne 0) {
    Write-Error "weekly-system-review: generate-integrated-status-report failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
}
$reportLabel = "OK"

if ($gatesRan -and (Test-Path $alertFile)) {
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
        "### Machine appendix (weekly-system-review)",
        "- $stampLocal : $gateSummary ; integrated-status: generate-integrated-status-report.ps1 $reportLabel",
        ""
    ) -join "`r`n"
    Add-Content -LiteralPath $worklogPath -Value $append -Encoding UTF8
}

Write-Output "weekly-system-review: done ($gateSummary, report $reportLabel)."
exit 0
