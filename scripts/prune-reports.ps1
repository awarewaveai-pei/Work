#requires -Version 5.1
<#
.SYNOPSIS
Enforce agency-os/reports/retention.json. Deletes aged report files; reports undeclared dirs.

.DESCRIPTION
One enforcer, policy as data. Called from ao-close.ps1; safe to run by hand any time.

WHY THIS EXISTS
On 2026-08-26 the reports tree held 5,000+ generated files across 24 directories. Exactly
one of them had a retention rule -- reports/ao-close, written as PROSE in
.claude/commands/ao-close.md and executed by the agent by hand. The other 23 had none:
reports/health held 3,315 files / 148 MB, reports/status held 1,495 of which 1,336 were
per-run copies of a backup check that passed every time.

Nothing was broken. Nothing was watching either, and that is the point: this is the same
shape as the ClickHouse recurrence this repo spent 2026-08-25 unpicking -- unbounded growth
that no detector measures, discovered only when someone happened to look.

WHY IT IS NOT JUST A CLEANUP SCRIPT
Deleting the files would fix today and nothing else; a new report type added next year would
accumulate exactly the same way, and nobody would notice until the next time someone looked.
So the enforceable invariant is not "these directories are small", it is:

    every directory under agency-os/reports/ has a DECLARED retention,
    and a directory that declares none is REPORTED rather than silently accumulating.

The undeclared-directory check below is what makes that hold in 2029 for a report type
written by someone who never read this file. Without it, this script is a patch with a
config file attached.

SAFETY -- three protections that policy cannot override:
  1. any filename containing LATEST  (the live snapshot every consumer and AGENTS.md reads)
  2. README.md                        (documentation, not output)
  3. the single newest file in each directory, even if past the horizon
     ao-close.ps1:324-333 keys its prior-close gate off the most recent report and already
     carries a 1-day margin against an off-by-one in the pruner it could not see. Making
     "never delete the newest" structural here means that margin can never be exceeded.

Age comes from the DATE STAMP IN THE FILENAME, not the filesystem mtime: a git checkout,
a restore, or a sync rewrites mtime and would make old reports look new (or new ones old).
Files with no parseable date stamp are never deleted -- unknown age is not an argument for
removal.

.NOTES
Policy: agency-os/reports/retention.json
Exit code: 0 always (warn-only, same convention as the check-*.ps1 family). The report is
the signal; a non-zero exit here would block AO-CLOSE over housekeeping.

PS5.1 source-encoding rule: no unicode emoji literals in source.
#>
[CmdletBinding()]
param(
    [string]$WorkRoot = "",
    [switch]$DryRun,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

$reportsDir = Join-Path $WorkRoot "agency-os\reports"
$policyPath = Join-Path $reportsDir "retention.json"

if (-not (Test-Path -LiteralPath $reportsDir)) {
    Write-Host "prune-reports: no reports directory at $reportsDir; nothing to do."
    exit 0
}
if (-not (Test-Path -LiteralPath $policyPath)) {
    # Missing policy is not "nothing to prune" -- it means the rule set is gone. Say so.
    Write-Host "prune-reports: WARNING policy file missing at $policyPath; refusing to delete anything." -ForegroundColor Yellow
    exit 0
}

try {
    $policy = Get-Content -LiteralPath $policyPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Write-Host "prune-reports: WARNING policy file is not valid JSON ($($_.Exception.Message)); refusing to delete anything." -ForegroundColor Yellow
    exit 0
}
if (-not $policy.PSObject.Properties.Name -contains 'directories') {
    Write-Host "prune-reports: WARNING policy has no 'directories' key; refusing to delete anything." -ForegroundColor Yellow
    exit 0
}

# Filename date stamps in this repo: 20260826, 2026-08-26, and the -YYYYMMDD-HHMMSS form.
function Get-StampDate {
    param([string]$Name)
    if ($Name -match '(20\d{2})-?(\d{2})-?(\d{2})') {
        try { return [datetime]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3]) } catch { return $null }
    }
    return $null
}

$today = (Get-Date).Date
$declared = @{}
foreach ($p in $policy.directories.PSObject.Properties) { $declared[$p.Name] = $p.Value }

$totalDeleted = 0
$totalBytes = 0L
$lines = @()
$undeclared = @()

foreach ($dir in (Get-ChildItem -LiteralPath $reportsDir -Directory -ErrorAction SilentlyContinue | Sort-Object Name)) {
    $name = $dir.Name
    if (-not $declared.ContainsKey($name)) {
        # THE 30-YEAR CLAUSE. A directory nobody declared is exactly how this situation arose
        # in the first place; surfacing it costs one line and removes the need for anyone to
        # remember that this file exists.
        $count = @(Get-ChildItem -LiteralPath $dir.FullName -File -ErrorAction SilentlyContinue).Count
        $undeclared += ("{0} ({1} file(s))" -f $name, $count)
        continue
    }

    $keepDays = $declared[$name].keepDays
    if ($null -eq $keepDays) { continue }

    $files = @(Get-ChildItem -LiteralPath $dir.FullName -File -ErrorAction SilentlyContinue)
    if ($files.Count -eq 0) { continue }

    # Protection 3: newest by stamp when one exists, else newest by mtime -- computed BEFORE
    # any deletion so it cannot shift as files are removed.
    $newest = $files | Sort-Object -Property @{Expression = { $d = Get-StampDate $_.Name; if ($d) { $d } else { $_.LastWriteTime.Date } }}, LastWriteTime -Descending | Select-Object -First 1

    $cutoff = $today.AddDays(-[int]$keepDays)
    $deletedHere = 0
    $bytesHere = 0L
    foreach ($f in $files) {
        if ($f.Name -like '*LATEST*') { continue }          # protection 1
        if ($f.Name -eq 'README.md') { continue }           # protection 2
        if ($newest -and $f.FullName -eq $newest.FullName) { continue }  # protection 3
        $stamp = Get-StampDate $f.Name
        if ($null -eq $stamp) { continue }                  # unknown age is not a reason to delete
        if ($stamp -ge $cutoff) { continue }
        $bytesHere += $f.Length
        if (-not $DryRun) { Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue }
        $deletedHere++
    }
    if ($deletedHere -gt 0) {
        $totalDeleted += $deletedHere
        $totalBytes += $bytesHere
        $lines += ("  {0,-18} {1,5} file(s), {2,8:N1} KB  (keep {3}d)" -f $name, $deletedHere, ($bytesHere / 1KB), $keepDays)
    }
}

if (-not $Quiet) {
    $verb = if ($DryRun) { "would delete" } else { "deleted" }
    Write-Host ("prune-reports: {0} {1} file(s), {2:N1} MB" -f $verb, $totalDeleted, ($totalBytes / 1MB))
    foreach ($l in $lines) { Write-Host $l }
    if ($undeclared.Count -gt 0) {
        Write-Host ""
        Write-Host ("prune-reports: {0} report directory(ies) have NO declared retention:" -f $undeclared.Count) -ForegroundColor Yellow
        foreach ($u in $undeclared) { Write-Host ("  - {0}" -f $u) -ForegroundColor Yellow }
        Write-Host "  Add them to agency-os/reports/retention.json (keepDays, or null with a reason)." -ForegroundColor Yellow
    }
}

exit 0
