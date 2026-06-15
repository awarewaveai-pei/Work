# Registers system guard scheduled tasks via Register-ScheduledTask (ScheduledTasks module).
#
# WHY the module (not schtasks.exe): schtasks /TR caps the action string at 261 chars.
# The hidden launcher command (scheduled-task-launcher.ps1 + base64 ExtraArgs) is ~308 chars,
# so the old schtasks-based registrar silently failed to create the hidden tasks — leaving an
# older, short, NON-hidden Daily task that flashed a red PowerShell window on every run
# (root cause 2026-06-16; mirrors the proven REGISTER_WEEKLY_SYSTEM_REVIEW_TASK.ps1 pattern).
# Register-ScheduledTask has no such length limit.
#
# Tasks: Daily (-Daily) + OnStartup (-AtStartup). Both run hidden (-WindowStyle Hidden) and
# silent (-HideUi: write reports in the background, NO status-file popup).
# OnLogoff was dropped: schtasks /SC ONLOGOFF is not a valid trigger (it never registered) and
# New-ScheduledTaskTrigger has no logoff trigger; the pre_shutdown guard value is marginal.

param(
    [string]$WorkspaceRoot = "",
    [string]$DailyTime = "22:30",
    [switch]$NoInteractive,
    [switch]$RemoveOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) { return (Resolve-Path -LiteralPath $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

function Encode-ExtraArgsB64 {
    param([string]$Plain)
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Plain))
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$guardPath = Join-Path $root "scripts\system-guard.ps1"
if (-not (Test-Path -LiteralPath $guardPath)) {
    throw "Missing system-guard.ps1 at $guardPath"
}
$monorepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$launcher = Join-Path $monorepoRoot "scripts\scheduled-task-launcher.ps1"
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Missing scheduled-task-launcher.ps1 at $launcher (expected monorepo root scripts)."
}

$nameDaily   = "AgencyOS-SystemGuard-Daily"
$nameStartup = "AgencyOS-SystemGuard-OnStartup"
$nameLogoff  = "AgencyOS-SystemGuard-OnLogoff"   # legacy — removed below (never functioned)

# Remove any prior copies (incl. the stale non-hidden Daily and never-created Logoff/Startup).
foreach ($n in @($nameDaily, $nameStartup, $nameLogoff)) {
    Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue
}

if ($RemoveOnly) {
    Write-Output "Removed system guard scheduled tasks."
    exit 0
}

$rootSq = $root.Replace("'", "''")

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
if ($NoInteractive) {
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
} else {
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
}

function New-GuardArg {
    param([string]$ModeArgs, [string]$LogStem)
    $b64 = Encode-ExtraArgsB64 -Plain $ModeArgs
    return "-NoProfile -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File `"$launcher`" -TargetScript `"$guardPath`" -ExtraArgsB64 $b64 -LogStem `"$LogStem`""
}

# --- Daily (hidden + silent) ---
$parts = $DailyTime.Split(":")
if ($parts.Count -lt 2) { throw "DailyTime must be HH:mm (got: $DailyTime)" }
$at = Get-Date -Hour ([int]$parts[0]) -Minute ([int]$parts[1]) -Second 0
$argDaily = New-GuardArg -ModeArgs ("-WorkspaceRoot '{0}' -Mode daily -HideUi" -f $rootSq) -LogStem "SystemGuard-Daily"
Register-ScheduledTask -TaskName $nameDaily `
    -Action (New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argDaily) `
    -Trigger (New-ScheduledTaskTrigger -Daily -At $at) `
    -Settings $settings -Principal $principal -Force | Out-Null

# --- OnStartup (hidden + silent; background report only, no popup) ---
$argStartup = New-GuardArg -ModeArgs ("-WorkspaceRoot '{0}' -Mode startup -HideUi" -f $rootSq) -LogStem "SystemGuard-OnStart"
Register-ScheduledTask -TaskName $nameStartup `
    -Action (New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argStartup) `
    -Trigger (New-ScheduledTaskTrigger -AtStartup) `
    -Settings $settings -Principal $principal -Force | Out-Null

Get-ScheduledTask -TaskName $nameDaily   -TaskPath '\' -ErrorAction Stop | Out-Null
Get-ScheduledTask -TaskName $nameStartup -TaskPath '\' -ErrorAction Stop | Out-Null

Write-Output "Registered system guard scheduled tasks (Daily $DailyTime + OnStartup; both hidden/silent via Register-ScheduledTask — no schtasks 261-char limit)."
Write-Output "Verify: Get-ScheduledTask -TaskName 'AgencyOS-SystemGuard-*' | Select TaskName,State"
