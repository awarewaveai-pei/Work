[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Docker Desktop 4.71 can leave AF_UNIX reparse-point sockets behind after an
# abnormal backend exit. Renaming only those runtime directories is reversible
# and deliberately excludes the WSL disk, volumes, containers, and settings.
$runtimeDirectories = @(
    [pscustomobject]@{ Path = Join-Path $env:LOCALAPPDATA 'Docker\run'; ArchiveName = 'run.socket-archive' }
    [pscustomobject]@{ Path = Join-Path $env:LOCALAPPDATA 'docker-secrets-engine'; ArchiveName = 'docker-secrets-engine.socket-archive' }
)

$activeProcessNames = @(
    'Docker Desktop'
    'com.docker.backend'
    'com.docker.proxy'
    'com.docker.vpnkit'
)

function Test-DockerDesktopActive {
    foreach ($processName in $activeProcessNames) {
        if (Get-Process -Name $processName -ErrorAction SilentlyContinue) {
            return $true
        }
    }

    return $false
}

function Test-ContainsReparsePoint {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        return $false
    }

    return @(
        Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop |
            Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }
    ).Count -gt 0
}

if (Test-DockerDesktopActive) {
    Write-Output 'SKIP: Docker Desktop is active; runtime paths are untouched.'
    exit 0
}

foreach ($runtimeDirectory in $runtimeDirectories) {
    if (-not (Test-ContainsReparsePoint -Path $runtimeDirectory.Path)) {
        Write-Output "CLEAN: $($runtimeDirectory.Path)"
        continue
    }

    # Re-check immediately before the move to avoid racing a manual Docker start.
    if (Test-DockerDesktopActive) {
        Write-Output 'SKIP: Docker Desktop started during preflight; runtime paths are untouched.'
        exit 0
    }

    $parent = Split-Path -LiteralPath $runtimeDirectory.Path -Parent
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
    $destination = Join-Path $parent "$($runtimeDirectory.ArchiveName)-$stamp"

    Move-Item -LiteralPath $runtimeDirectory.Path -Destination $destination -ErrorAction Stop
    Write-Output "QUARANTINED: $($runtimeDirectory.Path) -> $destination"
}
