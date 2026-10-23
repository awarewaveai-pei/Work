#requires -Version 5.1
<#
.SYNOPSIS
  Adversarial test matrix for git-safe-ops.ps1 and ao-close.ps1 git network operations.
  Phase C5/C6 (2026-05-30).

  8 cases covering the failure modes that caused AO-CLOSE / AO-RESUME to abort:
    T1  Invoke-SafeGitFetch happy path
    T2  Stale lock file auto-removed before fetch
    T3  Network failure recorded in ledger, throws
    T4  Invoke-SafeGitPush happy path
    T5  ao-close.ps1 references lib + both Invoke-Safe* functions
    T6  Preflight auto-bypasses -AllowAheadCommits for checkpoint-only ahead
    T7  Preflight shows clear remediation for human-authored ahead commits
    T8  git-safe-ops.ps1 self-tests 4/4 pass

  Run: powershell -ExecutionPolicy Bypass -File scripts\test-git-safe-ops-matrix.ps1
#>

# CP950 protection for native stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Fixture git 呼叫專用。**刻意不走 lib/git-safe-ops.ps1** —— 那正是本檔要測的對象，
# 用被測物件搭建自己的測試環境會讓 lib 的 bug 偽裝成「測試環境壞了」而非測試失敗。
# 改用 lint 認可的另一種安全形式：scoped EAP='Continue' + finally 還原。
# 為何需要：PS 5.1 在 EAP=Stop 下把 native stderr 當 error record，而 git init/commit
# 等成功時也會往 stderr 印訊息 → 裸呼叫會在成功路徑上拋 NativeCommandError。
function Invoke-FixtureGit {
    param([Parameter(Mandatory = $true)][string[]] $GitArgs)
    $savedEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = Invoke-WithUtf8Console { & git @GitArgs 2>&1 }
        $code = $(if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE })
        # 同一個不變量：改用 scoped EAP='Continue' 後，失敗不再自動拋，所以這裡必須自己拋。
        # 否則 fixture 建置失敗會靜默，測試在後面以看不懂的形式爆掉（「測試環境壞了」的假象）
        # 而不是在出錯的那一行停住。舊的裸呼叫是靠 NativeCommandError 提供這個大聲失敗。
        if ($code -ne 0) { throw ("fixture git failed (exit $code): git " + ($GitArgs -join ' ') + "`n" + ($out -join "`n")) }
        return $code
    } finally { $ErrorActionPreference = $savedEap }
}

$WorkRoot    = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot ".." )).Path
$LibPath     = Join-Path $WorkRoot "scripts\lib\git-safe-ops.ps1"
$AoClosePath = Join-Path $WorkRoot "scripts\ao-close.ps1"

$pass = 0; $fail = 0; $results = @()

function Test-Case {
    param([string]$Name, [scriptblock]$Body)
    try {
        $msg = & $Body
        $script:pass++
        $script:results += [pscustomobject]@{ Result='PASS'; Name=$Name; Detail=$msg }
        Write-Host ("  PASS: $Name") -ForegroundColor Green
    } catch {
        $script:fail++
        $script:results += [pscustomobject]@{ Result='FAIL'; Name=$Name; Detail=$_.Exception.Message }
        Write-Host ("  FAIL: $Name — $($_.Exception.Message)") -ForegroundColor Red
    }
}

function New-TempGitRepo {
    param([string]$Tag = 'gso')
    $dir = Join-Path $env:TEMP ("git-safe-test-$Tag-$(Get-Date -Format 'HHmmssff')")
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Push-Location $dir
    try {
        Invoke-FixtureGit @("init","-q") | Out-Null
        Invoke-FixtureGit @("config","user.email","test@test.com") | Out-Null
        Invoke-FixtureGit @("config","user.name","Test") | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $dir 'init.txt'), 'init')
        Invoke-FixtureGit @("add",".") | Out-Null
        Invoke-FixtureGit @("commit","-m","init","-q") | Out-Null
    } finally { Pop-Location }
    return $dir
}

Write-Host ""; Write-Host "=== git-safe-ops adversarial test matrix ===" -ForegroundColor Cyan
Write-Host "  WorkRoot: $WorkRoot"; Write-Host ""

Test-Case "T1: Invoke-SafeGitFetch on real repo (aligned)" {
    . $LibPath
    Invoke-SafeGitFetch -WorkRoot $WorkRoot -Prune
    $lp = Join-Path $WorkRoot "agency-os\.agency-state\git-network-last.json"
    if (-not (Test-Path $lp)) { throw "ledger not written" }
    $d = Get-Content $lp -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($d.lastOp.op -ne 'fetch') { throw "op wrong: $($d.lastOp.op)" }
    if (-not $d.lastOp.success)   { throw "success=false" }
    "fetch ok, ledger success=true"
}

Test-Case "T2: Stale lock file removed before fetch" {
    . $LibPath
    $repoDir   = New-TempGitRepo 't2'
    $originDir = Join-Path $env:TEMP ("git-safe-origin-t2-$(Get-Date -Format 'HHmmssff')")
    Invoke-FixtureGit @("clone","--bare",$repoDir,$originDir,"-q") | Out-Null
    Push-Location $repoDir; try { Invoke-FixtureGit @("remote","add","origin",$originDir) | Out-Null } finally { Pop-Location }

    $lockDir  = Join-Path $repoDir ".git\refs\remotes\origin"
    New-Item -ItemType Directory -Path $lockDir -Force | Out-Null
    $lockPath = Join-Path $lockDir "main.lock"
    [System.IO.File]::WriteAllText($lockPath, 'stale')

    Invoke-SafeGitFetch -WorkRoot $repoDir
    $lockLeft = Test-Path $lockPath

    Remove-Item -Recurse -Force $repoDir   -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $originDir -ErrorAction SilentlyContinue

    if ($lockLeft) { throw "lock file was NOT removed" }
    "stale lock removed + fetch completed"
}

Test-Case "T3: Fetch failure recorded in ledger, throws" {
    . $LibPath
    $repoDir = New-TempGitRepo 't3'
    Push-Location $repoDir
    try { Invoke-FixtureGit @("remote","add","origin","https://invalid.example.invalid/repo.git") | Out-Null }
    finally { Pop-Location }

    $threw = $false
    try { Invoke-SafeGitFetch -WorkRoot $repoDir -MaxAttempts 1 } catch { $threw = $true }

    $lp = Join-Path $repoDir "agency-os\.agency-state\git-network-last.json"
    $ledgerFail = (Test-Path $lp) -and -not ((Get-Content $lp -Raw -Encoding UTF8 | ConvertFrom-Json).lastOp.success)
    Remove-Item -Recurse -Force $repoDir -ErrorAction SilentlyContinue

    if (-not $threw)      { throw "expected throw on bad remote" }
    if (-not $ledgerFail) { throw "ledger did not record failure" }
    "threw + ledger success=false"
}

Test-Case "T4: Invoke-SafeGitPush happy path" {
    . $LibPath
    $repoDir   = New-TempGitRepo 't4'
    $originDir = Join-Path $env:TEMP ("git-safe-origin-t4-$(Get-Date -Format 'HHmmssff')")
    Invoke-FixtureGit @("clone","--bare",$repoDir,$originDir,"-q") | Out-Null
    Push-Location $repoDir
    try {
        Invoke-FixtureGit @("remote","add","origin",$originDir) | Out-Null
        Invoke-FixtureGit @("fetch","origin","-q") | Out-Null
        Invoke-FixtureGit @("branch","--set-upstream-to=origin/master","master") | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $repoDir 't4.txt'), 't4')
        Invoke-FixtureGit @("add",".") | Out-Null
        Invoke-FixtureGit @("commit","-m","t4","-q") | Out-Null
    } finally { Pop-Location }

    Invoke-SafeGitPush -WorkRoot $repoDir -Branch 'master'

    $lp = Join-Path $repoDir "agency-os\.agency-state\git-network-last.json"
    $d = Get-Content $lp -Raw -Encoding UTF8 | ConvertFrom-Json
    Remove-Item -Recurse -Force $repoDir   -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $originDir -ErrorAction SilentlyContinue

    if ($d.lastOp.op -ne 'push') { throw "op wrong: $($d.lastOp.op)" }
    if (-not $d.lastOp.success)  { throw "success=false" }
    "push ok, ledger success=true"
}

Test-Case "T5: ao-close.ps1 references lib + both Invoke-Safe* functions" {
    $content = Get-Content $AoClosePath -Raw -Encoding UTF8
    if ($content -notmatch 'git-safe-ops\.ps1')    { throw "no lib reference" }
    if ($content -notmatch 'Invoke-SafeGitFetch')  { throw "no Invoke-SafeGitFetch" }
    if ($content -notmatch 'Invoke-SafeGitPush')   { throw "no Invoke-SafeGitPush" }
    "lib + both functions referenced"
}

Test-Case "T6: Preflight auto-bypasses -AllowAheadCommits for checkpoint-only ahead" {
    $content = Get-Content $AoClosePath -Raw -Encoding UTF8
    if ($content -notmatch 'checkpoint:') { throw "auto-detect pattern missing" }
    if ($content -notmatch 'humanCommits') { throw "humanCommits var missing" }
    "auto-checkpoint-bypass pattern present"
}

Test-Case "T7: Preflight clear remediation for human-authored ahead commits" {
    $content = Get-Content $AoClosePath -Raw -Encoding UTF8
    if ($content -notmatch 'human-authored') { throw "'human-authored' missing" }
    if ($content -notmatch 'AllowAheadCommits') { throw "flag name missing" }
    "clear remediation message present"
}

Test-Case "T8: git-safe-ops.ps1 self-tests pass" {
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $LibPath -SelfTest 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "self-tests failed: $out" }
    $out -match '(\d+) passed, 0 failed' | Out-Null
    "$($Matches[1]) self-tests passed"
}

Write-Host ""
$color = if ($fail -eq 0) { 'Green' } else { 'Red' }
Write-Host ("=== Matrix results: $pass passed, $fail failed ===") -ForegroundColor $color
if ($fail -gt 0) {
    $results | Where-Object { $_.Result -eq 'FAIL' } | ForEach-Object {
        Write-Host ("  FAIL: $($_.Name) — $($_.Detail)") -ForegroundColor Red
    }
}
exit $(if ($fail -gt 0) { 1 } else { 0 })
