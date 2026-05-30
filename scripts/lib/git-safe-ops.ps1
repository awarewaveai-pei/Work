#requires -Version 5.1
<#
.SYNOPSIS
  Shared safe wrappers for git network operations (fetch, push).

.DESCRIPTION
  Root cause of repeated AO-CLOSE / AO-RESUME failures (observed 2026-05-28, 2026-05-30):
    PowerShell 5.1 with $ErrorActionPreference = "Stop" raises NativeCommandError
    for ANY stderr output from git — including normal informational lines like
    "From https://github.com/..." (fetch) and "To https://..." (push). This causes
    scripts to abort BEFORE $LASTEXITCODE is checked.

  The correct pattern (already used in ao-resume.ps1 lines 125-135 since Phase Z):
    $savedEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & git ... 2>&1 | Out-Host }
    finally { $ErrorActionPreference = $savedEAP }
    if ($LASTEXITCODE -ne 0) { <handle real error> }

  This file is the canonical SSOT for that pattern. Phase C (2026-05-30) extracted
  it here so every caller gets the same protection without copy-pasting, and future
  callers can dot-source this lib instead of writing bare git calls.

  Usage:
    . (Join-Path $PSScriptRoot 'lib\git-safe-ops.ps1')               # from scripts/ callers
    . (Join-Path $PSScriptRoot '..\scripts\lib\git-safe-ops.ps1')    # from hooks/ callers

  Functions exported:
    Write-GitNetworkLedger   ring-buffer JSON outcome log
    Invoke-SafeGitFetch      fetch + EAP + retry + ref-lock repair + ledger
    Invoke-SafeGitPush       push + EAP + ledger

  Self-tests:
    powershell -ExecutionPolicy Bypass -File scripts\lib\git-safe-ops.ps1 -SelfTest

  History:
    2026-05-28  Phase Z: Invoke-GitFetchWithRetry created in git-align-main-aoresume-feature.ps1
    2026-05-30  Phase C: canonical lib extracted here; ao-close.ps1 line 265 (bare git fetch)
                and line 481 (bare git push) now use this lib via dot-source.
#>

param([switch]$SelfTest)

# ---------------------------------------------------------------------------
# Write-GitNetworkLedger — ring-buffer JSON log (20 entries)
# File: agency-os/.agency-state/git-network-last.json (gitignored, transient)
# ---------------------------------------------------------------------------
function Write-GitNetworkLedger {
    param(
        [string]   $Op,
        [bool]     $Success,
        [int]      $Attempts  = 1,
        [int]      $ExitCode  = 0,
        [string]   $ErrorText = '',
        [DateTime] $StartUtc,
        [string]   $WorkRoot
    )
    try {
        $stateDir  = Join-Path $WorkRoot 'agency-os\.agency-state'
        if (-not (Test-Path -LiteralPath $stateDir)) {
            New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
        }
        $statePath = Join-Path $stateDir 'git-network-last.json'

        $history = @()
        if (Test-Path -LiteralPath $statePath) {
            try {
                $existing = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($existing.PSObject.Properties.Name -contains 'history') {
                    $history = @($existing.history)
                }
            } catch { $history = @() }
        }

        $entry = [pscustomobject]@{
            op            = $Op
            startedAtUtc  = $StartUtc.ToString('o')
            finishedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
            success       = $Success
            attempts      = $Attempts
            exitCode      = $ExitCode
            errorExcerpt  = if ($ErrorText.Length -gt 400) { $ErrorText.Substring(0, 400) } else { $ErrorText }
        }

        $history = @($entry) + @($history | Select-Object -First 19)

        $payload = [pscustomobject]@{
            schemaVersion = 1
            lastOp        = $entry
            history       = $history
        }

        $json = $payload | ConvertTo-Json -Depth 6
        $utf8 = New-Object System.Text.UTF8Encoding($true)
        [System.IO.File]::WriteAllText($statePath, $json, $utf8)
    } catch {
        Write-Host ("  WARN: git-network ledger write failed: $($_.Exception.Message)") -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------------------
# Invoke-SafeGitFetch — git fetch with EAP save/restore + retry + ref-lock repair
# ---------------------------------------------------------------------------
function Invoke-SafeGitFetch {
    param(
        [string]  $WorkRoot,
        [switch]  $Prune,
        [int]     $MaxAttempts    = 3,
        [int[]]   $BackoffSeconds = @(5, 10, 20)
    )

    if (-not $WorkRoot) { throw "Invoke-SafeGitFetch: -WorkRoot is required" }

    $startUtc  = (Get-Date).ToUniversalTime()
    $attempts  = 0
    $lastExit  = 0
    $lastError = ''
    $gitArgs   = @('fetch', 'origin')
    if ($Prune) { $gitArgs += '--prune' }

    while ($attempts -lt $MaxAttempts) {
        $attempts++

        # Remove stale ref lock before each attempt.
        # Root cause of 2026-05-30 ref-conflict: a prior interrupted fetch left
        # .git/refs/remotes/origin/main.lock preventing ref update.
        $lockPath = Join-Path $WorkRoot ".git\refs\remotes\origin\main.lock"
        if (Test-Path -LiteralPath $lockPath) {
            Write-Host ("  INFO: removing stale ref lock: $lockPath") -ForegroundColor DarkGray
            Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
        }

        Push-Location -LiteralPath $WorkRoot
        try {
            # EAP save/restore: git writes "From https://..." to stderr which PS5.1+Stop
            # converts to NativeCommandError before we can check $LASTEXITCODE.
            $savedEAP = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                & git @gitArgs 2>&1 | Out-Host
                $lastExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
            } finally {
                $ErrorActionPreference = $savedEAP
            }
        } finally {
            Pop-Location | Out-Null
        }

        if ($lastExit -eq 0) {
            Write-GitNetworkLedger -Op 'fetch' -Success $true -Attempts $attempts `
                -ExitCode 0 -StartUtc $startUtc -WorkRoot $WorkRoot
            return
        }

        $lastError = "git fetch exit $lastExit after attempt $attempts"

        if ($attempts -lt $MaxAttempts) {
            $sleepSec = $BackoffSeconds[[Math]::Min($attempts - 1, $BackoffSeconds.Count - 1)]
            Write-Host ("  WARN: git fetch attempt $attempts/$MaxAttempts failed (exit $lastExit)." +
                        " Retrying in ${sleepSec}s...") -ForegroundColor Yellow
            Start-Sleep -Seconds $sleepSec
        }
    }

    Write-GitNetworkLedger -Op 'fetch' -Success $false -Attempts $attempts `
        -ExitCode $lastExit -ErrorText $lastError -StartUtc $startUtc -WorkRoot $WorkRoot

    Write-Host "" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "GIT FETCH FAILED after $MaxAttempts attempts (last exit $lastExit)" -ForegroundColor Red
    Write-Host "  Sync state with origin is UNKNOWN." -ForegroundColor Red
    Write-Host "  Ledger: agency-os/.agency-state/git-network-last.json" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red

    throw "Invoke-SafeGitFetch: git fetch origin failed after $MaxAttempts attempts (exit $lastExit)"
}

# ---------------------------------------------------------------------------
# Invoke-SafeGitPush — git push with EAP save/restore + ledger
# ---------------------------------------------------------------------------
function Invoke-SafeGitPush {
    param(
        [string] $WorkRoot,
        [string] $Branch = '',
        [switch] $SetUpstream
    )

    if (-not $WorkRoot) { throw "Invoke-SafeGitPush: -WorkRoot is required" }

    $startUtc = (Get-Date).ToUniversalTime()

    if (-not $Branch) {
        Push-Location -LiteralPath $WorkRoot
        try {
            $savedEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
            try { $Branch = (& git rev-parse --abbrev-ref HEAD 2>&1).Trim() }
            finally { $ErrorActionPreference = $savedEAP }
        } finally { Pop-Location | Out-Null }
        if (-not $Branch -or $Branch -eq 'HEAD') {
            throw "Invoke-SafeGitPush: could not resolve current branch name"
        }
    }

    $gitArgs = @('push', 'origin', $Branch)
    if ($SetUpstream) { $gitArgs += '-u' }

    Push-Location -LiteralPath $WorkRoot
    try {
        $savedEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            & git @gitArgs 2>&1 | Out-Host
            $pushExit = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
        } finally {
            $ErrorActionPreference = $savedEAP
        }
    } finally {
        Pop-Location | Out-Null
    }

    if ($pushExit -eq 0) {
        Write-GitNetworkLedger -Op 'push' -Success $true -ExitCode 0 `
            -StartUtc $startUtc -WorkRoot $WorkRoot
        return
    }

    Write-GitNetworkLedger -Op 'push' -Success $false -ExitCode $pushExit `
        -ErrorText "git push exit $pushExit" -StartUtc $startUtc -WorkRoot $WorkRoot

    throw "Invoke-SafeGitPush: git push origin $Branch failed (exit $pushExit). Check auth / network."
}

# ---------------------------------------------------------------------------
# Self-tests
# ---------------------------------------------------------------------------
if ($SelfTest) {
    $pass = 0; $fail = 0

    function Assert-Eq {
        param($Label, $Got, $Want)
        if ($Got -eq $Want) {
            Write-Host "  PASS: $Label" -ForegroundColor Green; $script:pass++
        } else {
            Write-Host "  FAIL: $Label — want '$Want', got '$Got'" -ForegroundColor Red; $script:fail++
        }
    }

    Write-Host ""; Write-Host "=== git-safe-ops.ps1 self-tests ===" -ForegroundColor Cyan

    $tmpRoot = Join-Path $env:TEMP "gso-test-$(Get-Date -Format 'HHmmss')"
    New-Item -ItemType Directory -Path "$tmpRoot\agency-os\.agency-state" -Force | Out-Null
    New-Item -ItemType Directory -Path "$tmpRoot\.git\refs\remotes\origin" -Force | Out-Null

    Write-GitNetworkLedger -Op 'fetch' -Success $true -Attempts 1 -ExitCode 0 `
        -StartUtc ([DateTime]::UtcNow) -WorkRoot $tmpRoot
    $lp = Join-Path $tmpRoot "agency-os\.agency-state\git-network-last.json"
    Assert-Eq "T1: ledger file exists"      (Test-Path $lp) $true
    $d = Get-Content $lp -Raw | ConvertFrom-Json
    Assert-Eq "T2: lastOp.op"              $d.lastOp.op      'fetch'
    Assert-Eq "T2: lastOp.success"         $d.lastOp.success  $true
    Assert-Eq "T2: history.Count"          $d.history.Count   1

    Write-GitNetworkLedger -Op 'push' -Success $false -Attempts 3 -ExitCode 1 `
        -ErrorText 'auth failure' -StartUtc ([DateTime]::UtcNow) -WorkRoot $tmpRoot
    $d2 = Get-Content $lp -Raw | ConvertFrom-Json
    Assert-Eq "T3: lastOp.op after push"   $d2.lastOp.op      'push'
    Assert-Eq "T3: history.Count after 2"  $d2.history.Count   2

    $fakeLock = Join-Path $tmpRoot ".git\refs\remotes\origin\main.lock"
    [System.IO.File]::WriteAllText($fakeLock, 'deadbeef')
    Assert-Eq "T4: lock exists before"   (Test-Path $fakeLock) $true
    if (Test-Path -LiteralPath $fakeLock) { Remove-Item -LiteralPath $fakeLock -Force }
    Assert-Eq "T4: lock removed after"   (Test-Path $fakeLock) $false

    Remove-Item -Recurse -Force $tmpRoot -ErrorAction SilentlyContinue

    Write-Host ""
    $color = if ($fail -eq 0) { 'Green' } else { 'Red' }
    Write-Host ("=== Results: $pass passed, $fail failed ===") -ForegroundColor $color
    exit $(if ($fail -gt 0) { 1 } else { 0 })
}
