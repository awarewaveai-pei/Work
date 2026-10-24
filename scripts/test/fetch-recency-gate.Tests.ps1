<#
.SYNOPSIS
  Regression tests for scripts/lib/fetch-recency-gate.ps1.

.DESCRIPTION
  Pester-free. Exercises the Phase Z5 git fetch recency gate (git-network-last.json) helper
  without mutating the real agency-os/.agency-state ledger.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $repoRoot 'scripts\lib\fetch-recency-gate.ps1')

$script:fail = 0
$script:pass = 0
function Assert([bool]$cond, [string]$name) {
    if ($cond) { $script:pass++; Write-Host ("  PASS  {0}" -f $name) -ForegroundColor Green }
    else       { $script:fail++; Write-Host ("  FAIL  {0}" -f $name) -ForegroundColor Red }
}

function Write-Ledger {
    param(
        [string]$Path,
        [datetime]$FinishedAtUtc,
        [bool]$Success,
        [int]$ExitCode = 0
    )
    # git-network-last.json shape: a newer push as lastOp must not hide the fetch entry in history
    $fetch = [ordered]@{
        op             = 'fetch'
        startedAtUtc   = $FinishedAtUtc.AddSeconds(-3).ToString('o')
        finishedAtUtc  = $FinishedAtUtc.ToString('o')
        success        = $Success
        attempts       = 1
        exitCode       = $ExitCode
        errorExcerpt   = ''
    }
    $push = [ordered]@{ op = 'push'; startedAtUtc = $now.ToString('o'); finishedAtUtc = $now.ToString('o'); success = $true; attempts = 1; exitCode = 0; errorExcerpt = '' }
    $payload = [ordered]@{ schemaVersion = 1; lastOp = $push; history = @($push, $fetch) } | ConvertTo-Json -Depth 5
    Set-Content -LiteralPath $Path -Value $payload -Encoding UTF8
}

$tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("fetch-recency-test-" + [guid]::NewGuid().ToString('N'))
$now = [datetime]'2026-06-12T12:00:00Z'
try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $ledgerPath = Join-Path $tmpRoot 'git-network-last.json'

    Write-Host "== fetch-recency gate contract ==" -ForegroundColor Cyan

    Write-Ledger -Path $ledgerPath -FinishedAtUtc $now.AddDays(-1) -Success $true
    $fresh = Test-GitFetchLedgerRecency -LedgerPath $ledgerPath -NowUtc $now
    Assert ($fresh.verdict -eq 'pass' -and $fresh.pass -and -not $fresh.critical) "fresh successful ledger passes"

    Write-Ledger -Path $ledgerPath -FinishedAtUtc $now.AddDays(-1) -Success $false -ExitCode 128
    $failed = Test-GitFetchLedgerRecency -LedgerPath $ledgerPath -NowUtc $now
    Assert ($failed.verdict -eq 'warn' -and $failed.pass -and -not $failed.critical) "recent failed fetch is warn-only"

    Write-Ledger -Path $ledgerPath -FinishedAtUtc $now.AddDays(-8) -Success $true
    $warnStale = Test-GitFetchLedgerRecency -LedgerPath $ledgerPath -NowUtc $now
    Assert ($warnStale.verdict -eq 'warn' -and $warnStale.pass -and -not $warnStale.critical) "8-day stale ledger is warn-only"

    Write-Ledger -Path $ledgerPath -FinishedAtUtc $now.AddDays(-31) -Success $true
    $criticalStale = Test-GitFetchLedgerRecency -LedgerPath $ledgerPath -NowUtc $now
    Assert ($criticalStale.verdict -eq 'fail' -and -not $criticalStale.pass -and $criticalStale.critical) "31-day stale ledger is critical"

    Remove-Item -LiteralPath $ledgerPath -Force
    $missing = Test-GitFetchLedgerRecency -LedgerPath $ledgerPath -NowUtc $now
    Assert ($missing.verdict -eq 'warn' -and $missing.pass -and -not $missing.critical) "missing ledger is warn-only"

    Set-Content -LiteralPath $ledgerPath -Value '{bad json' -Encoding UTF8
    $bad = Test-GitFetchLedgerRecency -LedgerPath $ledgerPath -NowUtc $now
    Assert ($bad.verdict -eq 'fail' -and -not $bad.pass -and $bad.critical) "malformed ledger is critical"

    Set-Content -LiteralPath $ledgerPath -Value '{"schemaVersion":1,"lastOp":{"op":"push","finishedAtUtc":"2026-06-12T11:00:00Z","success":true},"history":[]}' -Encoding UTF8
    $noFetch = Test-GitFetchLedgerRecency -LedgerPath $ledgerPath -NowUtc $now
    Assert ($noFetch.verdict -eq 'fail' -and $noFetch.critical) "a ledger with pushes but no fetch is critical (no fetch evidence)"

    # the real writer: one fetch, then 20 pushes fill the history; the fetch is still the one judged
    . (Join-Path $repoRoot 'scripts\lib\git-safe-ops.ps1')
    $wr = Join-Path $tmpRoot 'wr'
    Write-GitNetworkLedger -Op 'fetch' -Success $true -StartUtc $now.AddDays(-2) -WorkRoot $wr
    1..20 | ForEach-Object { Write-GitNetworkLedger -Op 'push' -Success $true -StartUtc $now -WorkRoot $wr }
    $kept = Test-GitFetchLedgerRecency -LedgerPath (Join-Path $wr 'agency-os\.agency-state\git-network-last.json')
    Assert ($kept.pass -and -not $kept.critical) "a fetch followed by 20 pushes is still found (lastFetch)"
} finally {
    if (Test-Path -LiteralPath $tmpRoot) {
        Remove-Item -LiteralPath $tmpRoot -Recurse -Force
    }
}

Write-Host ""
$summaryColor = if ($script:fail -eq 0) { 'Green' } else { 'Red' }
Write-Host ("RESULT: {0} passed, {1} failed" -f $script:pass, $script:fail) -ForegroundColor $summaryColor
if ($script:fail -gt 0) { exit 1 }
exit 0
