#requires -Version 5.1
<#
.SYNOPSIS
  Evaluates the recency of the last git fetch in agency-os/.agency-state/git-network-last.json.

.DESCRIPTION
  Shared helper for the Phase Z5 health gate. The ledger is the one Write-GitNetworkLedger
  (scripts/lib/git-safe-ops.ps1) writes on every Invoke-SafeGitFetch / push: the newest fetch
  (lastFetch, which pushes never evict; else lastOp / history, newest first) is what is judged. Until 2026-10-24 the gate read
  git-fetch-last.json, written only by git-align, which AO-RESUME stopped running on
  2026-09-23 -- the gate went critical 30 days later with fetches succeeding every hour.
  It intentionally has no side
  effects so tests can exercise fresh, stale, failed, missing, and malformed
  ledgers without mutating the real AO state.
#>

Set-StrictMode -Version Latest

function Test-GitFetchLedgerRecency {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LedgerPath,

        [int]$WarnAfterDays = 7,
        [int]$CriticalAfterDays = 30,

        [datetime]$NowUtc = (Get-Date).ToUniversalTime()
    )

    if (-not (Test-Path -LiteralPath $LedgerPath)) {
        return [pscustomobject]@{
            pass     = $true
            critical = $false
            verdict  = "warn"
            detail   = "WARN: ledger missing; run AO-RESUME (any git fetch through scripts/lib/git-safe-ops.ps1 writes agency-os/.agency-state/git-network-last.json)"
            reason   = ""
        }
    }

    try {
        $doc = Get-Content -LiteralPath $LedgerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $entries = @()
        if ($doc.PSObject.Properties.Name -contains 'lastFetch' -and $doc.lastFetch) { $entries += $doc.lastFetch }
        if ($doc.PSObject.Properties.Name -contains 'lastOp' -and $doc.lastOp) { $entries += $doc.lastOp }
        if ($doc.PSObject.Properties.Name -contains 'history') { $entries += @($doc.history) }
        $ledger = $entries | Where-Object { $_ -and [string]$_.op -eq 'fetch' } | Select-Object -First 1
        if (-not $ledger) { throw "no fetch entry in lastOp/history" }
        $finishedText = [string]$ledger.finishedAtUtc
        if ([string]::IsNullOrWhiteSpace($finishedText)) {
            throw "finishedAtUtc missing"
        }

        $finishedUtc = ([datetime]::Parse($finishedText)).ToUniversalTime()
        $ageDaysRaw = [Math]::Floor(($NowUtc.ToUniversalTime() - $finishedUtc).TotalDays)
        $ageDays = [Math]::Max(0, $ageDaysRaw)
        $success = [bool]$ledger.success
        $attempts = if ($ledger.PSObject.Properties.Name -contains 'attempts') { [int]$ledger.attempts } else { 0 }
        $exitCode = if ($ledger.PSObject.Properties.Name -contains 'exitCode') { [int]$ledger.exitCode } else { 0 }

        if ($ageDays -gt $CriticalAfterDays) {
            return [pscustomobject]@{
                pass     = $false
                critical = $true
                verdict  = "fail"
                detail   = "FAIL: last fetch ledger is ${ageDays}d old (>${CriticalAfterDays}d), success=$success, exit=$exitCode"
                reason   = "Git fetch ledger stale >${CriticalAfterDays}d; run AO-RESUME to refresh remote state"
            }
        }

        if ((-not $success) -or $ageDays -gt $WarnAfterDays) {
            return [pscustomobject]@{
                pass     = $true
                critical = $false
                verdict  = "warn"
                detail   = "WARN: success=$success, age=${ageDays}d, attempts=$attempts, exit=$exitCode"
                reason   = ""
            }
        }

        return [pscustomobject]@{
            pass     = $true
            critical = $false
            verdict  = "pass"
            detail   = "PASS: success=$success, age=${ageDays}d, attempts=$attempts, exit=$exitCode"
            reason   = ""
        }
    } catch {
        return [pscustomobject]@{
            pass     = $false
            critical = $true
            verdict  = "fail"
            detail   = "FAIL: unreadable ledger: $($_.Exception.Message)"
            reason   = "Git fetch ledger unreadable; run AO-RESUME to write a fresh fetch entry into agency-os/.agency-state/git-network-last.json"
        }
    }
}
