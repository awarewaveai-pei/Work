<#
.SYNOPSIS
  Backfill a missing memory/daily/<date>.md from git log when AO-CLOSE was skipped.

.DESCRIPTION
  When AO-CLOSE does not run for a day, no daily scaffold is created. This tool
  reconstructs the daily note from `git log --since=<date> --until=<date+1>` so
  the date hole is filled with a clearly-marked best-effort summary.

  Honest by design: the file header includes <!-- backfilled:manual ... --> so
  future readers know this is reconstructed, not a verbatim closeout record.
  Will NOT overwrite an existing file unless -Force is passed.

.PARAMETER Date
  yyyy-MM-dd. The missing date to backfill.

.PARAMETER WorkRoot
  Monorepo root (auto-detected from script location if omitted).

.PARAMETER Force
  Overwrite an existing daily file. Default: refuse if file exists.

.EXAMPLE
  powershell -File scripts/backfill-missed-daily.ps1 -Date 2026-05-21

.NOTES
  Standard recovery tool for AO-RESUME health warning. Replaces ad-hoc Claude
  hand-coded values. Never modifies WORKLOG.md or CONVERSATION_MEMORY.md.
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d{4}-\d{2}-\d{2}$')]
    [string]$Date,

    [string]$WorkRoot = "",

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'lib\repo-text.ps1')

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

$dailyDir  = Join-Path $WorkRoot "agency-os\memory\daily"
$dailyPath = Join-Path $dailyDir "$Date.md"

if ((Test-Path -LiteralPath $dailyPath) -and (-not $Force)) {
    Write-Error "backfill-missed-daily: $dailyPath already exists. Pass -Force to overwrite."
    exit 1
}

Push-Location $WorkRoot
# Force UTF-8 stdout decoding for git. Windows PowerShell defaults to OEM (CP950 for zh-TW),
# which mangles multi-byte UTF-8 bytes in CJK commit messages — including, critically, eating
# newline bytes so two commits merge into one line. git stores subjects as UTF-8; we decode as
# UTF-8. Restored in finally so we don't pollute the caller's console encoding.
$prevConsoleEncoding = [Console]::OutputEncoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "backfill-missed-daily: not a git repository at $WorkRoot"
        exit 1
    }

    $dateObj = [DateTime]::ParseExact($Date, 'yyyy-MM-dd', $null)
    $nextDay = $dateObj.AddDays(1).ToString('yyyy-MM-dd')

    # NOTE: git log --since/--until use local-time boundaries (git's default). If a commit at
    # 2026-05-21 23:55 +08:00 is being checked against $Date=2026-05-21, it correctly falls
    # in-window. Cross-timezone backfill (e.g. running this script from a different region than
    # where commits were authored) may shift the window by N hours. Acceptable for single-operator
    # use; documented here so future maintainers don't add a "UTC fix" that breaks the common case.
    $log = git log --since="$Date 00:00" --until="$nextDay 00:00" --pretty=format:"%h|%ci|%s" 2>$null
    $commits = @($log | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    if ($commits.Count -eq 0) {
        Write-Host "backfill-missed-daily: no commits found for $Date -- writing empty scaffold." -ForegroundColor Yellow
    }
} finally {
    [Console]::OutputEncoding = $prevConsoleEncoding
    Pop-Location
}

$generatedOn = (Get-Date).ToString('yyyy-MM-dd')

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# Daily Note - $Date")
$lines.Add("")
$lines.Add("<!-- backfilled:manual source=git-log generated_on=$generatedOn reason=`"AO-CLOSE did not run on $Date -- daily scaffold never created. Reconstructed from git log to fill the date hole. Original closeout intent unknown; this is best-effort summary, not a verbatim record.`" -->")
$lines.Add("")
$lines.Add("## Done today")
$lines.Add("")
if ($commits.Count -gt 0) {
    $lines.Add("Reconstructed from ``git log --since=`"$Date 00:00`" --until=`"$nextDay 00:00`"`` (local-time boundaries):")
    $lines.Add("")
    foreach ($c in $commits) {
        $parts = $c -split '\|', 3
        if ($parts.Count -eq 3) {
            $hash = $parts[0]
            $subj = $parts[2]
            $lines.Add("- ``$hash`` $subj")
        }
    }
} else {
    $lines.Add("- (no commits found on $Date)")
}
$lines.Add("")
$lines.Add("## Current state")
$lines.Add("")
$lines.Add("- (backfilled -- current state not reconstructable from git log alone; check WORKLOG.md ## $Date and CONVERSATION_MEMORY.md for narrative context)")
$lines.Add("")
$lines.Add("## Next steps")
$lines.Add("")
$lines.Add("- (backfilled -- next steps were never recorded; see TASKS.md for currently-open items)")
$lines.Add("")
$lines.Add("## Closeout inbox (AO-CLOSE auto, verbatim)")
$lines.Add("")
$lines.Add("<!-- backfilled:manual -- $Date has no closeout-inbox because AO-CLOSE did not run that day. -->")

if (-not (Test-Path -LiteralPath $dailyDir)) {
    New-Item -ItemType Directory -Path $dailyDir -Force | Out-Null
}

Write-RepoTextFile -Path $dailyPath -Content (($lines -join "`n") + "`n")

Write-Host ""
Write-Host "backfill-missed-daily: wrote $dailyPath" -ForegroundColor Green
Write-Host "  commits captured: $($commits.Count)" -ForegroundColor DarkGray
Write-Host "  marker: <!-- backfilled:manual --> (clearly flagged as reconstruction)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Next: review the file, add any missing narrative, then commit:" -ForegroundColor Cyan
Write-Host "  git add agency-os/memory/daily/$Date.md && git commit -m `"docs: backfill daily/$Date -- AO-CLOSE was missed`"" -ForegroundColor DarkGray
exit 0
