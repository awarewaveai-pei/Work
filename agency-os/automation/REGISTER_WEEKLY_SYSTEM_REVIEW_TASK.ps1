# Registers weekly task via Register-ScheduledTask (AgencyOS-WeeklySystemReview).

param(
    [string]$WorkspaceRoot = "",
    [string]$DayOfWeek = "MON",
    [string]$StartTime = "09:00",
    [switch]$NoInteractive,
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

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$weeklyScript = Join-Path $root "scripts\weekly-system-review.ps1"
if (-not (Test-Path $weeklyScript)) {
    throw "Missing weekly script: $weeklyScript"
}

$taskName = "AgencyOS-WeeklySystemReview"

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

if ($RemoveOnly) {
    Write-Output "Removed scheduled task: $taskName"
    exit 0
}

$day = $DayOfWeek.ToUpperInvariant()
$dayMap = @{
    MON = "Monday"
    TUE = "Tuesday"
    WED = "Wednesday"
    THU = "Thursday"
    FRI = "Friday"
    SAT = "Saturday"
    SUN = "Sunday"
}
if (-not $dayMap.ContainsKey($day)) {
    throw "DayOfWeek must be MON..SUN (got: $DayOfWeek)"
}
$dayEn = $dayMap[$day]

$parts = $StartTime.Split(":")
if ($parts.Count -lt 2) { throw "StartTime must be HH:mm (got: $StartTime)" }
$hour = [int]$parts[0]
$minute = [int]$parts[1]
$at = Get-Date -Hour $hour -Minute $minute -Second 0

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$weeklyScript`" -AgencyOsRoot `"$root`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $dayEn -At $at
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

if ($NoInteractive) {
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
} else {
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

$verify = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction Stop
Write-Output "Registered: $($verify.TaskName) ($dayEn $StartTime local). Action: powershell.exe $arg"
Write-Output "Verify: Get-ScheduledTask -TaskName '$taskName' -TaskPath '\'"
