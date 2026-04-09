param(
    [string]$WorkRoot = "",
    [switch]$RemoveOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$startupFile = Join-Path $startupDir "AgencyOS-Autopilot-Startup.cmd"
$loopFile = Join-Path $startupDir "AgencyOS-Autopilot-AlertMonitor.cmd"

if ($RemoveOnly) {
    foreach ($p in @($startupFile, $loopFile)) {
        if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
    }
    Write-Output "Removed startup fallback files."
    exit 0
}

if (-not (Test-Path -LiteralPath $startupDir)) {
    New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
}

# ao-resume runs every boot; Slack notify only on failure (exit code != 0).
$startupCmd = @(
    "@echo off",
    "powershell -NoProfile -ExecutionPolicy Bypass -File ""$WorkRoot\scripts\ao-resume.ps1"" -WorkRoot ""$WorkRoot"" -SkipVerify -SkipStrictEnvironmentAudit -AllowUnexpectedDirty",
    "if errorlevel 1 (",
    "  powershell -NoProfile -ExecutionPolicy Bypass -File ""$WorkRoot\scripts\notify-ops.ps1"" -Title ""AO Startup Preflight FAIL"" -Message ""Startup preflight failed (ao-resume). Run AO-RESUME manually or check repo sync."" -Level error",
    ")"
) -join "`r`n"
Set-Content -LiteralPath $startupFile -Value $startupCmd -Encoding ASCII

$loopCmd = @(
    "@echo off",
    "powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File ""$WorkRoot\scripts\autopilot-alert-loop.ps1"" -WorkRoot ""$WorkRoot"" -IntervalSeconds 600"
) -join "`r`n"
Set-Content -LiteralPath $loopFile -Value $loopCmd -Encoding ASCII

Write-Output "Installed startup fallback files:"
Write-Output ("- " + $startupFile)
Write-Output ("- " + $loopFile)
exit 0
