<#
.SYNOPSIS
Gate 12d: verify that an AO-RESUME archive was written after the most recent ao-resume
stamp AND that its mandatory sections (§0 TL;DR / §6 阻塞與風險 / §7 需你決策) are filled in
(not a surviving AUTO-SKELETON / placeholder). Mechanical enforcement of "必印" sections
(2026-06-09: replaces reliance on Claude self-discipline).

Exit codes (consumed by system-health-check.ps1 gate 12d):
  0  PASS  — archive exists AND mandatory §0/§6/§7 sections are present and filled
  1  FAIL  — no matching archive (Step 3 skipped) OR archive content incomplete
            (surviving skeleton / unfilled placeholder / missing 必印 section)
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
    # --- Content gate (2026-06-09): existence alone is not enough. The mandatory
    # sections (sec0 TL;DR / sec6 blockers-and-risks / sec7 needs-your-decision)
    # must be actually filled in, and the AUTO-SKELETON must have been overwritten.
    # Mechanical enforcement of the "must-print" sections (user: do not trust self-discipline).
    # NOTE: CJK match patterns use \uXXXX escapes so this script stays ASCII-only source
    # (BOM-less .ps1 + CJK literals = CP950 parse-break trap). Header keywords matched:
    #   sec0 = U+4E00 U+53E5 U+8A71 U+7E3D U+7D50 (yi-ju-hua-zong-jie) or "TL;DR"
    #   sec6 = U+963B U+585E U+8207 U+98A8 U+96AA (zu-se-yu-feng-xian)
    #   sec7 = U+9700 U+4F60 U+6C7A U+7B56 (xu-ni-jue-ce)
    #   placeholder = U+FF08 U+5F85 Claude U+586B U+5BEB U+FF09 (skeleton "to be filled by Claude")
    $archivePath = Join-Path $archiveDir $newestMatch
    $content = Get-Content -LiteralPath $archivePath -Raw -Encoding UTF8
    $contentFailures = @()

    if ($content -match '<!--\s*AUTO-SKELETON') {
        $contentFailures += "AUTO-SKELETON placeholder survives (Step 3 skipped - overwrite with the real report)"
    }
    # Build CJK match strings from code points so this source stays ASCII-only
    # (BOM-less .ps1 + literal CJK = CP950 parse-break trap). Code points:
    #   sec0 one-line-summary = U+4E00 U+53E5 U+8A71 U+7E3D U+7D50
    #   sec6 blockers-and-risks = U+963B U+585E U+8207 U+98A8 U+96AA
    #   sec7 needs-your-decision = U+9700 U+4F60 U+6C7A U+7B56
    #   skeleton placeholder tail = "Claude " + U+586B U+5BEB ("...fill in")
    $kwSec0 = -join (@(0x4E00,0x53E5,0x8A71,0x7E3D,0x7D50) | ForEach-Object { [char]$_ })
    $kwSec6 = -join (@(0x963B,0x585E,0x8207,0x98A8,0x96AA) | ForEach-Object { [char]$_ })
    $kwSec7 = -join (@(0x9700,0x4F60,0x6C7A,0x7B56) | ForEach-Object { [char]$_ })
    $kwPlaceholder = 'Claude ' + (-join (@(0x586B,0x5BEB) | ForEach-Object { [char]$_ }))

    if ($content.Contains($kwPlaceholder)) {
        $contentFailures += "unfilled skeleton placeholder remains (a mandatory section was left blank)"
    }
    if (-not ($content.Contains($kwSec0) -or $content.Contains('TL;DR'))) {
        $contentFailures += "sec0 TL;DR (one-line summary) missing - it is mandatory"
    }
    if (-not $content.Contains($kwSec6)) {
        $contentFailures += "sec6 blockers-and-risks missing - it is mandatory"
    }
    if (-not $content.Contains($kwSec7)) {
        $contentFailures += "sec7 needs-your-decision missing - it is mandatory"
    }

    if ($contentFailures.Count -gt 0) {
        Write-Host "verify-aoresume-archive: FAIL - archive $newestMatch exists but content is incomplete:"
        foreach ($cf in $contentFailures) { Write-Host "  - $cf" }
        Write-Host "  Fix: overwrite agency-os/reports/ao-resume/$newestMatch with the real AO-RESUME report (sec0-sec8; sec0/sec6/sec7 mandatory)."
        exit 1
    }

    Write-Host "verify-aoresume-archive: PASS - archive $newestMatch covers ao-resume stamp $stampCstStr CST (mandatory sec0/sec6/sec7 present)."
    exit 0
}

$latestFile = ($archives | Sort-Object Name -Descending | Select-Object -First 1).Name
Write-Host "verify-aoresume-archive: FAIL - no archive written since ao-resume stamp $stampCstStr CST."
Write-Host "  Latest archive: $latestFile (older than stamp - Step 3 was skipped)."
Write-Host "  Fix: write the AO-RESUME report (sec0-sec8) to agency-os/reports/ao-resume/YYYY-MM-DD-HHmm.md"
exit 1
