param(
    [string]$WorkspaceRoot = "",
    [string]$DailyTime = "22:30",
    [switch]$NoInteractive,
    [switch]$NoOpenStatusOnStartup,
    [switch]$RemoveOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path $InputRoot)) { return (Resolve-Path $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

function Invoke-Schtasks {
    param([string[]]$Args)
    $output = & schtasks.exe @Args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ("schtasks failed: " + ($output | Out-String))
    }
    return ($output | Out-String).Trim()
}

function Quote-Arg {
    param([string]$Value)
    if ($null -eq $Value) { return '""' }
    return '"' + $Value.Replace('"', '""') + '"'
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$guardPath = Join-Path $root "scripts/system-guard.ps1"

$nameDaily = "AgencyOS-SystemGuard-Daily"
$nameLogoff = "AgencyOS-SystemGuard-OnLogoff"
$nameStartup = "AgencyOS-SystemGuard-OnStartup"

foreach ($n in @($nameDaily, $nameLogoff, $nameStartup)) {
    try { Invoke-Schtasks -Args @("/Delete", "/F", "/TN", $n) | Out-Null } catch {}
}

if ($RemoveOnly) {
    Write-Output "Removed system guard scheduled tasks."
    exit 0
}

$guardPathQuoted = Quote-Arg -Value $guardPath
$rootQuoted = Quote-Arg -Value $root

$trDaily = "powershell -NoProfile -ExecutionPolicy Bypass -File " + $guardPathQuoted + " -WorkspaceRoot " + $rootQuoted + " -Mode daily"
$trLogoff = "powershell -NoProfile -ExecutionPolicy Bypass -File " + $guardPathQuoted + " -WorkspaceRoot " + $rootQuoted + " -Mode pre_shutdown"
$trStartup = "powershell -NoProfile -ExecutionPolicy Bypass -File " + $guardPathQuoted + " -WorkspaceRoot " + $rootQuoted + " -Mode startup"
if (-not $NoOpenStatusOnStartup) {
    $trStartup += " -OpenStatusFile"
}

    $it = @()
    if (-not $NoInteractive) { $it = @("/IT") }

Invoke-Schtasks -Args (@("/Create", "/F", "/SC", "DAILY", "/TN", $nameDaily, "/TR", $trDaily, "/ST", $DailyTime) + $it) | Out-Null
Invoke-Schtasks -Args (@("/Create", "/F", "/SC", "ONLOGOFF", "/TN", $nameLogoff, "/TR", $trLogoff) + $it) | Out-Null
Invoke-Schtasks -Args (@("/Create", "/F", "/SC", "ONSTART", "/TN", $nameStartup, "/TR", $trStartup) + $it) | Out-Null

Invoke-Schtasks -Args @("/Query", "/TN", $nameDaily) | Out-Null
Invoke-Schtasks -Args @("/Query", "/TN", $nameLogoff) | Out-Null
Invoke-Schtasks -Args @("/Query", "/TN", $nameStartup) | Out-Null

Write-Output "Registered system guard scheduled tasks."
