[CmdletBinding()]
param(
    [string]$ScriptPath,
    [string]$WatchScriptPath
)

# Run with Windows PowerShell 5.1, the same host as the scheduled tasks.
# Process discovery, named-pipe discovery and Desktop launch are simulated via
# function shadows visible to the child scripts. Detection, junctions,
# renames, watchdog state files and the Run-key check use the real filesystem
# / registry under a unique temporary LOCALAPPDATA and a sandbox HKCU key.
# No Docker calls; the real HKCU Run key is never touched.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ScriptPath) { $ScriptPath = Join-Path $PSScriptRoot 'docker-desktop-runtime-preflight.ps1' }
if (-not $WatchScriptPath) { $WatchScriptPath = Join-Path $PSScriptRoot 'watch-docker-desktop-runtime.ps1' }
$ScriptPath = (Resolve-Path -LiteralPath $ScriptPath).Path
$WatchScriptPath = (Resolve-Path -LiteralPath $WatchScriptPath).Path
. (Join-Path (Split-Path -Parent $ScriptPath) 'docker-desktop-runtime-common.ps1')
$N = $script:DockerActiveProcessNames.Count

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('docker-preflight-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$sandboxRunRoot = 'HKCU:\Software\DockerWatchdogTest'
$sandboxRunKey = Join-Path $sandboxRunRoot ([guid]::NewGuid().ToString('N'))
New-Item -Path $sandboxRunKey -Force | Out-Null
$originalLocalAppData = $env:LOCALAPPDATA
$global:DockerPreflightTestState = @{ ProbeCount = 0; ProcessMode = 'stopped'; Starts = 0; LaunchThrows = $false }
$script:scenarios = 0

# --- shadows (dynamic scoping: the child scripts resolve these first) -------
function Start-Process {
    [CmdletBinding()]
    param([string]$FilePath, [string]$WindowStyle)
    Assert-True ($FilePath -eq (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')) 'launch target is Docker Desktop'
    $run = Join-Path $env:LOCALAPPDATA 'Docker\run'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $run 'sailor-ingest.sock'))) 'launch occurs after quarantine'
    if ($global:DockerPreflightTestState.LaunchThrows) { throw 'simulated Start-Process failure' }
    $global:DockerPreflightTestState.Starts++
}

function Get-DockerNamedPipes { @() }

# Probe thresholds are multiples of the process-name count N (one full
# liveness check = N probes while stopped), so they track the list length:
#   starts-during-check   : active from probe N+1  (inside the loop's recheck)
#   starts-after-rename   : active from probe 2N+1 (the post-rename check)
#   starts-after-preflight: active from probe 5N+1 (watchdog's own check, after
#                           both directories were quarantined: N + 2x(N+N))
function Get-Process {
    [CmdletBinding()]
    param([string]$Name)
    $s = $global:DockerPreflightTestState
    $s.ProbeCount++
    $threshold = switch ($s.ProcessMode) {
        'starts-during-check'    { $N }
        'starts-after-rename'    { 2 * $N }
        'starts-after-preflight' { 5 * $N }
        default                  { [int]::MaxValue }
    }
    if ($s.ProcessMode -eq 'active' -or $s.ProbeCount -gt $threshold) {
        [pscustomobject]@{ ProcessName = $Name; Id = 123 }
    }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "FAIL: $Message" }
}

function Get-WatchdogLog {
    param([string]$CaseRoot)
    $p = Join-Path $CaseRoot 'Docker\watchdog.log'
    if (Test-Path -LiteralPath $p) { Get-Content -LiteralPath $p -Encoding UTF8 } else { @() }
}

function Assert-Log {
    param([string]$Case, [string]$CaseRoot, [string[]]$Expect = @(), [string[]]$Forbid = @())
    $log = @(Get-WatchdogLog -CaseRoot $CaseRoot)
    foreach ($p in $Expect) { Assert-True (@($log | Where-Object { $_ -like "*$p*" }).Count -ge 1) "$Case log contains '$p'" }
    foreach ($p in $Forbid) { Assert-True (@($log | Where-Object { $_ -like "*$p*" }).Count -eq 0) "$Case log must not contain '$p'" }
}

function New-CaseRoot {
    param([string]$Case, [string]$Mode, [switch]$Sockets, [switch]$Empty)
    $caseRoot = Join-Path $testRoot $Case
    New-Item -ItemType Directory -Path $caseRoot | Out-Null
    $env:LOCALAPPDATA = $caseRoot
    $global:DockerPreflightTestState.ProcessMode = $Mode
    $global:DockerPreflightTestState.ProbeCount = 0
    $global:DockerPreflightTestState.Starts = 0
    $global:DockerPreflightTestState.LaunchThrows = $false
    $diskPath = Join-Path $caseRoot 'Docker\wsl\disk'
    New-Item -ItemType Directory -Path $diskPath -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $diskPath 'docker_data.vhdx') -Value 'TEST SENTINEL - NOT A VHDX' | Out-Null
    if (-not $Empty) { New-RuntimeDirs -CaseRoot $caseRoot -Sockets:$Sockets }
    return $caseRoot
}

function New-RuntimeDirs {
    param([string]$CaseRoot, [switch]$Sockets)
    $runPath = Join-Path $CaseRoot 'Docker\run'
    $secretPath = Join-Path $CaseRoot 'docker-secrets-engine'
    New-Item -ItemType Directory -Path $runPath, $secretPath | Out-Null
    New-Item -ItemType File -Path (Join-Path $runPath 'preserve.txt') -Value 'KEEP' | Out-Null
    if ($Sockets) {
        # Junctions exercise the real ReparsePoint predicate and directory rename.
        # They do not pretend to reproduce the Windows AF_UNIX driver lock itself.
        $target = Join-Path $CaseRoot 'junction-target'
        if (-not (Test-Path -LiteralPath $target)) {
            New-Item -ItemType Directory -Path $target | Out-Null
            New-Item -ItemType File -Path (Join-Path $target 'target.txt') -Value 'KEEP TARGET' | Out-Null
        }
        New-Item -ItemType Junction -Path (Join-Path $runPath 'sailor-ingest.sock') -Target $target | Out-Null
        New-Item -ItemType Junction -Path (Join-Path $secretPath 'engine.sock') -Target $target | Out-Null
    }
}

function Get-Archives { param([string]$CaseRoot) @(Get-ChildItem -LiteralPath (Join-Path $CaseRoot 'Docker') -Directory | Where-Object { $_.Name -like 'run.socket-archive-*' }) }

# Extra switches are splatted from a hashtable: a string array would bind
# '-NoRelaunch' positionally to [int]$PollSeconds.
function Invoke-Watchdog { param([hashtable]$Extra = @{}) & $WatchScriptPath -Once -RunKeyPath $sandboxRunKey @Extra | Out-Null }

function Invoke-Fixture {
    param(
        [string]$Case, [string]$Mode, [switch]$Sockets, [switch]$Empty, [switch]$Launch, [switch]$Watchdog,
        [int]$ExpectStarts = -1, [int]$ExpectMinProbes = 0, [scriptblock]$Seed, [string[]]$ExpectLog = @(), [string[]]$ForbidLog = @(), [hashtable]$WatchArgs = @{}
    )
    $script:scenarios++
    $caseRoot = New-CaseRoot -Case $Case -Mode $Mode -Sockets:$Sockets -Empty:$Empty
    $runPath = Join-Path $caseRoot 'Docker\run'
    $diskFile = Join-Path $caseRoot 'Docker\wsl\disk\docker_data.vhdx'
    $diskHash = (Get-FileHash -LiteralPath $diskFile).Hash
    if ($Seed) { & $Seed $caseRoot }
    if ($Watchdog) { Invoke-Watchdog -Extra $WatchArgs } else { & $ScriptPath -StartDesktop:$Launch }
    if ($ExpectStarts -lt 0) { $ExpectStarts = 0; if ($Launch -and $Mode -eq 'stopped') { $ExpectStarts = 1 } }
    Assert-True ($global:DockerPreflightTestState.Starts -eq $ExpectStarts) "$Case launch count ($($global:DockerPreflightTestState.Starts) vs $ExpectStarts)"
    Assert-True ($global:DockerPreflightTestState.ProbeCount -ge $ExpectMinProbes) "$Case reached probe $ExpectMinProbes (got $($global:DockerPreflightTestState.ProbeCount))"
    Assert-True ((Get-FileHash -LiteralPath $diskFile).Hash -eq $diskHash) "$Case preserves data sentinel"
    $archives = @(Get-Archives -CaseRoot $caseRoot)
    if ($Sockets -and ($Mode -eq 'stopped' -or $Mode -eq 'starts-after-preflight')) {
        Assert-True ($archives.Count -eq 1) "$Case archives runtime directory"
        Assert-True (-not (Test-Path -LiteralPath $runPath)) "$Case vacates runtime path"
        Assert-True ((Get-Content -LiteralPath (Join-Path $archives[0].FullName 'preserve.txt') -Raw -Encoding UTF8) -eq 'KEEP') "$Case preserves ordinary files"
        $secretArchives = @(Get-ChildItem -LiteralPath $caseRoot -Directory | Where-Object { $_.Name -like 'docker-secrets-engine.socket-archive-*' })
        Assert-True ($secretArchives.Count -eq 1) "$Case archives secrets runtime"
        Assert-True ((Get-Content -LiteralPath (Join-Path $caseRoot 'junction-target\target.txt') -Raw -Encoding UTF8) -eq 'KEEP TARGET') "$Case preserves junction target"
        if ($Mode -eq 'stopped') {
            & $ScriptPath
            Assert-True (@(Get-Archives -CaseRoot $caseRoot).Count -eq 1) "$Case is idempotent"
        }
    } else {
        Assert-True ($archives.Count -eq 0) "$Case does not quarantine"
        if (-not $Empty) { Assert-True (Test-Path -LiteralPath $runPath) "$Case preserves runtime directory" }
    }
    if ($Watchdog) {
        Assert-True (Test-Path -LiteralPath (Join-Path $caseRoot 'Docker\watchdog.heartbeat')) "$Case writes heartbeat"
        Assert-Log -Case $Case -CaseRoot $caseRoot -Expect $ExpectLog -Forbid $ForbidLog
    }
    Write-Output "PASS: $Case"
}

function Set-StampAge { param([string]$CaseRoot, [int]$MinutesAgo)
    $d = Join-Path $CaseRoot 'Docker'; New-Item -ItemType Directory -Path $d -Force | Out-Null
    $f = Join-Path $d 'watchdog-last-relaunch.txt'
    [IO.File]::WriteAllText($f, 'seeded', (New-Object System.Text.UTF8Encoding($false)))
    (Get-Item -LiteralPath $f).LastWriteTime = (Get-Date).AddMinutes(-$MinutesAgo)
}

try {
    # Preflight
    Invoke-Fixture -Case 'missing-runtime' -Mode stopped -Empty
    Invoke-Fixture -Case 'ordinary-files' -Mode stopped
    Invoke-Fixture -Case 'active-process' -Mode active -Sockets
    Invoke-Fixture -Case 'process-starts-during-check' -Mode starts-during-check -Sockets -ExpectMinProbes ($N + 1)
    Invoke-Fixture -Case 'preflight-rollback-after-rename' -Mode starts-after-rename -Sockets -ExpectMinProbes (2 * $N + 1)
    Invoke-Fixture -Case 'stale-reparse-points' -Mode stopped -Sockets
    Invoke-Fixture -Case 'safe-launch' -Mode stopped -Sockets -Launch
    Invoke-Fixture -Case 'already-running-launch' -Mode active -Sockets -Launch

    # Watchdog reconcile pass (one-shot, as the scheduled task runs it)
    Invoke-Fixture -Case 'watchdog-recovery-relaunches' -Mode stopped -Sockets -Watchdog -ExpectStarts 1 -ExpectLog 'QUARANTINED:', 'RELAUNCHED:'
    Invoke-Fixture -Case 'watchdog-active-noop' -Mode active -Sockets -Watchdog -ForbidLog 'QUARANTINED:', 'RELAUNCHED:'
    Invoke-Fixture -Case 'watchdog-clean-stop-no-relaunch' -Mode stopped -Watchdog -ForbidLog 'RELAUNCHED:'
    Invoke-Fixture -Case 'watchdog-cooldown' -Mode stopped -Sockets -Watchdog -ExpectStarts 0 -ExpectLog 'SKIP-RELAUNCH: cooldown' -Seed { param($r) Set-StampAge -CaseRoot $r -MinutesAgo 0 }
    Invoke-Fixture -Case 'watchdog-cooldown-expired' -Mode stopped -Sockets -Watchdog -ExpectStarts 1 -ExpectLog 'RELAUNCHED:' -Seed { param($r) Set-StampAge -CaseRoot $r -MinutesAgo 11 }
    Invoke-Fixture -Case 'watchdog-corrupt-stamp-still-relaunches' -Mode stopped -Sockets -Watchdog -ExpectStarts 1 -ExpectLog 'RELAUNCHED:' -Seed {
        param($r) $d = Join-Path $r 'Docker'; New-Item -ItemType Directory -Path $d -Force | Out-Null
        $f = Join-Path $d 'watchdog-last-relaunch.txt'; [IO.File]::WriteAllText($f, '', (New-Object System.Text.UTF8Encoding($false)))
        (Get-Item -LiteralPath $f).LastWriteTime = (Get-Date).AddMinutes(-11)
    }
    Invoke-Fixture -Case 'watchdog-paused' -Mode stopped -Sockets -Watchdog -ExpectStarts 0 -ExpectLog 'SKIP-RELAUNCH:', 'watchdog.paused' -Seed {
        param($r) $d = Join-Path $r 'Docker'; New-Item -ItemType Directory -Path $d -Force | Out-Null; New-Item -ItemType File -Path (Join-Path $d 'watchdog.paused') | Out-Null
    }
    Invoke-Fixture -Case 'watchdog-norelaunch-switch' -Mode stopped -Sockets -Watchdog -ExpectStarts 0 -ExpectLog 'SKIP-RELAUNCH: -NoRelaunch' -WatchArgs @{ NoRelaunch = $true }
    Invoke-Fixture -Case 'watchdog-race-active-after-quarantine' -Mode starts-after-preflight -Sockets -Watchdog -ExpectStarts 0 -ExpectMinProbes (5 * $N + 1) -ExpectLog 'QUARANTINED:', 'RECOVERED:' -ForbidLog 'RELAUNCHED:'

    # Two crash cycles: the production stamp write must engage the cooldown on
    # the second cycle and release it once it ages (write->read contract).
    $script:scenarios++
    $root = New-CaseRoot -Case 'watchdog-two-crashes' -Mode stopped -Sockets
    Invoke-Watchdog
    Assert-True ($global:DockerPreflightTestState.Starts -eq 1) 'two-crashes: first cycle relaunches'
    Assert-True (Test-Path -LiteralPath (Join-Path $root 'Docker\watchdog.relaunch-pending')) 'two-crashes: pending marker set'
    New-RuntimeDirs -CaseRoot $root -Sockets
    Invoke-Watchdog
    Assert-True ($global:DockerPreflightTestState.Starts -eq 1) 'two-crashes: second cycle inside cooldown does not relaunch'
    Assert-True (@(Get-Archives -CaseRoot $root).Count -eq 2) 'two-crashes: second cycle still quarantines'
    Assert-Log -Case 'two-crashes' -CaseRoot $root -Expect 'SKIP-RELAUNCH: cooldown'
    (Get-Item -LiteralPath (Join-Path $root 'Docker\watchdog-last-relaunch.txt')).LastWriteTime = (Get-Date).AddMinutes(-11)
    Invoke-Watchdog
    Assert-True ($global:DockerPreflightTestState.Starts -eq 2) 'two-crashes: pending relaunch retried after cooldown even with nothing new to quarantine'
    Write-Output 'PASS: watchdog-two-crashes'

    # A failed launch is logged, keeps the pending marker, fails the task
    # run, and is retried on a later pass.
    $script:scenarios++
    $root = New-CaseRoot -Case 'watchdog-relaunch-failed-then-retried' -Mode stopped -Sockets
    $global:DockerPreflightTestState.LaunchThrows = $true
    $threw = $false
    try { Invoke-Watchdog } catch { $threw = $true }
    Assert-True $threw 'relaunch-failed: pass reports failure (non-zero task result)'
    Assert-True ($global:DockerPreflightTestState.Starts -eq 0) 'relaunch-failed: no launch counted'
    Assert-True (Test-Path -LiteralPath (Join-Path $root 'Docker\watchdog.relaunch-pending')) 'relaunch-failed: pending marker kept'
    Assert-Log -Case 'relaunch-failed' -CaseRoot $root -Expect 'RELAUNCH-FAILED: simulated Start-Process failure'
    $global:DockerPreflightTestState.LaunchThrows = $false
    (Get-Item -LiteralPath (Join-Path $root 'Docker\watchdog-last-relaunch.txt')).LastWriteTime = (Get-Date).AddMinutes(-11)
    Invoke-Watchdog
    Assert-True ($global:DockerPreflightTestState.Starts -eq 1) 'relaunch-failed: retried once cooldown expired'
    Assert-Log -Case 'relaunch-failed' -CaseRoot $root -Expect 'RELAUNCHED:'
    Write-Output 'PASS: watchdog-relaunch-failed-then-retried'

    # Registry hygiene runs LAST and cannot block recovery; sandbox key only.
    New-ItemProperty -Path $sandboxRunKey -Name 'Docker Desktop' -Value 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -PropertyType String -Force | Out-Null
    Invoke-Fixture -Case 'watchdog-removes-bypass-runkey' -Mode active -Watchdog -ExpectLog 'RUNKEY-REMOVED:'
    $remaining = Get-ItemProperty -LiteralPath $sandboxRunKey -ErrorAction SilentlyContinue
    Assert-True (($null -eq $remaining) -or -not ($remaining.PSObject.Properties.Name -contains 'Docker Desktop')) 'bypass Run value removed'
    Invoke-Fixture -Case 'watchdog-runkey-absent-idempotent' -Mode active -Watchdog -ForbidLog 'RUNKEY-REMOVED:'

    Write-Output ("PASS: all {0} scenarios; PowerShell {1}" -f $script:scenarios, $PSVersionTable.PSVersion)
} finally {
    $env:LOCALAPPDATA = $originalLocalAppData
    Remove-Item -Path $sandboxRunRoot -Recurse -Force -ErrorAction SilentlyContinue
    # Preserve fixtures for inspection; no recursive cleanup through junctions.
    Write-Output "Fixtures retained: $testRoot"
}
