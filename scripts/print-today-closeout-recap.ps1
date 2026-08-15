param(
    [string]$WorkRoot = ""
)

# Prints mechanical "what happened since last AO-CLOSE" hints for Claude.
# Safe read-only: git log / status / WORKLOG / memory/daily.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Pattern A: save/restore [Console]::OutputEncoding around each external capture.
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

# chcp 65001 retained for PS5 terminal display of CJK in Write-Host output.
# [Console]::OutputEncoding is now managed per-capture via Invoke-WithUtf8Console.
if ($PSVersionTable.PSVersion.Major -lt 7) {
    try { chcp 65001 | Out-Null } catch {}
}

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

$today       = (Get-Date).ToString("yyyy-MM-dd")
$agencyRoot  = Join-Path $WorkRoot "agency-os"
$worklogPath = Join-Path $agencyRoot "WORKLOG.md"
$dailyPath   = Join-Path $agencyRoot "memory\daily\$today.md"
$utf8        = [System.Text.UTF8Encoding]::new($false)

# --- Determine since-timestamp from last AO-RESUME stamp ---
# The recap window is "last AO-RESUME → this AO-CLOSE", matching how work is actually structured.
$resumeStampPath = Join-Path $WorkRoot "agency-os\.agency-state\ao-resume-last.txt"
$sinceLabel    = "local calendar day"
$sinceParam    = (Get-Date).Date.ToString("yyyy-MM-dd HH:mm:ss")
$lastResumeDate = $today   # fallback: only today's WORKLOG section

if (Test-Path -LiteralPath $resumeStampPath) {
    $rawStamp = (Get-Content -LiteralPath $resumeStampPath -Raw -Encoding UTF8).Trim()
    if ($rawStamp -match '^\d{4}-\d{2}-\d{2}') {
        $sinceParam     = $rawStamp
        $sinceLabel     = "last AO-RESUME ($rawStamp)"
        # Extract just the date part for WORKLOG section matching
        $lastResumeDate = $rawStamp.Substring(0, 10)
    }
}

Write-Host ""
Write-Host "== Session recap (last AO-RESUME → AO-CLOSE; since $sinceLabel; local date $today) ==" -ForegroundColor Cyan
Write-Host "Use this to fill WORKLOG / TASKS / pending-task-completions (no need to memorize)." -ForegroundColor DarkGray
Write-Host ""

Push-Location $WorkRoot
try {
    $null = Invoke-WithUtf8Console { git rev-parse --git-dir 2>$null }
    $inGit = ($LASTEXITCODE -eq 0)
    if ($inGit) {
        $branch = (Invoke-WithUtf8Console { git rev-parse --abbrev-ref HEAD }).Trim()
        Write-Host ("Git branch: {0}" -f $branch) -ForegroundColor DarkGray
        $st = (Invoke-WithUtf8Console { git status -sb }).Trim()
        foreach ($ln in ($st -split "`n")) {
            Write-Host ("  {0}" -f $ln)
        }
        Write-Host ""
        Write-Host "Commits since last AO-CLOSE (newest first):" -ForegroundColor Yellow
        $commits = @(Invoke-WithUtf8Console {
            git log --since="$sinceParam" --pretty=format:"%h %s" 2>$null
        } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($commits.Count -eq 0) {
            Write-Host "  (none — all commits pre-date last AO-CLOSE or nothing new)" -ForegroundColor DarkGray
        } else {
            $max = [Math]::Min(35, $commits.Count)
            for ($i = 0; $i -lt $max; $i++) {
                Write-Host ("  {0}" -f $commits[$i])
            }
            if ($commits.Count -gt $max) {
                Write-Host ("  ... and {0} more (see git log)" -f ($commits.Count - $max)) -ForegroundColor DarkGray
            }
        }
    } else {
        Write-Host "(not a git repo — skipped git section)" -ForegroundColor DarkYellow
    }
} finally {
    Pop-Location
}

# --- WORKLOG: show all ## yyyy-MM-dd sections from lastCloseDate through today ---
Write-Host ""
Write-Host "WORKLOG sections since ${lastResumeDate} (last AO-RESUME):" -ForegroundColor Yellow
if (-not (Test-Path -LiteralPath $worklogPath)) {
    Write-Host "  (WORKLOG.md missing)" -ForegroundColor DarkYellow
} else {
    $wl = [System.IO.File]::ReadAllLines($worklogPath, $utf8)

    # Collect all ## yyyy-MM-dd headers between lastCloseDate and today (inclusive)
    $datePattern = '^##\s+(\d{4}-\d{2}-\d{2})\s*$'
    $sectionsToShow = [System.Collections.Generic.List[string]]::new()
    $inSection = $false
    $sectionLines = [System.Collections.Generic.List[string]]::new()
    $currentSectionDate = ""

    for ($i = 0; $i -lt $wl.Length; $i++) {
        $line = $wl[$i]
        if ($line -match $datePattern) {
            # Flush previous section if it qualifies
            if ($inSection -and $currentSectionDate -ge $lastResumeDate -and $currentSectionDate -le $today) {
                $sectionsToShow.AddRange($sectionLines)
            }
            $currentSectionDate = $matches[1]
            $inSection = $true
            $sectionLines = [System.Collections.Generic.List[string]]::new()
            $sectionLines.Add($line)
        } elseif ($inSection) {
            # Stop collecting if we hit a non-date top-level header (## that is not a date)
            if ($line -match '^##\s+' -and $line -notmatch $datePattern) {
                if ($currentSectionDate -ge $lastResumeDate -and $currentSectionDate -le $today) {
                    $sectionsToShow.AddRange($sectionLines)
                }
                $inSection = $false
                $sectionLines = [System.Collections.Generic.List[string]]::new()
            } else {
                $sectionLines.Add($line)
            }
        }
    }
    # Flush final section
    if ($inSection -and $currentSectionDate -ge $lastResumeDate -and $currentSectionDate -le $today) {
        $sectionsToShow.AddRange($sectionLines)
    }

    if ($sectionsToShow.Count -eq 0) {
        Write-Host "  (no WORKLOG sections found between $lastResumeDate and $today)" -ForegroundColor DarkYellow
    } else {
        $cap = 80
        $n = [Math]::Min($cap, $sectionsToShow.Count)
        for ($k = 0; $k -lt $n; $k++) {
            $l = $sectionsToShow[$k]
            if ($l.Trim().Length -gt 0) { Write-Host ("  {0}" -f $l) }
        }
        if ($sectionsToShow.Count -gt $cap) {
            Write-Host ("  ... ({0} more lines in WORKLOG)" -f ($sectionsToShow.Count - $cap)) -ForegroundColor DarkGray
        }
    }
}

# --- Daily note: show today's file ---
Write-Host ""
Write-Host "memory/daily/$today.md:" -ForegroundColor Yellow
if (-not (Test-Path -LiteralPath $dailyPath)) {
    Write-Host "  (file not created yet — OK for Autopilot to add at closeout)" -ForegroundColor DarkGray
} else {
    $dl = @(Get-Content -LiteralPath $dailyPath -Encoding UTF8)
    $tail = [Math]::Min(20, $dl.Length)
    if ($tail -eq 0) {
        Write-Host "  (empty)" -ForegroundColor DarkGray
    } else {
        for ($i = $dl.Length - $tail; $i -lt $dl.Length; $i++) {
            Write-Host ("  {0}" -f $dl[$i])
        }
    }
}

Write-Host ""
exit 0
