[CmdletBinding()]
param(
    [string]$ScriptsRoot,
    [switch]$RetargetShortcuts,
    [switch]$Show
)

# SSOT for the Docker Desktop launch guard: one logon scheduled task plus the
# Desktop/Start Menu shortcuts. Idempotent, runs unelevated for the current
# user. `-Show` prints live state; `-RetargetShortcuts` points the shortcuts
# at the guard (run once per machine, and again after Docker Desktop
# self-updates and recreates its own shortcuts).
#
# History (2026-09-07, do not re-add without new evidence): a scheduled
# "Watchdog" task tried to auto-relaunch Docker Desktop after a crash, first
# on a timer (every 1 then 5 minutes - visibly flashed a PowerShell window,
# and running every minute was needless for a failure mode that only occurs
# on sleep), then on a "resume from sleep" event trigger
# (Microsoft-Windows-Kernel-Power EventID 107). Both were removed: the
# EventRecordId ordering in the System log proved 107 fires ~seconds AFTER
# sleep is entered, not on resume (it sits between the sleep event and every
# real wake event, e.g. Power-Troubleshooter EventID 1), so the trigger had
# never actually fired once since registration - a silent no-op the operator
# would only have discovered on the next real crash. The operator's own
# call: guard every launch path instead of trying to detect the crash and
# relaunch automatically - simpler, and it was already true that Docker
# Desktop 4.89 dying during a laptop sleep needs a human at the keyboard
# anyway to resume the work that was interrupted.
#
# $PSScriptRoot as a PARAM DEFAULT evaluates to an empty string when this
# script is invoked with `powershell -File` (works fine with `&`/dot-source)
# - reproduced live (critic review 2026-09-07 M1). Resolved after the param
# block instead, the same idiom test-docker-desktop-runtime-preflight.ps1
# already uses.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ScriptsRoot) { $ScriptsRoot = $PSScriptRoot }

$preflightName = 'Docker Desktop Runtime Preflight'
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$launcher = Join-Path $ScriptsRoot 'docker-desktop-runtime-hidden-launch.vbs'
$preflightScript = Join-Path $ScriptsRoot 'docker-desktop-runtime-preflight.ps1'
$desktopExe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
$guardedArgs = '//B //Nologo "{0}" "{1}" -StartDesktop' -f $launcher, $preflightScript

# Per-user shortcuts this script can write unelevated. The all-users Start
# Menu copy (critic review 2026-09-07 M3: found live, launches Docker
# directly, bypasses the guard entirely) needs an admin session to retarget
# - reported by -Show, fixed manually per the runbook, not written here.
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Docker Desktop.lnk')
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Docker Desktop.lnk')
)
$allUsersShortcut = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Docker Desktop.lnk'

function Test-ShortcutGuarded {
    param($Shell, [string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $s = $Shell.CreateShortcut($Path)
    return ($s.TargetPath -ieq $wscript) -and ($s.Arguments -eq $guardedArgs)
}

if ($Show) {
    $t = Get-ScheduledTask -TaskName $preflightName -ErrorAction SilentlyContinue
    if (-not $t) {
        Write-Output "$preflightName : not registered"
    } else {
        $i = Get-ScheduledTaskInfo -TaskName $preflightName
        Write-Output ('{0}: State={1} LastRun={2} LastResult={3}' -f $preflightName, $t.State, $i.LastRunTime, $i.LastTaskResult)
        foreach ($a in $t.Actions) { Write-Output ('  action {0} {1}' -f $a.Execute, $a.Arguments) }
    }
    $sh = New-Object -ComObject WScript.Shell
    foreach ($lnk in $shortcuts) {
        $g = Test-ShortcutGuarded -Shell $sh -Path $lnk
        $state = if ($null -eq $g) { '(missing)' } else { "guarded=$g" }
        Write-Output ('shortcut {0}: {1}' -f $lnk, $state)
    }
    $allUsersGuarded = Test-ShortcutGuarded -Shell $sh -Path $allUsersShortcut
    $allUsersState = if ($null -eq $allUsersGuarded) { '(missing)' } elseif ($allUsersGuarded) { 'guarded' } else { 'UNGUARDED - launches Docker directly; retarget manually from an elevated session, see runbook' }
    Write-Output ('all-users shortcut {0}: {1}' -f $allUsersShortcut, $allUsersState)
    $run = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
    Write-Output ('HKCU Run bypass present: ' + [bool]($run -and ($run.PSObject.Properties.Name -contains 'Docker Desktop')))
    exit 0
}

foreach ($p in $preflightScript, $launcher) { if (-not (Test-Path -LiteralPath $p)) { throw "missing: $p" } }
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$preflightAction = New-ScheduledTaskAction -Execute $wscript -Argument $guardedArgs
$preflightSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $preflightName -Action $preflightAction -Principal $principal -Settings $preflightSettings `
    -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) -Force | Out-Null
Write-Output "registered: $preflightName (at logon, restart 3x/1min, zero-window launcher)"

if ($RetargetShortcuts) {
    $sh = New-Object -ComObject WScript.Shell
    foreach ($lnk in $shortcuts) {
        if (-not (Test-Path -LiteralPath $lnk)) { Write-Output "shortcut missing, skipped: $lnk"; continue }
        if (Test-ShortcutGuarded -Shell $sh -Path $lnk) { Write-Output "shortcut already guarded: $lnk"; continue }
        $s = $sh.CreateShortcut($lnk)
        Write-Output ('retargeting {0}: was "{1}" {2}' -f $lnk, $s.TargetPath, $s.Arguments)
        $s.TargetPath = $wscript
        $s.Arguments = $guardedArgs
        $s.IconLocation = "$desktopExe,0"
        $s.WorkingDirectory = [IO.Path]::GetDirectoryName($desktopExe)
        $s.Save()
    }
    if (Test-Path -LiteralPath $allUsersShortcut) {
        if (Test-ShortcutGuarded -Shell $sh -Path $allUsersShortcut) {
            Write-Output "all-users shortcut already guarded: $allUsersShortcut"
        } else {
            Write-Output "all-users shortcut NOT retargeted (needs elevation): $allUsersShortcut - see runbook for the manual step"
        }
    }
}
