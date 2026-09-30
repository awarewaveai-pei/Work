#requires -Version 5.1
<#
.SYNOPSIS
    Monthly drift check across ALL relationships declared in docs/CHANGE_IMPACT_MATRIX.md.

.DESCRIPTION
    docs/CHANGE_IMPACT_MATRIX.md declares ~85 "主文件 -> 必查/必同步文件" rows: whenever
    the left file changes, the right files are supposed to be reviewed/kept in sync. That
    declaration is currently enforced only by human/AI discipline (doc-sync-automation.ps1
    prints the impacted list as a reminder when the left file changes; nothing checks
    whether the right files have actually kept up). 2026-08-24: this exact gap let
    docs/operations/TOOL_TRIGGER_MAP.md (impacted by AGENTS.md) go 7 weeks stale with
    nobody noticing, because AGENTS.md kept changing while the reminder was never acted on.

    This script closes that gap generically, for every declared pair, not just that one:
    for each row, extract the left ("主文件") path and every right ("impacted") path,
    resolve each to a real file relative to WorkRoot (handling the `../` monorepo-root
    prefix used throughout the matrix), and compare mtimes. If the left file was modified
    more recently than a right file by more than the threshold, that pair is flagged as
    a drift candidate -- the right file may not have caught up with a change that was
    supposed to trigger a review.

    Parsing strategy (deliberately conservative, not a hand-rolled per-annotation parser):
    only text inside markdown backticks is ever treated as a candidate path. The matrix
    file mixes plain prose annotations into cells -- trailing 全形/半形 Chinese notes,
    bold caveats, "專案 X.md" template references, `01-04 guides` range descriptions,
    even one literal Windows placeholder path (`C:\Users\USER\...`). None of that is
    backtick-quoted, so a backtick-only extraction naturally ignores it without needing
    per-pattern special-casing. A row's LEFT column may also carry a trailing annotation
    after its backtick path (e.g. `` `../README.md`（monorepo 根） ``) -- only the first
    backtick span in that column is taken as the path. Anything that doesn't resolve to
    an existing FILE (not a directory, not a Windows-absolute path outside the repo) is
    routed to a visible "skipped" list, never silently dropped and never guessed at.

    Checks (informational; output is a snapshot, not a build gate):
      - Matrix file exists and is parseable into at least one row
      - For each (main, impacted) pair that resolves to two real files: mtime drift
        in days. Thresholds mirror check-governance-docs-drift.ps1's own convention:
        <=90 days OK, 91-180 WARN, >180 FAIL (per-pair severity; overall script status
        is worst-of-all-pairs, same aggregation pattern as that sibling script).

    Output:
      agency-os/reports/governance/impact-matrix-drift-{YYYY-MM}.md   (committed; one per month)
      agency-os/reports/governance/impact-matrix-drift-LATEST.md
      agency-os/reports/status/impact-matrix-drift-LATEST.md

    Designed for monthly invocation alongside check-governance-docs-drift.ps1 (see
    scripts/ao-resume.ps1's monthly-checks block), but also runnable manually anytime.

.PARAMETER WorkRoot
    Repo root (the directory containing `agency-os/`). Default: parent of script directory.

.PARAMETER ReportMonth
    Override report month as YYYY-MM (default: current).

.PARAMETER DriftWarnDays
    Days of one-directional mtime drift before a pair is flagged WARN. Default: 90
    (matches check-governance-docs-drift.ps1's WARN threshold).

.PARAMETER DriftFailDays
    Days of drift before a pair is flagged FAIL. Default: 180 (matches the sibling
    script's FAIL threshold).

.PARAMETER Force
    Overwrite existing report for this month (default: skip if exists).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\check-change-impact-matrix-drift.ps1
    # Generates agency-os/reports/governance/impact-matrix-drift-2026-08.md
#>
[CmdletBinding()]
param(
    [string]$WorkRoot = "",
    [string]$ReportMonth = "",
    [int]$DriftWarnDays = 90,
    [int]$DriftFailDays = 180,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    if ($PSScriptRoot) {
        $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    } else {
        $WorkRoot = (Get-Location).Path
    }
}
$agencyRoot = Join-Path $WorkRoot "agency-os"

if (-not $ReportMonth) { $ReportMonth = (Get-Date).ToString("yyyy-MM") }

$reportDir = Join-Path $agencyRoot "reports/governance"
if (-not (Test-Path -LiteralPath $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }
$reportPath = Join-Path $reportDir ("impact-matrix-drift-" + $ReportMonth + ".md")

if ((Test-Path -LiteralPath $reportPath) -and -not $Force) {
    Write-Host "Report for $ReportMonth already exists at $reportPath. Use -Force to overwrite." -ForegroundColor Yellow
    exit 0
}

$matrixPath = Join-Path $agencyRoot "docs/CHANGE_IMPACT_MATRIX.md"
if (-not (Test-Path -LiteralPath $matrixPath)) {
    $lines = @(
        "# Change Impact Matrix Drift - $ReportMonth"
        ""
        "- Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
        "- Status: **FAIL** (docs/CHANGE_IMPACT_MATRIX.md missing; cannot continue)"
    )
    Set-Content -LiteralPath $reportPath -Value ($lines -join "`n") -Encoding UTF8
    Write-Host "Drift report written: $reportPath" -ForegroundColor Red
    exit 2
}

# ---------- Resolve a matrix path string to a real file ----------
# Most matrix paths are written relative to agency-os/, with a `../` prefix meaning the
# monorepo root (one level above agency-os/). But the matrix is not internally consistent
# about this: a handful of entries (bare `CLAUDE.md`, and `agency-os/docs/...`-prefixed
# paths inside rows whose OWN main doc is monorepo-root-relative, e.g. `../README.md`'s
# impacted list) are written relative to the monorepo root directly, with no `../` marker
# at all -- confirmed by real execution against this repo (first version of this script
# false-skipped both). Rather than special-case those specific rows (a patch that breaks
# again the next time someone adds a new root-relative entry), this tries BOTH plausible
# bases in order and accepts whichever actually resolves to a real file: agency-os/-
# relative first (the majority convention), then monorepo-root-relative as a fallback.
# Windows-absolute paths (the one literal `C:\Users\USER\...` placeholder in the matrix,
# or any other drive-letter path) are never part of this repo's tracked tree and skip
# straight to $null -- this function's job is "find a real file or say clearly it
# couldn't", never guess.
function Resolve-MatrixPath {
    param([string]$RawPath, [string]$AgencyRoot, [string]$RepoRoot)
    $p = $RawPath.Trim()
    if (-not $p) { return $null }
    if ($p -match '^[A-Za-z]:[\\/]') { return $null }
    $p = $p -replace '\\', '/'
    $resolved = $null
    foreach ($base in @($AgencyRoot, $RepoRoot)) {
        $candidate = Join-Path $base $p
        try {
            $hit = Resolve-Path -LiteralPath $candidate -ErrorAction SilentlyContinue
        } catch { $hit = $null }
        if ($hit) { $resolved = $hit; break }
    }
    if (-not $resolved) { return $null }
    if (-not (Test-Path -LiteralPath $resolved.Path -PathType Leaf)) { return $null }
    return $resolved.Path
}

# Cursor was retired on 2026-08-26. Keep its historical rows in the matrix for
# traceability, but do not treat retired Cursor assets as live synchronization
# targets. They are recorded in the report's skipped section rather than silently
# discarded, so retirement remains auditable and the current Claude Code/Codex SSOT
# is not forced to chase an obsolete IDE mirror.
$retiredMatrixPathPatterns = @(
    '(^|/)\.cursor/',
    '(^|/)docs/spec/raw/Cursor  Rules for AI/'
)

function Test-RetiredMatrixPath {
    param([string]$RawPath)
    $normalized = ($RawPath.Trim() -replace '\\', '/').ToLowerInvariant()
    foreach ($pattern in $retiredMatrixPathPatterns) {
        if ($normalized -match $pattern.ToLowerInvariant()) { return $true }
    }
    return $false
}

# ---------- Parse the matrix table ----------
# Deliberately backtick-only extraction -- see script header for why. `[regex]::Matches`
# on each column independently means a row's left column keeps only its FIRST backtick
# span (trailing prose annotations like `（monorepo 根）` are never candidates), while the
# right column keeps EVERY backtick span found, however many prose/full-width-comma-
# separated annotations sit between them.
$utf8 = [System.Text.UTF8Encoding]::new($false)
$matrixLines = [System.IO.File]::ReadAllLines($matrixPath, $utf8)
$rowPattern = '^\|(.+)\|(.+)\|\s*$'
$backtickPattern = '`([^`]+)`'

$pairs = New-Object System.Collections.Generic.List[object]
$skipped = New-Object System.Collections.Generic.List[object]
$rowsParsed = 0

foreach ($line in $matrixLines) {
    if ($line -notmatch $rowPattern) { continue }
    $col1 = $Matches[1]
    $col2 = $Matches[2]
    # Skip the header row and the `|---|---|` separator row.
    if ($col1.Trim() -eq '主文件' -or $col1 -match '^\s*-+\s*$') { continue }

    $mainMatch = [regex]::Match($col1, $backtickPattern)
    if (-not $mainMatch.Success) { continue }
    $mainRaw = $mainMatch.Groups[1].Value
    $rowsParsed++

    $impactedRaws = @([regex]::Matches($col2, $backtickPattern) | ForEach-Object { $_.Groups[1].Value })
    if ($impactedRaws.Count -eq 0) { continue }

    $mainResolved = Resolve-MatrixPath -RawPath $mainRaw -AgencyRoot $agencyRoot -RepoRoot $WorkRoot
    if (-not $mainResolved) {
        $skipped.Add([pscustomobject]@{ Main = $mainRaw; Impacted = '(main file itself)'; Reason = 'main path did not resolve to an existing file' }) | Out-Null
        continue
    }
    $mainMtime = (Get-Item -LiteralPath $mainResolved).LastWriteTimeUtc

    foreach ($impRaw in $impactedRaws) {
        if ((Test-RetiredMatrixPath -RawPath $mainRaw) -or (Test-RetiredMatrixPath -RawPath $impRaw)) {
            $skipped.Add([pscustomobject]@{
                Main = $mainRaw
                Impacted = $impRaw
                Reason = 'retired Cursor asset; current SSOT is CLAUDE.md + agency-os/AGENTS.md'
            }) | Out-Null
            continue
        }
        $impResolved = Resolve-MatrixPath -RawPath $impRaw -AgencyRoot $agencyRoot -RepoRoot $WorkRoot
        if (-not $impResolved) {
            $skipped.Add([pscustomobject]@{ Main = $mainRaw; Impacted = $impRaw; Reason = 'impacted path did not resolve to an existing file' }) | Out-Null
            continue
        }
        # A doc legitimately lists itself among its own impacted files in a few rows
        # (self-referential "review docs/CHANGE_IMPACT_MATRIX.md too" entries) -- same
        # file compared to itself is always zero drift, not worth a pair record.
        if ($impResolved -eq $mainResolved) { continue }
        $impMtime = (Get-Item -LiteralPath $impResolved).LastWriteTimeUtc
        $driftDays = [math]::Round(($mainMtime - $impMtime).TotalDays, 1)
        $pairs.Add([pscustomobject]@{
            Main         = $mainRaw
            Impacted     = $impRaw
            MainMtime    = $mainMtime
            ImpactedMtime = $impMtime
            DriftDays    = $driftDays
        }) | Out-Null
    }
}

if ($rowsParsed -eq 0) {
    $lines = @(
        "# Change Impact Matrix Drift - $ReportMonth"
        ""
        "- Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
        "- Status: **FAIL** (parsed 0 rows from docs/CHANGE_IMPACT_MATRIX.md -- table format may have changed; this script's row regex needs updating)"
    )
    Set-Content -LiteralPath $reportPath -Value ($lines -join "`n") -Encoding UTF8
    Write-Host "Drift report written: $reportPath" -ForegroundColor Red
    exit 2
}

# ---------- Classify pairs, only counting one-directional drift (main newer) ----------
# A right file being NEWER than its main doc is not drift by this relationship's own
# logic -- the impacted file was reviewed/updated at least as recently as the trigger.
# Only "main changed, impacted file did not catch up" is the failure mode this exists
# to catch (exactly what happened to TOOL_TRIGGER_MAP.md).
$warnPairs = @($pairs | Where-Object { $_.DriftDays -gt $DriftWarnDays -and $_.DriftDays -le $DriftFailDays })
$failPairs = @($pairs | Where-Object { $_.DriftDays -gt $DriftFailDays })

$worst = "PASS"
if ($failPairs.Count -gt 0) { $worst = "FAIL" }
elseif ($warnPairs.Count -gt 0) { $worst = "WARN" }

# ---------- Report ----------
$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("# Change Impact Matrix Drift - $ReportMonth") | Out-Null
$summary.Add("") | Out-Null
$summary.Add("- Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")) | Out-Null
$summary.Add("- Overall: **$worst**") | Out-Null
$summary.Add("- Rows parsed: $rowsParsed | Pairs checked: $($pairs.Count) | Pairs skipped (unresolved path): $($skipped.Count)") | Out-Null
$summary.Add("- Thresholds: WARN > $DriftWarnDays days, FAIL > $DriftFailDays days (one-directional: main doc newer than impacted file)") | Out-Null
$summary.Add("") | Out-Null

$summary.Add("## Flagged pairs ($($warnPairs.Count) WARN, $($failPairs.Count) FAIL)") | Out-Null
$summary.Add("") | Out-Null
if ($failPairs.Count -eq 0 -and $warnPairs.Count -eq 0) {
    $summary.Add("None. Every resolvable pair is within $DriftWarnDays days.") | Out-Null
} else {
    $summary.Add("| Severity | 主文件 | Impacted | 主文件 mtime (UTC) | Impacted mtime (UTC) | Drift (days) |") | Out-Null
    $summary.Add("|----------|--------|----------|---------------------|------------------------|---------------|") | Out-Null
    foreach ($p in ($failPairs | Sort-Object DriftDays -Descending)) {
        $summary.Add("| FAIL | ``$($p.Main)`` | ``$($p.Impacted)`` | $($p.MainMtime.ToString('yyyy-MM-dd')) | $($p.ImpactedMtime.ToString('yyyy-MM-dd')) | $($p.DriftDays) |") | Out-Null
    }
    foreach ($p in ($warnPairs | Sort-Object DriftDays -Descending)) {
        $summary.Add("| WARN | ``$($p.Main)`` | ``$($p.Impacted)`` | $($p.MainMtime.ToString('yyyy-MM-dd')) | $($p.ImpactedMtime.ToString('yyyy-MM-dd')) | $($p.DriftDays) |") | Out-Null
    }
}
$summary.Add("") | Out-Null

if ($skipped.Count -gt 0) {
    $summary.Add("## Skipped ($($skipped.Count) entries -- path did not resolve to an existing file)") | Out-Null
    $summary.Add("") | Out-Null
    $summary.Add("Not an error: template placeholders (`專案 X.md`), non-existent-yet docs, and the one intentional") | Out-Null
    $summary.Add("Windows-absolute path in the matrix (`AWARE_WAVE_CREDENTIALS.md`) all land here by design.") | Out-Null
    $summary.Add("") | Out-Null
    $summary.Add("| 主文件 | Raw impacted text | Reason |") | Out-Null
    $summary.Add("|--------|--------------------|--------|") | Out-Null
    foreach ($s in ($skipped | Select-Object -Unique -Property Main,Impacted,Reason)) {
        $summary.Add("| ``$($s.Main)`` | ``$($s.Impacted)`` | $($s.Reason) |") | Out-Null
    }
    $summary.Add("") | Out-Null
}

$summary.Add("## Notes") | Out-Null
$summary.Add("") | Out-Null
$summary.Add("- This is an **informational snapshot**, not a build gate. A flagged pair means the impacted file's content has not been touched since the main doc changed by more than the threshold -- it does NOT prove the impacted file is actually wrong, only that nobody has recently confirmed it is still right.") | Out-Null
$summary.Add("- Root cause this closes: docs/operations/TOOL_TRIGGER_MAP.md drifted 7 weeks stale (2026-07-02 -> 2026-08-24) while AGENTS.md, which declares it as impacted, kept changing -- nothing checked the gap. See agency-os/WORKLOG.md 2026-08-24.") | Out-Null
$summary.Add("- Parser only treats backtick-quoted text as candidate paths (see script header). Prose annotations, template placeholders, and range descriptions in the matrix are intentionally never candidates, not a parsing gap.") | Out-Null
$summary.Add("- Designed for monthly invocation alongside check-governance-docs-drift.ps1 (scripts/ao-resume.ps1 monthly-checks block); also runnable manually anytime.") | Out-Null
$summary.Add("- Owner doc: this script + docs/CHANGE_IMPACT_MATRIX.md. Trigger: ``scripts\check-change-impact-matrix-drift.ps1``.") | Out-Null

$reportText = ($summary -join "`n")
Set-Content -LiteralPath $reportPath -Value $reportText -Encoding UTF8

$latestPath = Join-Path $reportDir "impact-matrix-drift-LATEST.md"
Set-Content -LiteralPath $latestPath -Value $reportText -Encoding UTF8

$statusDir = Join-Path $agencyRoot "reports/status"
$null = New-Item -ItemType Directory -Force -Path $statusDir
Set-Content -LiteralPath (Join-Path $statusDir "impact-matrix-drift-LATEST.md") -Value $reportText -Encoding UTF8

Write-Host "Drift report written: $reportPath" -ForegroundColor $(if ($worst -eq "PASS") { "Green" } elseif ($worst -eq "WARN") { "Yellow" } else { "Red" })
Write-Host "Overall: $worst  (rows=$rowsParsed pairs=$($pairs.Count) warn=$($warnPairs.Count) fail=$($failPairs.Count) skipped=$($skipped.Count))"

exit $(if ($worst -eq "FAIL") { 2 } elseif ($worst -eq "WARN") { 1 } else { 0 })
