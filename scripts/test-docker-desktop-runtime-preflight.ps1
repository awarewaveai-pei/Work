[CmdletBinding()]
param(
    [string]$ScriptPath
)

# Run with Windows PowerShell 5.1, the same host as the scheduled task.
# Process discovery, named-pipe discovery and Desktop launch are simulated via
# function shadows visible to the child script. Detection, junctions, and
# renames use the real filesystem under a unique temporary LOCALAPPDATA.
# No Docker calls; no real registry writes.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ScriptPath) { $ScriptPath = Join-Path $PSScriptRoot 'docker-desktop-runtime-preflight.ps1' }
$ScriptPath = (Resolve-Path -LiteralPath $ScriptPath).Path
. (Join-Path (Split-Path -Parent $ScriptPath) 'docker-desktop-runtime-common.ps1')
$N = $script:DockerActiveProcessNames.Count

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('docker-preflight-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$originalLocalAppData = $env:LOCALAPPDATA
$global:DockerPreflightTestState = @{ ProbeCount = 0; ProcessMode = 'stopped'; Starts = 0 }
$script:scenarios = 0

# --- shadows (dynamic scoping: the child script resolves these first) ------
function Start-Process {
    [CmdletBinding()]
    param([string]$FilePath, [string]$WindowStyle)
    Assert-True ($FilePath -eq (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')) 'launch target is Docker Desktop'
    $run = Join-Path $env:LOCALAPPDATA 'Docker\run'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $run 'sailor-ingest.sock'))) 'launch occurs after quarantine'
    $global:DockerPreflightTestState.Starts++
}

function Get-DockerNamedPipes { @() }

# Probe thresholds are multiples of the process-name count N (one full
# liveness check = N probes while stopped), so they track the list length:
#   starts-during-check : active from probe N+1  (inside the loop's recheck)
#   starts-after-rename  : active from probe 2N+1 (the post-rename rollback check)
function Get-Process {
    [CmdletBinding()]
    param([string]$Name)
    $s = $global:DockerPreflightTestState
    $s.ProbeCount++
    $threshold = switch ($s.ProcessMode) {
        'starts-during-check' { $N }
        'starts-after-rename' { 2 * $N }
        default               { [int]::MaxValue }
    }
    if ($s.ProcessMode -eq 'active' -or $s.ProbeCount -gt $threshold) {
        [pscustomobject]@{ ProcessName = $Name; Id = 123 }
    }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "FAIL: $Message" }
}

function New-CaseRoot {
    param([string]$Case, [string]$Mode, [switch]$Sockets, [switch]$Empty)
    $caseRoot = Join-Path $testRoot $Case
    New-Item -ItemType Directory -Path $caseRoot | Out-Null
    $env:LOCALAPPDATA = $caseRoot
    $global:DockerPreflightTestState.ProcessMode = $Mode
    $global:DockerPreflightTestState.ProbeCount = 0
    $global:DockerPreflightTestState.Starts = 0
    $diskPath = Join-Path $caseRoot 'Docker\wsl\disk'
    New-Item -ItemType Directory -Path $diskPath -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $diskPath 'docker_data.vhdx') -Value 'TEST SENTINEL - NOT A VHDX' | Out-Null
    if (-not $Empty) {
        $runPath = Join-Path $caseRoot 'Docker\run'
        $secretPath = Join-Path $caseRoot 'docker-secrets-engine'
        New-Item -ItemType Directory -Path $runPath, $secretPath | Out-Null
        New-Item -ItemType File -Path (Join-Path $runPath 'preserve.txt') -Value 'KEEP' | Out-Null
        if ($Sockets) {
            # Junctions exercise the real ReparsePoint predicate and directory rename.
            # They do not pretend to reproduce the Windows AF_UNIX driver lock itself.
            $target = Join-Path $caseRoot 'junction-target'
            New-Item -ItemType Directory -Path $target | Out-Null
            New-Item -ItemType File -Path (Join-Path $target 'target.txt') -Value 'KEEP TARGET' | Out-Null
            New-Item -ItemType Junction -Path (Join-Path $runPath 'sailor-ingest.sock') -Target $target | Out-Null
            New-Item -ItemType Junction -Path (Join-Path $secretPath 'engine.sock') -Target $target | Out-Null
        }
    }
    return $caseRoot
}

function Get-Archives { param([string]$CaseRoot) @(Get-ChildItem -LiteralPath (Join-Path $CaseRoot 'Docker') -Directory | Where-Object { $_.Name -like 'run.socket-archive-*' }) }

function Invoke-Fixture {
    param(
        [string]$Case, [string]$Mode, [switch]$Sockets, [switch]$Empty, [switch]$Launch,
        [int]$ExpectStarts = -1, [int]$ExpectMinProbes = 0
    )
    $script:scenarios++
    $caseRoot = New-CaseRoot -Case $Case -Mode $Mode -Sockets:$Sockets -Empty:$Empty
    $runPath = Join-Path $caseRoot 'Docker\run'
    $diskFile = Join-Path $caseRoot 'Docker\wsl\disk\docker_data.vhdx'
    $diskHash = (Get-FileHash -LiteralPath $diskFile).Hash
    & $ScriptPath -StartDesktop:$Launch
    if ($ExpectStarts -lt 0) { $ExpectStarts = 0; if ($Launch) { $ExpectStarts = 1 } }
    Assert-True ($global:DockerPreflightTestState.Starts -eq $ExpectStarts) "$Case launch count ($($global:DockerPreflightTestState.Starts) vs $ExpectStarts)"
    Assert-True ($global:DockerPreflightTestState.ProbeCount -ge $ExpectMinProbes) "$Case reached probe $ExpectMinProbes (got $($global:DockerPreflightTestState.ProbeCount))"
    Assert-True ((Get-FileHash -LiteralPath $diskFile).Hash -eq $diskHash) "$Case preserves data sentinel"
    $archives = @(Get-Archives -CaseRoot $caseRoot)
    if ($Sockets -and $Mode -eq 'stopped') {
        Assert-True ($archives.Count -eq 1) "$Case archives runtime directory"
        Assert-True (-not (Test-Path -LiteralPath $runPath)) "$Case vacates runtime path"
        Assert-True ((Get-Content -LiteralPath (Join-Path $archives[0].FullName 'preserve.txt') -Raw -Encoding UTF8) -eq 'KEEP') "$Case preserves ordinary files"
        $secretArchives = @(Get-ChildItem -LiteralPath $caseRoot -Directory | Where-Object { $_.Name -like 'docker-secrets-engine.socket-archive-*' })
        Assert-True ($secretArchives.Count -eq 1) "$Case archives secrets runtime"
        Assert-True ((Get-Content -LiteralPath (Join-Path $caseRoot 'junction-target\target.txt') -Raw -Encoding UTF8) -eq 'KEEP TARGET') "$Case preserves junction target"
        & $ScriptPath
        Assert-True (@(Get-Archives -CaseRoot $caseRoot).Count -eq 1) "$Case is idempotent"
    } else {
        Assert-True ($archives.Count -eq 0) "$Case does not quarantine"
        if (-not $Empty) { Assert-True (Test-Path -LiteralPath $runPath) "$Case preserves runtime directory" }
    }
    Write-Output "PASS: $Case"
}

try {
    Invoke-Fixture -Case 'missing-runtime' -Mode stopped -Empty
    Invoke-Fixture -Case 'ordinary-files' -Mode stopped
    # Docker already active must suppress -StartDesktop: launching again was
    # tried live (critic review 2026-09-07 M2's suggestion) and reverted - it
    # left a real, resident second Docker Desktop process (~130MB, not a
    # transient handoff), not a harmless focus-existing-window no-op.
    Invoke-Fixture -Case 'already-running-launch' -Mode active -Sockets -Launch -ExpectStarts 0
    Invoke-Fixture -Case 'process-starts-during-check' -Mode starts-during-check -Sockets -ExpectMinProbes ($N + 1)
    Invoke-Fixture -Case 'preflight-rollback-after-rename' -Mode starts-after-rename -Sockets -ExpectMinProbes (2 * $N + 1)
    Invoke-Fixture -Case 'stale-reparse-points' -Mode stopped -Sockets
    Invoke-Fixture -Case 'safe-launch' -Mode stopped -Sockets -Launch

    Write-Output ("PASS: all {0} scenarios; PowerShell {1}" -f $script:scenarios, $PSVersionTable.PSVersion)
} finally {
    $env:LOCALAPPDATA = $originalLocalAppData
    # Preserve fixtures for inspection; no recursive cleanup through junctions.
    Write-Output "Fixtures retained: $testRoot"
}
