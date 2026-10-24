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
    Invoke-SafeGitCapture    arbitrary git QUERY command, output captured under EAP=Continue

  Self-tests:
    powershell -ExecutionPolicy Bypass -File scripts\lib\git-safe-ops.ps1 -SelfTest

  History:
    2026-05-28  Phase Z: Invoke-GitFetchWithRetry created in git-align-main-aoresume-feature.ps1
    2026-05-30  Phase C: canonical lib extracted here; ao-close.ps1 line 265 (bare git fetch)
                and line 481 (bare git push) now use this lib via dot-source.
#>

param([switch]$SelfTest)

# CP950 protection. SSOT for the wrapper: scripts/_console-encoding-helpers.ps1.
# Every git call in this file captures stdout. On a Big5 console [Console]::OutputEncoding
# decodes those bytes as CP950, which mangles UTF-8: CJK turns to garbage AND a multi-byte
# sequence can swallow a newline, silently merging two output lines into one (the original
# 2026-05-22 backfill-missed-daily.ps1 break). The sharpest case here is ao-close.ps1's
# `Invoke-SafeGitCapture @('diff','--cached','-U0')`, whose captured CJK diff content is
# matched against `(?m)^\+<<<<<<< ` -- a merged line breaks that anchor, so a real conflict
# marker would pass the AO-CLOSE gate unnoticed (detector silently disarmed).
# This file is the documented SSOT for safe git invocation, so the wrapper belongs HERE:
# every caller routed through Invoke-SafeGit* inherits the protection instead of each one
# re-deriving it. Companion audit: scripts/audit-cp950-traps.ps1.
# $PSScriptRoot is THIS file's directory (scripts/lib) even when dot-sourced by a caller in
# scripts/ or hooks/ -- verified 2026-08-25. MyInvocation fallback mirrors audit-cp950-traps.ps1
# for the piped / Invoke-Expression case where $PSScriptRoot is empty.
$gsoLibDir = if ($PSScriptRoot) { $PSScriptRoot }
             elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path }
             else { (Get-Location).Path }
. (Join-Path $gsoLibDir '..\_console-encoding-helpers.ps1')

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
        $existing = $null
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

        # lastFetch survives any number of pushes (the 20-entry history is shared by both ops): the health gate's
        # fetch recency (scripts/lib/fetch-recency-gate.ps1) reads it first.
        $lastFetch = $null
        if ($Op -eq 'fetch') { $lastFetch = $entry }
        elseif ($existing -and $existing.PSObject.Properties.Name -contains 'lastFetch') { $lastFetch = $existing.lastFetch }

        $payload = [pscustomobject]@{
            schemaVersion = 1
            lastOp        = $entry
            lastFetch     = $lastFetch
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
                Invoke-WithUtf8Console { & git @gitArgs 2>&1 } | Out-Host
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
            try { $Branch = (Invoke-WithUtf8Console { & git rev-parse --abbrev-ref HEAD 2>&1 }).Trim() }
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
            Invoke-WithUtf8Console { & git @gitArgs 2>&1 } | Out-Host
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
# Invoke-SafeGitCapture — arbitrary git QUERY command, output captured safely
# ---------------------------------------------------------------------------
# For commands whose stdout the caller must parse (status --porcelain, rev-list
# --count, rev-parse, show-ref, merge-base, branch --show-current, diff). Same
# PS5.1 footgun as fetch/push: under $ErrorActionPreference='Stop', ANY stderr
# line from git (warnings like "LF will be replaced by CRLF", informational refs)
# is raised as a terminating NativeCommandError BEFORE $LASTEXITCODE is checked.
# This wrapper scopes EAP='Continue' around the call so stderr is captured, never
# fatal; the caller inspects .ExitCode for real success/failure.
#
# Returns: [pscustomobject]@{ Output = <string[]>; Text = <string>; ExitCode = <int> }
#   Output : each line of merged stdout+stderr (array; @() when empty)
#   Text   : Output joined with "`n" (convenience for single-value parses)
#   ExitCode: $LASTEXITCODE (0 when git did not set it)
#
# Use for QUERY commands only. For network ops use Invoke-SafeGitFetch /
# Invoke-SafeGitPush (they add retry + ledger). For state-changing local commands
# whose output you discard (rebase --abort, add, checkout), the same EAP wrap
# applies — pass them here and ignore .Output.
function Invoke-SafeGitCapture {
    param(
        [Parameter(Mandatory = $true)][string[]] $GitArgs,
        [string] $WorkRoot
    )
    $pushed = $false
    if ($WorkRoot) { Push-Location -LiteralPath $WorkRoot; $pushed = $true }
    try {
        $savedEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $out  = Invoke-WithUtf8Console { & git @GitArgs 2>&1 }
            $code = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
        } finally {
            $ErrorActionPreference = $savedEAP
        }
    } finally {
        if ($pushed) { Pop-Location | Out-Null }
    }
    $arr = @($out | ForEach-Object { [string]$_ })
    return [pscustomobject]@{
        Output   = $arr
        Text     = ($arr -join "`n")
        ExitCode = $code
    }
}

# ---------------------------------------------------------------------------
# Get-StaleSharedIndexPaths -- index != HEAD while worktree == HEAD
# ---------------------------------------------------------------------------
# HEAD moved by a commit that bypassed the shared index (private-index commit with no post-commit
# sync, e.g. a host without the scope-guard hook), so the index still holds the old blob / lacks
# the new file. A bare commit then reverts or deletes those paths (2026-10-16: 39 entries).
# Report only: a deliberate `git rm --cached` has the same shape, so nothing is reset here.
function Get-StaleSharedIndexPaths {
    param([Parameter(Mandatory = $true)] [string]$WorkRoot)
    $rec = @((Invoke-WithUtf8Console { & git -C $WorkRoot -c core.quotepath=false diff --cached --name-status --no-renames -z 2>$null }) -join '' -split "`0")
    if ($rec.Count -lt 2) { return @() }
    $vsHead = New-Object System.Collections.Generic.HashSet[string] ([StringComparer]::Ordinal)
    foreach ($p in ((Invoke-WithUtf8Console { & git -C $WorkRoot -c core.quotepath=false diff HEAD --name-only --no-renames -z 2>$null }) -join '' -split "`0")) { if ($p) { [void]$vsHead.Add($p) } }
    $stale = @()
    for ($i = 0; $i + 1 -lt $rec.Count; $i += 2) {
        $st = $rec[$i]; $p = $rec[$i + 1]
        if (-not $p) { continue }
        if ($st -eq 'D') {
            # Missing from the index, so `diff HEAD` calls it deleted even when the file is on disk: compare bytes.
            $f = Join-Path $WorkRoot $p
            if ((Test-Path -LiteralPath $f -PathType Leaf) -and
                ((Invoke-WithUtf8Console { & git -C $WorkRoot hash-object -- $p 2>$null }) -eq (Invoke-WithUtf8Console { & git -C $WorkRoot rev-parse --verify -q "HEAD:$p" 2>$null }))) { $stale += $p }
        } elseif (-not $vsHead.Contains($p)) { $stale += $p }
    }
    return $stale
}

# ---------------------------------------------------------------------------
# Invoke-SharedWorktreeParity -- fetch + fast-forward-only mainline parity
# ---------------------------------------------------------------------------
# Invariant (2026-09-23, AO-RESUME churn incident): an AUTOMATIC parity step must never
# move uncommitted work out of a worktree that other sessions may be editing. So this
# function only ever does two things: `git fetch origin` and, when HEAD is strictly
# behind <Remote>/<Branch> while on <Branch>, `git merge --ff-only`. git itself refuses
# the fast-forward when it would touch a locally modified tracked file (or an untracked
# file it would create). Since 2026-10-22 such files are carried forward by a clean 3-way
# merge (scripts/git-parity-merge.py); a conflict is REPORTED and nothing is touched. No stash,
# no checkout, no reset, no push. Every other state (ahead, diverged, not on the
# branch, refused) is returned for the caller to print and for AO-CLOSE / the operator
# to resolve. Before this, ao-resume.ps1 always ran git-align -AllowStash: 217 reflog
# entries and 49 stash/pop cycles in 20 minutes with 8 sessions sharing D:\Work, and
# 8 stashes that were never restored.
#
# Returns [pscustomobject] Action / Ahead / Behind / Branch / TrackedDirty / Ok / Message
#   Action : up-to-date | fast-forward | ahead | diverged | ff-refused | not-on-branch | fetch-failed
#   Ok     : $true when no pull is pending after the call (up-to-date, ahead, fast-forward)
#   TrackedDirty : count of `git status --porcelain --untracked-files=no` lines (info only)
function Invoke-SharedWorktreeParity {
    param(
        [Parameter(Mandatory = $true)][string] $WorkRoot,
        [string] $Remote = 'origin',
        [string] $Branch = 'main',
        [switch] $SkipFetch,
        [int]    $FetchMaxAttempts = 3
    )
    $r = [ordered]@{
        Action = ''; Ahead = 0; Behind = 0; Branch = ''; TrackedDirty = 0; Ok = $false; Message = ''
    }
    if (-not $SkipFetch) {
        try {
            Invoke-SafeGitFetch -WorkRoot $WorkRoot -Prune -MaxAttempts $FetchMaxAttempts
        } catch {
            $r.Action = 'fetch-failed'; $r.Message = [string]$_
            return [pscustomobject]$r
        }
    }
    $cur = Invoke-SafeGitCapture -GitArgs @('rev-parse', '--abbrev-ref', 'HEAD') -WorkRoot $WorkRoot
    $r.Branch = $cur.Text.Trim()
    $dirty = Invoke-SafeGitCapture -GitArgs @('status', '--porcelain', '--untracked-files=no') -WorkRoot $WorkRoot
    $r.TrackedDirty = @($dirty.Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count

    $lr = Invoke-SafeGitCapture -GitArgs @('rev-list', '--left-right', '--count', "$Remote/$Branch...HEAD") -WorkRoot $WorkRoot
    $lrText = $lr.Text.Trim()
    if ($lr.ExitCode -eq 0 -and $lrText -match '^(\d+)\s+(\d+)$') {
        $r.Behind = [int]$Matches[1]; $r.Ahead = [int]$Matches[2]
    } else {
        $r.Action = 'fetch-failed'
        $r.Message = "cannot compare HEAD with $Remote/$Branch : $lrText"
        return [pscustomobject]$r
    }

    if ($r.Branch -ne $Branch) {
        $r.Action = 'not-on-branch'
        $r.Message = "on '$($r.Branch)', not '$Branch'; nothing touched (ahead $($r.Ahead), behind $($r.Behind) vs $Remote/$Branch)"
    } elseif ($r.Behind -eq 0) {
        if ($r.Ahead -gt 0) {
            $r.Action = 'ahead'
            $r.Message = "$($r.Ahead) local commit(s) not on $Remote/$Branch; push at AO-CLOSE (nothing touched)"
        } else {
            $r.Action = 'up-to-date'
            $r.Message = "HEAD == $Remote/$Branch"
        }
        $r.Ok = $true
    } elseif ($r.Ahead -gt 0) {
        $r.Action = 'diverged'
        $r.Message = "ahead $($r.Ahead) / behind $($r.Behind) vs $Remote/$Branch; resolve at AO-CLOSE (git pull --rebase); nothing touched"
    } else {
        $ff = Invoke-SafeGitCapture -GitArgs @('merge', '--ff-only', "$Remote/$Branch") -WorkRoot $WorkRoot
        if ($ff.ExitCode -eq 0) {
            $r.Action = 'fast-forward'; $r.Ok = $true
            $r.Message = "fast-forwarded $($r.Behind) commit(s) to $Remote/$Branch"
        } else {
            # A local edit in a file origin also changed: carry it forward when it merges cleanly, else touch
            # nothing (scripts/git-parity-merge.py). Without this the shared checkout never caught up.
            $carry = $null
            $py = Get-Command python -ErrorAction SilentlyContinue
            $script = Join-Path $PSScriptRoot '..\git-parity-merge.py'
            if ($py -and (Test-Path -LiteralPath $script)) {
                $out = @(& $py.Source $script --root $WorkRoot --target "$Remote/$Branch" 2>$null)
                try { $carry = ($out | Select-Object -Last 1) | ConvertFrom-Json } catch { $carry = $null }
            }
            if ($carry -and $carry.ok) {
                $r.Action = 'fast-forward'; $r.Ok = $true
                $r.Message = "fast-forwarded $($r.Behind) commit(s) to $Remote/$Branch; $($carry.message): $(@($carry.files) -join ', ')"
            } else {
                $r.Action = 'ff-refused'
                $why = if ($carry) { $carry.message } else { 'merge helper unavailable' }
                $r.Message = "git refused the fast-forward and the local edits cannot be carried ($why); nothing touched. git: " + (($ff.Output | Where-Object { $_ }) -join ' | ')
            }
        }
    }
    return [pscustomobject]$r
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
    $d = Get-Content $lp -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-Eq "T2: lastOp.op"              $d.lastOp.op      'fetch'
    Assert-Eq "T2: lastOp.success"         $d.lastOp.success  $true
    Assert-Eq "T2: history.Count"          $d.history.Count   1

    Write-GitNetworkLedger -Op 'push' -Success $false -Attempts 3 -ExitCode 1 `
        -ErrorText 'auth failure' -StartUtc ([DateTime]::UtcNow) -WorkRoot $tmpRoot
    $d2 = Get-Content $lp -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-Eq "T3: lastOp.op after push"   $d2.lastOp.op      'push'
    Assert-Eq "T3: history.Count after 2"  $d2.history.Count   2

    $fakeLock = Join-Path $tmpRoot ".git\refs\remotes\origin\main.lock"
    [System.IO.File]::WriteAllText($fakeLock, 'deadbeef')
    Assert-Eq "T4: lock exists before"   (Test-Path $fakeLock) $true
    if (Test-Path -LiteralPath $fakeLock) { Remove-Item -LiteralPath $fakeLock -Force }
    Assert-Eq "T4: lock removed after"   (Test-Path $fakeLock) $false

    # T5: Invoke-SafeGitCapture shape + exit-code on a real throwaway repo.
    # Proves the EAP wrap returns Output/Text/ExitCode without throwing on git stderr.
    $gitRepo = Join-Path $env:TEMP "gso-capture-$(Get-Date -Format 'HHmmssfff')"
    New-Item -ItemType Directory -Path $gitRepo -Force | Out-Null
    # Dogfood the helper for repo setup (also keeps lint-git-eap-safety.ps1 clean).
    Invoke-SafeGitCapture -GitArgs @('init', '-b', 'main', $gitRepo) | Out-Null
    Set-Content -Path (Join-Path $gitRepo 'f.txt') -Value 'x' -Encoding UTF8
    Invoke-SafeGitCapture -GitArgs @('add', '-A') -WorkRoot $gitRepo | Out-Null
    Invoke-SafeGitCapture -GitArgs @('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'init') -WorkRoot $gitRepo | Out-Null
    $cap = Invoke-SafeGitCapture -GitArgs @('rev-parse', 'HEAD') -WorkRoot $gitRepo
    Assert-Eq "T5: capture ExitCode 0"      $cap.ExitCode 0
    Assert-Eq "T5: capture Output is array" ($cap.Output -is [array]) $true
    Assert-Eq "T5: Text is 40-char sha"     ($cap.Text.Trim().Length) 40
    # bad ref → non-zero exit, no throw
    $capBad = Invoke-SafeGitCapture -GitArgs @('rev-parse', 'no-such-ref-xyz') -WorkRoot $gitRepo
    Assert-Eq "T5: bad ref ExitCode != 0"   ($capBad.ExitCode -ne 0) $true
    Remove-Item -Recurse -Force $gitRepo -ErrorAction SilentlyContinue

    Remove-Item -Recurse -Force $tmpRoot -ErrorAction SilentlyContinue

    Write-Host ""
    $color = if ($fail -eq 0) { 'Green' } else { 'Red' }
    Write-Host ("=== Results: $pass passed, $fail failed ===") -ForegroundColor $color
    exit $(if ($fail -gt 0) { 1 } else { 0 })
}
