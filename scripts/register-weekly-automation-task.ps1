param(
    [string]$WorkRoot = "",
    [switch]$DisableLegacyTask
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkRoot {
    param([string]$InputRoot)
    if (-not [string]::IsNullOrWhiteSpace($InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) {
        return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    }
    return (Get-Location).Path
}

$root = Resolve-WorkRoot -InputRoot $WorkRoot
$cfgPath = Join-Path $root "scripts\weekly-automation-config.json"
$runnerPath = Join-Path $root "scripts\run-weekly-automation.ps1"

if (-not (Test-Path -LiteralPath $cfgPath)) {
    throw "Config not found: $cfgPath"
}
if (-not (Test-Path -LiteralPath $runnerPath)) {
    throw "Runner not found: $runnerPath"
}

$cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$taskName = [string]$cfg.taskName
if ([string]::IsNullOrWhiteSpace($taskName)) {
    throw "taskName is missing in $cfgPath"
}

$dayOfWeek = [string]$cfg.schedule.dayOfWeek
$time = [string]$cfg.schedule.time
if ([string]::IsNullOrWhiteSpace($dayOfWeek) -or [string]::IsNullOrWhiteSpace($time)) {
    throw "schedule.dayOfWeek or schedule.time missing in $cfgPath"
}

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`" -WorkRoot `"$root`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $dayOfWeek -At $time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "AgencyOS weekly automation runner (config-driven)." -Force | Out-Null
Write-Output "Registered task: $taskName ($dayOfWeek $time)"

if ($DisableLegacyTask) {
    $legacy = "AgencyOS-WeeklySystemReview"
    if (Get-ScheduledTask -TaskName $legacy -ErrorAction SilentlyContinue) {
        Disable-ScheduledTask -TaskName $legacy | Out-Null
        Write-Output "Disabled legacy task: $legacy"
    }
}
