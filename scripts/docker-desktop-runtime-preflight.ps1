[CmdletBinding()]
param(
    [switch]$StartDesktop,
    # Manual-run switch only; the watchdog needs the output lines.
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'docker-desktop-runtime-common.ps1')

# Docker Desktop can leave AF_UNIX reparse-point sockets behind after an
# abnormal backend exit; the next start then dies on
# "rename engine.sock -> engine.sock.stale: The file cannot be accessed".
# Renaming only the runtime directories is reversible and excludes the WSL
# disk, volumes, containers, and settings. Emits SKIP: / CLEAN: / QUARANTINED:
# / ROLLED-BACK: lines (Quiet mode suppresses them; used for a manual run).
# Exit 0 always unless a rename itself fails.

function Write-PreflightResult {
    param([Parameter(Mandatory)][string]$Message)
    if (-not $Quiet) { Write-Output $Message }
}

function Test-ContainsReparsePoint {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return $false }
    return @(
        Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop |
            Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }
    ).Count -gt 0
}

# $skipped means "do not touch the runtime directories, and do not launch"
# (Docker is active, or another preflight already owns that work). Critic
# review (2026-09-07 M2) suggested launching anyway when Docker is already
# active, reasoning that a single-instance app would just focus its existing
# window - tried live and reverted: Docker Desktop 4.89 does NOT do that. A
# second launch attempt left a genuine second "Docker Desktop" process
# resident (not a transient handoff - stayed alive, ~130MB, taking CPU,
# required killing). Every click of the guarded shortcut while Docker is
# already running would leak one such process. A shortcut click doing
# nothing when Docker is already up is the correct, safe behavior here.
$skipped = $false
if (Test-DockerDesktopActive) {
    Write-PreflightResult 'SKIP: Docker Desktop is active; runtime paths are untouched.'
    $skipped = $true
}

# One quarantine at a time across the Preflight task and a manual run
# (critic review 2026-09-07 M4: two concurrent preflights at logon raced on
# the same Rename-Item). Local\ scope = this session.
$mutex = New-Object System.Threading.Mutex($false, 'Local\DockerDesktopRuntimePreflight')
$mutexHeld = $false
if (-not $skipped) {
    $mutexHeld = $mutex.WaitOne(0)
    if (-not $mutexHeld) {
        Write-PreflightResult 'SKIP: another preflight is already running.'
        $skipped = $true
    }
}

try {
    if (-not $skipped) {
        foreach ($runtimeDirectory in Get-DockerRuntimeDirectories) {
            if (-not (Test-ContainsReparsePoint -Path $runtimeDirectory.Path)) {
                Write-PreflightResult "CLEAN: $($runtimeDirectory.Path)"
                continue
            }

            # Reduce the race with an independent manual start...
            if (Test-DockerDesktopActive) {
                Write-PreflightResult 'SKIP: Docker Desktop started during preflight; no further runtime paths will be changed.'
                $skipped = $true
                break
            }

            $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
            $archiveName = "$($runtimeDirectory.ArchiveName)-$stamp"
            # Split-Path -LiteralPath cannot be combined with -Parent in Windows PS 5.1.
            $parent = [IO.Path]::GetDirectoryName($runtimeDirectory.Path)
            $destination = Join-Path -Path $parent -ChildPath $archiveName

            Rename-Item -LiteralPath $runtimeDirectory.Path -NewName $archiveName -ErrorAction Stop

            # ...and undo it if we lost the race anyway (critic review 2026-09-07
            # M2): a rename that landed on a live Docker is reversed immediately.
            if (Test-DockerDesktopActive) {
                Rename-Item -LiteralPath $destination -NewName ([IO.Path]::GetFileName($runtimeDirectory.Path)) -ErrorAction Stop
                Write-PreflightResult "ROLLED-BACK: $($runtimeDirectory.Path) (Docker Desktop became active after rename)"
                $skipped = $true
                break
            }
            Write-PreflightResult "QUARANTINED: $($runtimeDirectory.Path) -> $destination"
        }
    }
} finally {
    # Release only what was acquired: ReleaseMutex on an un-acquired mutex
    # throws ApplicationException (found by the harness, 2026-09-07).
    if ($mutexHeld) { $mutex.ReleaseMutex() | Out-Null }
    $mutex.Dispose()
}

# Safe-start entrypoint: every launch through here gets a preflight. A skip
# means Docker is already (or becoming) active, or another preflight is
# actively racing this one - nothing to launch.
if ($StartDesktop -and -not $skipped) {
    Start-DockerDesktop
}
