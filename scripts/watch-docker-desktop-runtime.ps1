[CmdletBinding()]
param(
    [ValidateRange(1, 60)]
    [int]$PollSeconds = 2,
    [switch]$Once,
    # HKCU Run value that launches Docker Desktop directly, bypassing the
    # preflight (found live 2026-09-07 while Docker's own AutoStart=false).
    [string]$RunKeyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
    [string]$RunValueName = 'Docker Desktop',
    [int]$RelaunchCooldownMinutes = 10,
    [switch]$NoRelaunch
)

# One reconcile pass per invocation; the scheduled task re-runs it every
# minute (see register-docker-desktop-runtime-tasks.ps1). Desired state:
# after an abnormal exit (stale sockets quarantined), Docker Desktop is back
# up. The old design - one immortal process polling every 2s with
# RestartCount=0 - died once (0xC000013A) and stayed dead until the next
# logon. -PollSeconds loop mode is kept for ad-hoc use only.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'docker-desktop-runtime-common.ps1')
$preflight = Join-Path $PSScriptRoot 'docker-desktop-runtime-preflight.ps1'

# State lives next to Docker's own runtime dir so a test can redirect it with
# LOCALAPPDATA. heartbeat = "watchdog alive" (overwritten); log = actions only;
# relaunch-pending = a quarantine happened and Docker has not been seen alive
# since (critic review 2026-09-07 C2: a failed launch used to be forgotten).
$stateRoot = Join-Path $env:LOCALAPPDATA 'Docker'
$heartbeatFile = Join-Path $stateRoot 'watchdog.heartbeat'
$logFile = Join-Path $stateRoot 'watchdog.log'
$lastRelaunchFile = Join-Path $stateRoot 'watchdog-last-relaunch.txt'
$pendingMarker = Join-Path $stateRoot 'watchdog.relaunch-pending'
$pausedMarker = Join-Path $stateRoot 'watchdog.paused'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$logRotateBytes = 1MB

function Write-WatchdogLog {
    param([Parameter(Mandatory)][string]$Message)
    if (-not (Test-Path -LiteralPath $stateRoot)) { New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null }
    [IO.File]::AppendAllText($logFile, ('{0} {1}{2}' -f (Get-Date -Format 'o'), $Message, [Environment]::NewLine), $utf8)
    # Information stream, never the success pipeline: Test-RelaunchAllowed
    # returns a bool, and a Write-Output here made it @('SKIP...', $false),
    # which `-not` treats as $false -> relaunched through the cooldown
    # (caught by the harness, 2026-09-07).
    Write-Host $Message
}

function Set-StateFile { param([string]$Path) [IO.File]::WriteAllText($Path, (Get-Date -Format 'o'), $utf8) }

function Remove-BypassLauncher {
    if (-not (Test-Path -LiteralPath $RunKeyPath)) { return }
    $item = Get-ItemProperty -LiteralPath $RunKeyPath -ErrorAction SilentlyContinue
    if ($null -eq $item -or -not ($item.PSObject.Properties.Name -contains $RunValueName)) { return }
    $value = $item.$RunValueName
    Remove-ItemProperty -LiteralPath $RunKeyPath -Name $RunValueName -ErrorAction Stop
    Write-WatchdogLog "RUNKEY-REMOVED: $RunKeyPath\$RunValueName = $value (bypassed the preflight; the Preflight task owns logon launch)"
}

# Cooldown = age of the stamp file, never its content (critic review
# 2026-09-07 C1: a 0-byte/garbage stamp used to throw before the relaunch and
# disable recovery permanently, unlogged).
function Test-RelaunchAllowed {
    if ($NoRelaunch) { Write-WatchdogLog 'SKIP-RELAUNCH: -NoRelaunch'; return $false }
    if (Test-Path -LiteralPath $pausedMarker) { Write-WatchdogLog "SKIP-RELAUNCH: $pausedMarker present"; return $false }
    if (Test-Path -LiteralPath $lastRelaunchFile) {
        $age = (Get-Date) - (Get-Item -LiteralPath $lastRelaunchFile).LastWriteTime
        if ($age.TotalMinutes -lt $RelaunchCooldownMinutes) {
            Write-WatchdogLog ('SKIP-RELAUNCH: cooldown, last relaunch {0:N1} min ago (< {1})' -f $age.TotalMinutes, $RelaunchCooldownMinutes)
            return $false
        }
    }
    return $true
}

function Invoke-ReconcilePass {
    if (-not (Test-Path -LiteralPath $stateRoot)) { New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null }
    Set-StateFile $heartbeatFile
    $failures = @()

    # 1. Quarantine (no-op while Docker is alive). A partial failure is logged
    #    and retried next minute; no relaunch on top of a half-quarantined state.
    $preflightFailed = $false
    $lines = @()
    try { $lines = @(& $preflight) } catch { $preflightFailed = $true; $failures += "PREFLIGHT-FAILED: $($_.Exception.Message)"; Write-WatchdogLog $failures[-1] }
    foreach ($line in @($lines | Where-Object { $_ -like 'QUARANTINED:*' -or $_ -like 'ROLLED-BACK:*' })) { Write-WatchdogLog $line }
    if (@($lines | Where-Object { $_ -like 'QUARANTINED:*' }).Count -gt 0) { Set-StateFile $pendingMarker }

    # 2. Relaunch until Docker is observed alive again.
    if (Test-DockerDesktopActive) {
        if (Test-Path -LiteralPath $pendingMarker) { Remove-Item -LiteralPath $pendingMarker -Force; Write-WatchdogLog 'RECOVERED: Docker Desktop is active again' }
    } elseif ((Test-Path -LiteralPath $pendingMarker) -and -not $preflightFailed) {
        if (Test-RelaunchAllowed) {
            Set-StateFile $lastRelaunchFile
            try { Start-DockerDesktop; Write-WatchdogLog 'RELAUNCHED: Docker Desktop started after stale-socket quarantine' }
            catch { $failures += "RELAUNCH-FAILED: $($_.Exception.Message)"; Write-WatchdogLog $failures[-1] }
        }
    }

    # 3. Launch-owner hygiene, last: cosmetic, must never block recovery.
    try { Remove-BypassLauncher } catch { $failures += "RUNKEY-FAILED: $($_.Exception.Message)"; Write-WatchdogLog $failures[-1] }

    if ((Test-Path -LiteralPath $logFile) -and (Get-Item -LiteralPath $logFile).Length -gt $logRotateBytes) {
        Move-Item -LiteralPath $logFile -Destination ($logFile + '.1') -Force
    }
    if ($failures.Count -gt 0) { throw ($failures -join '; ') }
}

do {
    Invoke-ReconcilePass
    if ($Once) { break }
    Start-Sleep -Seconds $PollSeconds
} while ($true)
