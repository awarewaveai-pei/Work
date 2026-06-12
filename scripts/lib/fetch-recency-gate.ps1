#requires -Version 5.1
<#
.SYNOPSIS
  Evaluates agency-os/.agency-state/git-fetch-last.json recency.

.DESCRIPTION
  Shared helper for the Phase Z5 health gate. It intentionally has no side
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
            detail   = "WARN: ledger missing; run AO-RESUME/git-align to create agency-os/.agency-state/git-fetch-last.json"
            reason   = ""
        }
    }

    try {
        $ledger = Get-Content -LiteralPath $LedgerPath -Raw -Encoding UTF8 | ConvertFrom-Json
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
                reason   = "Git fetch ledger stale >${CriticalAfterDays}d; run AO-RESUME/git-align to refresh remote state"
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
            reason   = "Git fetch ledger unreadable; run AO-RESUME/git-align to regenerate agency-os/.agency-state/git-fetch-last.json"
        }
    }
}
