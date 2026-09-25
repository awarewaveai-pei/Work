#requires -Version 5.1
<#
.SYNOPSIS
  Test matrix for scripts/lib/post-commit-doc-check.ps1 and its
  scripts/lib/smoke-status-digest.ps1 wiring (TASKS.md:655).

  Isolated fixture git repos (never this checkout's own history):
    T1  Get-DocIntegrityCommitEntry: missing status file -> PASS, no blockers (event-driven, not stale)
    T2  Invoke-PostCommitDocCheck on a commit that breaks a relative doc link -> ok, brokenCount>0
    T3  Get-DocIntegrityCommitEntry over that status file -> WARN, a blocker line naming the break
    T4  Invoke-PostCommitDocCheck on a commit with a clean link -> ok, brokenCount=0
    T5  Get-DocIntegrityCommitEntry over that status file -> PASS, no blockers
    T6  Get-StatusDigest (full wiring) on the broken fixture -> blockers[] contains a "Doc integrity" line
    T7  Get-StatusDigest (full wiring) on the clean fixture -> blockers[] contains NO "Doc integrity" line
    T8  Malformed status file -> BLIND (can't trust unparsable content)
    T9  ao-close.ps1 and commit-checkpoint.ps1 both reference the shared helper (wiring didn't silently drop)

  Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-post-commit-doc-check.ps1   (Windows PowerShell 5.1 = what the laptop runs; pwsh also works)
#>

Set-StrictMode -Version Latest

# Fixture git calls only -- never routes through the code under test. Same reasoning as
# scripts/test-git-safe-ops-matrix.ps1's own Invoke-FixtureGit: using the thing being tested to
# build its own test environment would let a bug in it masquerade as "test setup broken".
function Invoke-FixtureGit {
    param([Parameter(Mandatory = $true)][string[]]$GitArgs, [string]$Cwd = $null)
    $savedEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Cwd) {
            $out = & git -C $Cwd @GitArgs 2>&1
        } else {
            $out = & git @GitArgs 2>&1
        }
        $code = $(if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE })
        if ($code -ne 0) { throw ("fixture git failed (exit $code): git " + ($GitArgs -join ' ') + "`n" + ($out -join "`n")) }
        return $out
    } finally { $ErrorActionPreference = $savedEap }
}

$RealWorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $PSScriptRoot "lib/post-commit-doc-check.ps1")
. (Join-Path $PSScriptRoot "lib/smoke-status-digest.ps1")

$pass = 0; $fail = 0; $results = @()
function Test-Case {
    param([string]$Name, [scriptblock]$Body)
    try {
        $msg = & $Body
        $script:pass++
        $script:results += [pscustomobject]@{ Result = 'PASS'; Name = $Name; Detail = $msg }
        Write-Host ("  PASS: $Name") -ForegroundColor Green
    } catch {
        $script:fail++
        $script:results += [pscustomobject]@{ Result = 'FAIL'; Name = $Name; Detail = $_.Exception.Message }
        Write-Host ("  FAIL: $Name -- $($_.Exception.Message)") -ForegroundColor Red
    }
}

# A standalone repo with its own agency-os/docs/ tree -- inLinkScope() in validate-doc-integrity.mjs
# judges paths against --workRoot, so this fixture needs the same relative shape the real repo has,
# not the real repo's actual content.
function New-FixtureRepo {
    param([string]$Tag)
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("post-commit-doc-check-$Tag-$(Get-Date -Format 'HHmmssfff')")
    New-Item -ItemType Directory -Force -Path (Join-Path $dir "agency-os/docs") | Out-Null
    $null = Invoke-FixtureGit -Cwd $dir -GitArgs @("init", "-q")
    $null = Invoke-FixtureGit -Cwd $dir -GitArgs @("config", "user.email", "test@test.com")
    $null = Invoke-FixtureGit -Cwd $dir -GitArgs @("config", "user.name", "Test")
    Set-Content -LiteralPath (Join-Path $dir "agency-os/docs/existing.md") -Value "# Existing`n" -Encoding utf8
    $null = Invoke-FixtureGit -Cwd $dir -GitArgs @("add", "-A")
    $null = Invoke-FixtureGit -Cwd $dir -GitArgs @("commit", "-q", "-m", "init")
    return $dir
}

$fixturesToClean = New-Object System.Collections.Generic.List[string]

# ── T1 ──────────────────────────────────────────────────────────────────────────────────────
Test-Case "T1: missing status file -> PASS, no blockers (event-driven, not a stale periodic report)" {
    $dir = New-FixtureRepo "t1"
    $fixturesToClean.Add($dir)
    $statusDir = Join-Path $dir "agency-os/reports/status"
    $entry = Get-DocIntegrityCommitEntry -StatusDir $statusDir
    if ($entry.verdict -ne "PASS") { throw "expected PASS, got $($entry.verdict)" }
    # Real blockers only -- New-DigestEntry's own PASS branch stores an empty array, which the
    # PASS/SKIP branch of the hashtable literal collapses to $null (the exact quirk this file's
    # OWN header comment documents: "@($null) is ONE element"). Get-StatusDigest's flattening loop
    # already filters this with `if ($line -and "$line".Trim())`; this test applies the same filter
    # directly rather than asserting on a bare @() wrap, which would wrongly read Count=1.
    $real = @($entry.blockers | Where-Object { $_ -and "$_".Trim() })
    if ($real.Count -ne 0) { throw "expected 0 real blockers, got $($real.Count): $($real -join ' | ')" }
    "verdict=PASS, blockers=0"
}

# ── T2/T3/T6: the broken-link fixture ────────────────────────────────────────────────────────
$brokenDir = New-FixtureRepo "broken"
$fixturesToClean.Add($brokenDir)
Set-Content -LiteralPath (Join-Path $brokenDir "agency-os/docs/broken.md") -Value "[missing](./does-not-exist.md)`n" -Encoding utf8
$null = Invoke-FixtureGit -Cwd $brokenDir -GitArgs @("add", "-A")
$null = Invoke-FixtureGit -Cwd $brokenDir -GitArgs @("commit", "-q", "-m", "add a broken relative link")
$brokenStatusDir = Join-Path $brokenDir "agency-os/reports/status"
$brokenStatusPath = Join-Path $brokenStatusDir "doc-integrity-commits-LATEST.json"

Test-Case "T2: Invoke-PostCommitDocCheck on the broken commit -> ok, brokenCount=1" {
    $r = Invoke-PostCommitDocCheck -ValidatorWorkRoot $RealWorkRoot -TargetWorkRoot $brokenDir -Source "test-fixture" -StatusPath $brokenStatusPath
    if (-not $r.ok) { throw "expected ok=true, got error: $($r.error)" }
    if ($r.brokenCount -ne 1) { throw "expected brokenCount=1, got $($r.brokenCount)" }
    if (@($r.broken)[0].href -ne "./does-not-exist.md") { throw "unexpected href: $(@($r.broken)[0].href)" }
    if (-not (Test-Path -LiteralPath $brokenStatusPath)) { throw "status file was not written" }
    "ok=true, brokenCount=1, href=./does-not-exist.md"
}

Test-Case "T3: Get-DocIntegrityCommitEntry over that status file -> WARN with a blocker line naming the break" {
    $entry = Get-DocIntegrityCommitEntry -StatusDir $brokenStatusDir
    if ($entry.verdict -ne "WARN") { throw "expected WARN, got $($entry.verdict)" }
    $lines = @($entry.blockers)
    if ($lines.Count -eq 0) { throw "expected >=1 blocker line, got 0" }
    if (-not ($lines -match "does-not-exist.md")) { throw "no blocker line mentions the broken target: $($lines -join ' | ')" }
    "verdict=WARN, $($lines.Count) blocker line(s)"
}

# ── T4/T5/T7: the clean fixture ──────────────────────────────────────────────────────────────
$cleanDir = New-FixtureRepo "clean"
$fixturesToClean.Add($cleanDir)
Set-Content -LiteralPath (Join-Path $cleanDir "agency-os/docs/clean.md") -Value "[existing](./existing.md)`n" -Encoding utf8
$null = Invoke-FixtureGit -Cwd $cleanDir -GitArgs @("add", "-A")
$null = Invoke-FixtureGit -Cwd $cleanDir -GitArgs @("commit", "-q", "-m", "add a clean relative link")
$cleanStatusDir = Join-Path $cleanDir "agency-os/reports/status"
$cleanStatusPath = Join-Path $cleanStatusDir "doc-integrity-commits-LATEST.json"

Test-Case "T4: Invoke-PostCommitDocCheck on the clean commit -> ok, brokenCount=0" {
    $r = Invoke-PostCommitDocCheck -ValidatorWorkRoot $RealWorkRoot -TargetWorkRoot $cleanDir -Source "test-fixture" -StatusPath $cleanStatusPath
    if (-not $r.ok) { throw "expected ok=true, got error: $($r.error)" }
    if ($r.brokenCount -ne 0) { throw "expected brokenCount=0, got $($r.brokenCount)" }
    "ok=true, brokenCount=0"
}

Test-Case "T5: Get-DocIntegrityCommitEntry over the clean status file -> PASS, no blockers" {
    $entry = Get-DocIntegrityCommitEntry -StatusDir $cleanStatusDir
    if ($entry.verdict -ne "PASS") { throw "expected PASS, got $($entry.verdict)" }
    $real = @($entry.blockers | Where-Object { $_ -and "$_".Trim() })
    if ($real.Count -ne 0) { throw "expected 0 real blockers, got $($real.Count): $($real -join ' | ')" }
    "verdict=PASS, blockers=0"
}

Test-Case "T6: Get-StatusDigest (full wiring) on the BROKEN fixture -> blockers[] has a Doc integrity line" {
    $digest = Get-StatusDigest -WorkRoot $brokenDir
    $hit = @($digest.blockers | Where-Object { $_ -match "Doc integrity" -and $_ -match "does-not-exist.md" })
    if ($hit.Count -eq 0) { throw "no 'Doc integrity ... does-not-exist.md' line in blockers[] ($(($digest.blockers) -join ' | '))" }
    "found: $($hit[0])"
}

Test-Case "T7: Get-StatusDigest (full wiring) on the CLEAN fixture -> blockers[] has NO Doc integrity line" {
    $digest = Get-StatusDigest -WorkRoot $cleanDir
    $hit = @($digest.blockers | Where-Object { $_ -match "Doc integrity" })
    if ($hit.Count -ne 0) { throw "unexpected Doc integrity line(s) in a clean fixture: $($hit -join ' | ')" }
    "no Doc integrity line, as expected"
}

Test-Case "T8: malformed status file -> BLIND (unparsable content must not be trusted as PASS)" {
    $dir = New-FixtureRepo "malformed"
    $fixturesToClean.Add($dir)
    $statusDir = Join-Path $dir "agency-os/reports/status"
    New-Item -ItemType Directory -Force -Path $statusDir | Out-Null
    Set-Content -LiteralPath (Join-Path $statusDir "doc-integrity-commits-LATEST.json") -Value "{not valid json" -Encoding utf8
    $entry = Get-DocIntegrityCommitEntry -StatusDir $statusDir
    if ($entry.verdict -ne "BLIND") { throw "expected BLIND, got $($entry.verdict)" }
    "verdict=BLIND"
}

Test-Case "T9: both real callers reference the shared helper (wiring present, not silently dropped)" {
    $ckpt = Get-Content -LiteralPath (Join-Path $PSScriptRoot "commit-checkpoint.ps1") -Raw -Encoding UTF8
    $close = Get-Content -LiteralPath (Join-Path $PSScriptRoot "ao-close.ps1") -Raw -Encoding UTF8
    if ($ckpt -notmatch 'post-commit-doc-check\.ps1') { throw "commit-checkpoint.ps1 does not reference the shared helper" }
    if ($ckpt -notmatch 'Invoke-PostCommitDocCheck') { throw "commit-checkpoint.ps1 does not call Invoke-PostCommitDocCheck" }
    if ($close -notmatch 'post-commit-doc-check\.ps1') { throw "ao-close.ps1 does not reference the shared helper" }
    $callCount = ([regex]::Matches($close, 'Invoke-PostCommitDocCheck')).Count
    if ($callCount -lt 2) { throw "ao-close.ps1 should call Invoke-PostCommitDocCheck at least twice (main sync commit + report skeleton commit), found $callCount" }
    "commit-checkpoint.ps1: referenced; ao-close.ps1: referenced $callCount time(s)"
}

Test-Case "T10: status file cannot be written -> ok=false, error says so, no absolute path in it" {
    # a directory where the file should go: Set-Content fails; the caller must see ok=false, not a stale PASS
    $blocked = Join-Path $cleanStatusDir "blocked-status.json"
    New-Item -ItemType Directory -Force -Path $blocked | Out-Null
    $r = Invoke-PostCommitDocCheck -ValidatorWorkRoot $RealWorkRoot -TargetWorkRoot $cleanDir -Source "test-fixture" -StatusPath $blocked
    if ($r.ok) { throw "expected ok=false when the status file cannot be written" }
    if ("$($r.error)" -notmatch 'failed to write status file') { throw "expected a write-failure error, got: $($r.error)" }
    if ("$($r.error)" -match [regex]::Escape($RealWorkRoot)) { throw "error text carries an absolute path: $($r.error)" }
    "ok=false, error=$($r.error)"
}

foreach ($d in $fixturesToClean) { Remove-Item -Recurse -Force -LiteralPath $d -ErrorAction SilentlyContinue }

Write-Host ""
$color = if ($fail -eq 0) { 'Green' } else { 'Red' }
Write-Host ("=== post-commit-doc-check matrix: $pass passed, $fail failed ===") -ForegroundColor $color
if ($fail -gt 0) {
    $results | Where-Object { $_.Result -eq 'FAIL' } | ForEach-Object {
        Write-Host ("  FAIL: $($_.Name) -- $($_.Detail)") -ForegroundColor Red
    }
}
exit $(if ($fail -gt 0) { 1 } else { 0 })
