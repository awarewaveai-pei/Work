[CmdletBinding()]
param(
    [string]$ScriptsRoot = $PSScriptRoot,
    [switch]$Show
)

# SSOT for the two user-scoped scheduled tasks (they were previously created
# inline and existed only in this machine's task store). Idempotent; runs
# unelevated for the current user. -Show prints the live definitions.
#
#   Docker Desktop Runtime Preflight - at logon: preflight, then launch. Sole
#     owner of logon launch (the HKCU Run bypass is removed by the watchdog).
#   Docker Desktop Runtime Watchdog  - every 1 minute, indefinitely, short-lived
#     (-Once). No immortal process: a dead run is simply followed by the next.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$preflightName = 'Docker Desktop Runtime Preflight'
$watchdogName = 'Docker Desktop Runtime Watchdog'

if ($Show) {
    foreach ($n in $preflightName, $watchdogName) {
        $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
        if (-not $t) { Write-Output "$n : NOT REGISTERED"; continue }
        $i = Get-ScheduledTaskInfo -TaskName $n
        Write-Output ('{0}: State={1} LastRun={2} LastResult={3} NextRun={4}' -f $n, $t.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime)
        foreach ($tr in $t.Triggers) { Write-Output ('  trigger {0} repeat={1}' -f $tr.CimClass.CimClassName, $tr.Repetition.Interval) }
        Write-Output ('  restart={0}x/{1} limit={2} multi={3}' -f $t.Settings.RestartCount, $t.Settings.RestartInterval, $t.Settings.ExecutionTimeLimit, $t.Settings.MultipleInstances)
    }
    exit 0
}

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$preflightScript = Join-Path $ScriptsRoot 'docker-desktop-runtime-preflight.ps1'
$watchScript = Join-Path $ScriptsRoot 'watch-docker-desktop-runtime.ps1'
foreach ($p in $preflightScript, $watchScript) { if (-not (Test-Path -LiteralPath $p)) { throw "missing: $p" } }

$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

$preflightAction = New-ScheduledTaskAction -Execute $powershell -Argument ('-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -StartDesktop' -f $preflightScript)
$preflightSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $preflightName -Action $preflightAction -Principal $principal -Settings $preflightSettings `
    -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) -Force | Out-Null
Write-Output "registered: $preflightName (at logon, restart 3x/1min)"

$watchAction = New-ScheduledTaskAction -Execute $powershell -Argument ('-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Once' -f $watchScript)
# Time limit 2x the cadence (a pass killed mid-loop would leave one directory
# quarantined); no RestartCount - the next minute IS the retry. No logon
# trigger either (critic review 2026-09-07 M4): the Preflight task is the
# sole logon launcher, and the +1-minute repetition covers the logon window.
$watchSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
# Once-at-registration + repeat every minute, no -RepetitionDuration =
# indefinite on this build (Windows 11 26100 rejects the older
# [TimeSpan]::MaxValue idiom: 0x80041318 "P99999999DT23H59M59S out of range",
# found on the first real registration 2026-09-07). The series keeps its
# 1-minute cadence across reboots.
$start = (Get-Date).AddMinutes(1)
$repeating = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $watchdogName -Action $watchAction -Principal $principal -Settings $watchSettings `
    -Trigger $repeating -Force | Out-Null
Write-Output "registered: $watchdogName (every 1 min from $($start.ToString('HH:mm')), limit 2min)"
