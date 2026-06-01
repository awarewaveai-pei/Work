<#
.SYNOPSIS
Gate 12d: verify that an AO-RESUME archive was written after the most recent ao-resume stamp.

Exit codes (consumed by system-health-check.ps1 gate 12d):
  0  PASS  — archive exists for this ao-resume session
  1  FAIL  — ao-resume ran but no matching archive found (Claude forgot Step 3)
  2  SKIP  — ao-resume stamp missing (fresh repo or ao-resume never ran)
#>
param (
    [string]$WorkRoot = ""
)

if (-not $WorkRoot) {
    $gitTop = & git rev-parse --show-toplevel 2>$null
    $WorkRoot = if ($gitTop) { $gitTop -replace '/', '\' } else { $PWD.Path }
}
$WorkRoot = $WorkRoot.TrimEnd('\', '/')

$stampPath = Join-Path $WorkRoot "agency-os\.agency-state\ao-resume-last.txt"
if (-not (Test-Path -LiteralPath $stampPath)) {
    Write-Host "verify-aoresume-archive: ao-resume-last.txt not found — skipping (fresh repo or ao-resume never ran)."
    exit 2
}

$stampUtcStr = (Get-Content -LiteralPath $stampPath -Raw -Encoding UTF8).Trim()
try {
    $stampUtc = [DateTime]::Parse($stampUtcStr, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
} catch {
    Write-Host "verify-aoresume-archive: cannot parse stamp '$stampUtcStr' — skipping."
    exit 2
}

# Archive filenames use local CST (UTC+8). Convert stamp to CST for comparison.
$stampCst = $stampUtc.AddHours(8)
$stampCstStr = $stampCst.ToString("yyyy-MM-dd HH:mm")

$archiveDir = Join-Path $WorkRoot "agency-os\reports\ao-resume"
if (-not (Test-Path -LiteralPath $archiveDir)) {
    Write-Host "verify-aoresume-archive: FAIL — archive dir not found: $archiveDir"
    exit 1
}

$archives = @(Get-ChildItem -LiteralPath $archiveDir -Filter "????-??-??-????.md" |
    Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}-\d{4}\.md$' })

if ($archives.Count -eq 0) {
    Write-Host "verify-aoresume-archive: FAIL — no archive files found. AO-RESUME Step 3 (archive) was never run."
    exit 1
}

# Check if any archive filename represents a time >= stamp_cst - 10min grace.
# Archive time is when Claude began Step 1 (always after ao-resume.ps1 wrote the stamp).
$gracePeriod = [TimeSpan]::FromMinutes(10)
$threshold = $stampCst - $gracePeriod
$found = $false
$newestMatch = $null

foreach ($f in ($archives | Sort-Object Name -Descending)) {
    if ($f.Name -match '^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.md$') {
        $fileTimeStr = "$($Matches[1])-$($Matches[2])-$($Matches[3]) $($Matches[4]):$($Matches[5])"
        try {
            $fileTime = [DateTime]::ParseExact($fileTimeStr, "yyyy-MM-dd HH:mm", $null)
            if ($fileTime -ge $threshold) {
                $found = $true
                $newestMatch = $f.Name
                break
            }
        } catch { }
    }
}

if ($found) {
    Write-Host "verify-aoresume-archive: PASS — archive $newestMatch covers ao-resume stamp $stampCstStr CST."
    exit 0
}

$latestFile = ($archives | Sort-Object Name -Descending | Select-Object -First 1).Name
Write-Host "verify-aoresume-archive: FAIL — no archive written since ao-resume stamp $stampCstStr CST."
Write-Host "  Latest archive: $latestFile (older than stamp — Step 3 was skipped)."
Write-Host "  Fix: write the 7-segment report to agency-os/reports/ao-resume/YYYY-MM-DD-HHmm.md"
exit 1
