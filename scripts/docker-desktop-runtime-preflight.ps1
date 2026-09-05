[CmdletBinding()]
param([switch]$StartDesktop)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Docker Desktop can leave AF_UNIX reparse-point sockets behind after an
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

    # Reduce (but cannot eliminate) the race with an independent manual start.
    if (Test-DockerDesktopActive) {
        Write-Output 'SKIP: Docker Desktop started during preflight; no further runtime paths will be changed.'
        exit 0
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
    $archiveName = "$($runtimeDirectory.ArchiveName)-$stamp"
    # Split-Path -LiteralPath cannot be combined with -Parent in Windows PS 5.1.
    $parent = [IO.Path]::GetDirectoryName($runtimeDirectory.Path)
    $destination = Join-Path -Path $parent -ChildPath $archiveName

    Rename-Item -LiteralPath $runtimeDirectory.Path -NewName $archiveName -ErrorAction Stop
    Write-Output "QUARANTINED: $($runtimeDirectory.Path) -> $destination"
}

# Use this switch from the safe-start shortcut so every launch gets a preflight,
# including restarts within the same Windows login. Errors above prevent launch.
if ($StartDesktop) {
    $desktopExe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    Start-Process -FilePath $desktopExe -WindowStyle Hidden -ErrorAction Stop
}
