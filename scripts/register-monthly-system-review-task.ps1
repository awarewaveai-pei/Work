# Registers monthly task AgencyOS-MonthlySystemReview (scripts\monthly-system-review.ps1 via the
# hidden scheduled-task-launcher.ps1).
#
# WHY the Task Scheduler COM API: schtasks /TR caps the action at 261 chars and the launcher
# command is longer, and the ScheduledTasks module has no monthly trigger. The old schtasks
# version deleted the task first and then failed on the length cap, and the task that survived
# was an older direct call into agency-os\scripts (removed 2026-10-14). CREATE_OR_UPDATE replaces
# the task in one step, so a failed registration never leaves the machine without it.

param(
    [string]$WorkspaceRoot = "",
    [int]$DayOfMonth = 1,
    [string]$StartTime = "09:20",
    [switch]$NoInteractive,
    [switch]$RemoveOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')

function Encode-ExtraArgsB64 {
    param([string]$Plain)
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Plain))
}

if ($DayOfMonth -lt 1 -or $DayOfMonth -gt 28) {
    throw "DayOfMonth must be 1..28 for stable cross-month scheduling (got: $DayOfMonth)"
}

$taskName = "AgencyOS-MonthlySystemReview"

if ($RemoveOnly) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "Removed scheduled task: $taskName"
    exit 0
}

$agencyRoot = Resolve-AgencyRoot -InputRoot $WorkspaceRoot
$monthlyScript = Join-Path $PSScriptRoot "monthly-system-review.ps1"
$launcher = Join-Path $PSScriptRoot "scheduled-task-launcher.ps1"
foreach ($p in @($monthlyScript, $launcher)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "Missing $p" }
}

$parts = $StartTime.Split(":")
if ($parts.Count -lt 2) { throw "StartTime must be HH:mm (got: $StartTime)" }
$at = Get-Date -Hour ([int]$parts[0]) -Minute ([int]$parts[1]) -Second 0

$rootSq = $agencyRoot.Replace("'", "''")
$b64 = Encode-ExtraArgsB64 -Plain ("-AgencyOsRoot '{0}'" -f $rootSq)
$arg = "-NoProfile -WindowStyle Hidden -NonInteractive -ExecutionPolicy Bypass -File `"$launcher`" -TargetScript `"$monthlyScript`" -ExtraArgsB64 $b64 -LogStem MonthlySystemReview"

$svc = New-Object -ComObject Schedule.Service
$svc.Connect()
$def = $svc.NewTask(0)
$def.RegistrationInfo.Description = "AgencyOS monthly system review -- registered by scripts\register-monthly-system-review-task.ps1"
# Same settings as the daily guard / weekly registrars: run on battery, catch up a missed start.
$def.Settings.StartWhenAvailable = $true
$def.Settings.DisallowStartIfOnBatteries = $false
$def.Settings.StopIfGoingOnBatteries = $false
$logonType = if ($NoInteractive) { 2 } else { 3 }   # TASK_LOGON_S4U / TASK_LOGON_INTERACTIVE_TOKEN
$def.Principal.LogonType = $logonType
$def.Principal.RunLevel = 0                          # TASK_RUNLEVEL_LUA (not elevated)
$trigger = $def.Triggers.Create(4)                   # TASK_TRIGGER_MONTHLY
$trigger.DaysOfMonth = [int](1 -shl ($DayOfMonth - 1))
$trigger.MonthsOfYear = 0xFFF                        # every month
$trigger.StartBoundary = $at.ToString("yyyy-MM-dd'T'HH:mm:ss")
$action = $def.Actions.Create(0)                     # TASK_ACTION_EXEC
$action.Path = "powershell.exe"
$action.Arguments = $arg
$user = if ($NoInteractive) { $env:USERNAME } else { $null }
[void]$svc.GetFolder("\").RegisterTaskDefinition($taskName, $def, 6, $user, $null, $logonType)   # 6 = CREATE_OR_UPDATE

$verify = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction Stop
Write-Output "Registered: $($verify.TaskName) (day $DayOfMonth at $StartTime local). Action: powershell.exe $arg"
Write-Output "Verify: Get-ScheduledTask -TaskName '$taskName' -TaskPath '\'"
