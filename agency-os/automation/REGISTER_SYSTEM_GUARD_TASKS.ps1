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

function Encode-ExtraArgsB64 {
    param([string]$Plain)
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Plain))
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$guardPath = Join-Path $root "scripts/system-guard.ps1"
$monorepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$launcher = Join-Path $monorepoRoot "scripts\scheduled-task-launcher.ps1"
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Missing scheduled-task-launcher.ps1 at $launcher (expected monorepo root scripts)."
}

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
$launcherQuoted = Quote-Arg -Value $launcher
$rootSq = $root.Replace("'", "''")

$trDaily = "powershell -NoProfile -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File " + $launcherQuoted +
    " -TargetScript " + $guardPathQuoted +
    " -ExtraArgsB64 " + (Encode-ExtraArgsB64 -Plain ("-WorkspaceRoot '{0}' -Mode daily -HideUi" -f $rootSq)) +
    " -LogStem " + (Quote-Arg "SystemGuard-Daily")

$trLogoff = "powershell -NoProfile -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File " + $launcherQuoted +
    " -TargetScript " + $guardPathQuoted +
    " -ExtraArgsB64 " + (Encode-ExtraArgsB64 -Plain ("-WorkspaceRoot '{0}' -Mode pre_shutdown -HideUi" -f $rootSq)) +
    " -LogStem " + (Quote-Arg "SystemGuard-Logoff")

$startupArgs = "-WorkspaceRoot '{0}' -Mode startup" -f $rootSq
if (-not $NoOpenStatusOnStartup) {
    $startupArgs += " -OpenStatusFile"
} else {
    # 未要求開啟狀態檔時改為完全背景（無 Popup／不開檔）
    $startupArgs += " -HideUi"
}
$trStartup = "powershell -NoProfile -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File " + $launcherQuoted +
    " -TargetScript " + $guardPathQuoted +
    " -ExtraArgsB64 " + (Encode-ExtraArgsB64 -Plain $startupArgs) +
    " -LogStem " + (Quote-Arg "SystemGuard-OnStart")

    $it = @()
    if (-not $NoInteractive) { $it = @("/IT") }

Invoke-Schtasks -Args (@("/Create", "/F", "/SC", "DAILY", "/TN", $nameDaily, "/TR", $trDaily, "/ST", $DailyTime) + $it) | Out-Null
Invoke-Schtasks -Args (@("/Create", "/F", "/SC", "ONLOGOFF", "/TN", $nameLogoff, "/TR", $trLogoff) + $it) | Out-Null
Invoke-Schtasks -Args (@("/Create", "/F", "/SC", "ONSTART", "/TN", $nameStartup, "/TR", $trStartup) + $it) | Out-Null

Invoke-Schtasks -Args @("/Query", "/TN", $nameDaily) | Out-Null
Invoke-Schtasks -Args @("/Query", "/TN", $nameLogoff) | Out-Null
Invoke-Schtasks -Args @("/Query", "/TN", $nameStartup) | Out-Null

Write-Output "Registered system guard scheduled tasks."
