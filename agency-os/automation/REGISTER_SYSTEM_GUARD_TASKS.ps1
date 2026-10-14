# Registers system guard scheduled tasks via Register-ScheduledTask (ScheduledTasks module).
#
# WHY the module (not schtasks.exe): schtasks /TR caps the action string at 261 chars.
# The hidden launcher command (scheduled-task-launcher.ps1 + base64 ExtraArgs) is ~308 chars,
# so the old schtasks-based registrar silently failed to create the hidden tasks — leaving an
# older, short, NON-hidden Daily task that flashed a red PowerShell window on every run
# (root cause 2026-06-16; mirrors the proven REGISTER_WEEKLY_SYSTEM_REVIEW_TASK.ps1 pattern).
# Register-ScheduledTask has no such length limit.
#
# Task: Daily (-Daily) only — runs hidden (-WindowStyle Hidden) and silent (-HideUi: write
# reports in the background, NO status-file popup). Registers WITHOUT elevation.
# OnStartup/OnLogoff were dropped on purpose:
#   - OnStartup (-AtStartup / schtasks ONSTART) requires admin to register (HRESULT 0x80070005
#     non-elevated) and never functioned; boot-time health is already covered by AO-RESUME +
#     the cloud routines, so it is redundant.
#   - OnLogoff: schtasks /SC ONLOGOFF is not a valid trigger and New-ScheduledTaskTrigger has no
#     logoff trigger; the pre_shutdown guard value is marginal.

param(
    [string]$WorkspaceRoot = "",
    [string]$DailyTime = "22:30",
    [switch]$NoInteractive,
    [switch]$RemoveOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# This file lives in <monorepo>\agency-os\automation; code is in <monorepo>\scripts (the only
# scripts tree), found through the shared root helper -- never relative to the agency root.
. (Join-Path $PSScriptRoot '..\..\scripts\lib\repo-roots.ps1')

function Encode-ExtraArgsB64 {
    param([string]$Plain)
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Plain))
}

$root = Resolve-AgencyRoot -InputRoot $WorkspaceRoot
$scriptsDir = Join-Path (Get-MonorepoRoot) "scripts"
$guardPath = Join-Path $scriptsDir "system-guard.ps1"
$launcher = Join-Path $scriptsDir "scheduled-task-launcher.ps1"
foreach ($p in @($guardPath, $launcher)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "Missing $p" }
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

Get-ScheduledTask -TaskName $nameDaily -TaskPath '\' -ErrorAction Stop | Out-Null

Write-Output "Registered system guard scheduled task (Daily $DailyTime; hidden/silent via Register-ScheduledTask — no schtasks 261-char limit)."
Write-Output "Verify: Get-ScheduledTask -TaskName 'AgencyOS-SystemGuard-Daily' | Select TaskName,State"
