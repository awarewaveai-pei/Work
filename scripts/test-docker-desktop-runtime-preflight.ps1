[CmdletBinding()]
param(
    [string]$ScriptPath,
    [string]$WatchScriptPath
)

# Run with Windows PowerShell 5.1, the same host as the scheduled task.
# Only process discovery is simulated. Detection, junctions, and renames use
# the real filesystem under a unique temporary LOCALAPPDATA. No Docker calls.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ScriptPath) {
    $ScriptPath = Join-Path $PSScriptRoot 'docker-desktop-runtime-preflight.ps1'
}
if (-not $WatchScriptPath) {
    $WatchScriptPath = Join-Path $PSScriptRoot 'watch-docker-desktop-runtime.ps1'
}
$ScriptPath = (Resolve-Path -LiteralPath $ScriptPath).Path
$WatchScriptPath = (Resolve-Path -LiteralPath $WatchScriptPath).Path
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('docker-preflight-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$originalLocalAppData = $env:LOCALAPPDATA
$global:DockerPreflightTestState = @{ ProbeCount = 0; ProcessMode = 'stopped'; Starts = 0 }

function Start-Process {
    [CmdletBinding()]
    param([string]$FilePath, [string]$WindowStyle)
    Assert-True ($FilePath -eq (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')) 'launch target is Docker Desktop'
    $run = Join-Path $env:LOCALAPPDATA 'Docker\run'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $run 'sailor-ingest.sock'))) 'launch occurs after quarantine'
    $global:DockerPreflightTestState.Starts++
}

function Get-Process {
    [CmdletBinding()]
    param([string]$Name)
    $global:DockerPreflightTestState.ProbeCount++
    if ($global:DockerPreflightTestState.ProcessMode -eq 'active' -or
        ($global:DockerPreflightTestState.ProcessMode -eq 'starts-during-check' -and $global:DockerPreflightTestState.ProbeCount -gt 4)) {
        [pscustomobject]@{ ProcessName = $Name; Id = 123 }
    }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "FAIL: $Message" }
}

function Invoke-Fixture {
    param([string]$Case, [string]$Mode, [switch]$Sockets, [switch]$Empty, [switch]$Launch, [switch]$Watchdog)
    $caseRoot = Join-Path $testRoot $Case
    New-Item -ItemType Directory -Path $caseRoot | Out-Null
    $env:LOCALAPPDATA = $caseRoot
    $global:DockerPreflightTestState.ProcessMode = $Mode
    $global:DockerPreflightTestState.ProbeCount = 0
    $global:DockerPreflightTestState.Starts = 0
    $runPath = Join-Path $caseRoot 'Docker\run'
    $secretPath = Join-Path $caseRoot 'docker-secrets-engine'
    $diskPath = Join-Path $caseRoot 'Docker\wsl\disk'
    New-Item -ItemType Directory -Path $diskPath -Force | Out-Null
    $diskFile = Join-Path $diskPath 'docker_data.vhdx'
    New-Item -ItemType File -Path $diskFile -Value 'TEST SENTINEL - NOT A VHDX' | Out-Null
    $diskHash = (Get-FileHash -LiteralPath $diskFile).Hash
    if (-not $Empty) {
        New-Item -ItemType Directory -Path $runPath, $secretPath | Out-Null
        New-Item -ItemType File -Path (Join-Path $runPath 'preserve.txt') -Value 'KEEP' | Out-Null
    }
    if ($Sockets) {
        # Junctions exercise the real ReparsePoint predicate and directory rename.
        # They do not pretend to reproduce the Windows AF_UNIX driver lock itself.
        $target = Join-Path $caseRoot 'junction-target'
        New-Item -ItemType Directory -Path $target | Out-Null
        New-Item -ItemType File -Path (Join-Path $target 'target.txt') -Value 'KEEP TARGET' | Out-Null
        New-Item -ItemType Junction -Path (Join-Path $runPath 'sailor-ingest.sock') -Target $target | Out-Null
        New-Item -ItemType Junction -Path (Join-Path $secretPath 'engine.sock') -Target $target | Out-Null
    }
    if ($Watchdog) {
        & $WatchScriptPath -Once
    } else {
        & $ScriptPath -StartDesktop:$Launch
    }
    $expectedStarts = 0
    if ($Launch -and $Mode -eq 'stopped') { $expectedStarts = 1 }
    Assert-True ($global:DockerPreflightTestState.Starts -eq $expectedStarts) "$Case launch count"
    Assert-True ((Get-FileHash -LiteralPath $diskFile).Hash -eq $diskHash) "$Case preserves data sentinel"
    $archives = @(Get-ChildItem -LiteralPath (Join-Path $caseRoot 'Docker') -Directory |
        Where-Object { $_.Name -like 'run.socket-archive-*' })
    if ($Sockets -and $Mode -eq 'stopped') {
        Assert-True ($archives.Count -eq 1) "$Case archives runtime directory"
        Assert-True (-not (Test-Path -LiteralPath $runPath)) "$Case vacates runtime path"
        Assert-True ((Get-Content -LiteralPath (Join-Path $archives[0].FullName 'preserve.txt') -Raw -Encoding UTF8) -eq 'KEEP') "$Case preserves ordinary files"
        $secretArchives = @(Get-ChildItem -LiteralPath $caseRoot -Directory |
            Where-Object { $_.Name -like 'docker-secrets-engine.socket-archive-*' })
        Assert-True ($secretArchives.Count -eq 1) "$Case archives secrets runtime"
        Assert-True ((Get-Content -LiteralPath (Join-Path $target 'target.txt') -Raw -Encoding UTF8) -eq 'KEEP TARGET') "$Case preserves junction target"
        & $ScriptPath
        Assert-True (@(Get-ChildItem -LiteralPath (Join-Path $caseRoot 'Docker') -Directory |
            Where-Object { $_.Name -like 'run.socket-archive-*' }).Count -eq 1) "$Case is idempotent"
    } else {
        Assert-True ($archives.Count -eq 0) "$Case does not quarantine"
        if (-not $Empty) { Assert-True (Test-Path -LiteralPath $runPath) "$Case preserves runtime directory" }
    }
    Write-Output "PASS: $Case"
}

try {
    Invoke-Fixture -Case 'missing-runtime' -Mode stopped -Empty
    Invoke-Fixture -Case 'ordinary-files' -Mode stopped
    Invoke-Fixture -Case 'active-process' -Mode active -Sockets
    Invoke-Fixture -Case 'process-starts-during-check' -Mode starts-during-check -Sockets
    Invoke-Fixture -Case 'stale-reparse-points' -Mode stopped -Sockets
    Invoke-Fixture -Case 'watchdog-recovery' -Mode stopped -Sockets -Watchdog
    Invoke-Fixture -Case 'safe-launch' -Mode stopped -Sockets -Launch
    Invoke-Fixture -Case 'already-running-launch' -Mode active -Sockets -Launch
    Write-Output ('PASS: all 8 scenarios; PowerShell ' + $PSVersionTable.PSVersion)
} finally {
    $env:LOCALAPPDATA = $originalLocalAppData
    # Preserve fixtures for inspection; no recursive cleanup through junctions.
    Write-Output "Fixtures retained: $testRoot"
}
