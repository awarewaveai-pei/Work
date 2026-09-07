# Shared by docker-desktop-runtime-preflight.ps1 and watch-docker-desktop-runtime.ps1.
# Dot-source only; no side effects.
Set-StrictMode -Version Latest

# Docker Desktop 4.89 process names observed live on this machine (Get-Process,
# 2026-09-07): Docker Desktop, com.docker.backend, com.docker.build, docker-agent.
# com.docker.proxy / com.docker.vpnkit are older names, kept: a superset only
# makes "is Docker alive" MORE conservative. This list is safety-critical -
# live AF_UNIX sockets are reparse points too, so liveness is the only thing
# separating "stale socket" from "running Docker".
$script:DockerActiveProcessNames = @(
    'Docker Desktop'
    'com.docker.backend'
    'com.docker.build'
    'docker-agent'
    'com.docker.proxy'
    'com.docker.vpnkit'
)

$script:DockerDesktopExe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'

# Second, name-drift-resistant liveness signal (critic review 2026-09-07 M1):
# named pipes are kernel objects destroyed with their owner, so they cannot be
# stale. Docker-Desktop-specific names only (`docker_engine` is also created
# by Podman/Rancher). Overridable by the test harness.
# Defined only if the caller has not already defined it: a function in this
# dot-sourced scope would otherwise win over a test harness's shadow (the
# harness runs on a machine where Docker IS alive, so the real pipes exist).
if (-not (Get-Command -Name Get-DockerNamedPipes -CommandType Function -ErrorAction SilentlyContinue)) {
    function Get-DockerNamedPipes {
        @([IO.Directory]::GetFiles('\\.\pipe\')) | Where-Object { $_ -match '\\pipe\\(dockerDesktop|dockerBackendApiServer)' }
    }
}

# Fails CLOSED: any error while asking "is Docker alive" answers yes, because
# the caller's next step is a rename of a directory that would be live.
function Test-DockerDesktopActive {
    try {
        foreach ($processName in $script:DockerActiveProcessNames) {
            if (Get-Process -Name $processName -ErrorAction SilentlyContinue) { return $true }
        }
        if (@(Get-DockerNamedPipes).Count -gt 0) { return $true }
        return $false
    } catch {
        return $true
    }
}

function Get-DockerRuntimeDirectories {
    @(
        [pscustomobject]@{ Path = Join-Path $env:LOCALAPPDATA 'Docker\run'; ArchiveName = 'run.socket-archive' }
        [pscustomobject]@{ Path = Join-Path $env:LOCALAPPDATA 'docker-secrets-engine'; ArchiveName = 'docker-secrets-engine.socket-archive' }
    )
}

function Start-DockerDesktop {
    Start-Process -FilePath $script:DockerDesktopExe -WindowStyle Hidden -ErrorAction Stop
}
