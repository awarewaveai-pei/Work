param(
    [string]$WorkRoot = ""
)

# Prints mechanical "what happened today" hints for humans with weak session memory.
# Safe read-only: git log / status / WORKLOG / memory/daily.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -lt 7) {
    try {
        chcp 65001 | Out-Null
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $OutputEncoding = [System.Text.Encoding]::UTF8
    } catch {}
}

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

$today = (Get-Date).ToString("yyyy-MM-dd")
$agencyRoot = Join-Path $WorkRoot "agency-os"
$worklogPath = Join-Path $agencyRoot "WORKLOG.md"
$dailyPath = Join-Path $agencyRoot "memory\daily\$today.md"
$utf8 = [System.Text.UTF8Encoding]::new($false)

Write-Host ""
Write-Host "== Today recap (machine-backed; local date $today) ==" -ForegroundColor Cyan
Write-Host "Use this to fill WORKLOG / TASKS / pending-task-completions (no need to memorize)." -ForegroundColor DarkGray
Write-Host ""

Push-Location $WorkRoot
try {
    $null = git rev-parse --git-dir 2>$null
    $inGit = ($LASTEXITCODE -eq 0)
    if ($inGit) {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        Write-Host ("Git branch: {0}" -f $branch) -ForegroundColor DarkGray
        $st = (git status -sb).Trim()
        foreach ($ln in ($st -split "`n")) {
            Write-Host ("  {0}" -f $ln)
        }
        Write-Host ""
        $sinceLocal = (Get-Date).Date.ToString("yyyy-MM-dd HH:mm:ss")
        Write-Host "Commits today (local calendar day, newest first):" -ForegroundColor Yellow
        $commits = @(git log --since="$sinceLocal" --pretty=format:"%h %s" 2>$null | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($commits.Count -eq 0) {
            Write-Host "  (none on this branch — or only uncommitted / older commits)" -ForegroundColor DarkGray
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

Write-Host ""
Write-Host ("WORKLOG section ## {0}:" -f $today) -ForegroundColor Yellow
if (-not (Test-Path -LiteralPath $worklogPath)) {
    Write-Host "  (WORKLOG.md missing)" -ForegroundColor DarkYellow
} else {
    $wl = [System.IO.File]::ReadAllLines($worklogPath, $utf8)
    $header = "## $today"
    $start = -1
    for ($i = 0; $i -lt $wl.Length; $i++) {
        if ($wl[$i].Trim() -eq $header) { $start = $i; break }
    }
    if ($start -lt 0) {
        Write-Host "  (no '$header' block yet — add ### bullets under it before you forget)" -ForegroundColor DarkYellow
    } else {
        $out = New-Object System.Collections.Generic.List[string]
        for ($j = $start + 1; $j -lt $wl.Length; $j++) {
            if ($wl[$j] -match '^\s*##\s+') { break }
            if ($wl[$j].Trim().Length -gt 0) { $out.Add($wl[$j]) }
        }
        if ($out.Count -eq 0) {
            Write-Host "  (empty under $header — paste what you shipped)" -ForegroundColor DarkYellow
        } else {
            $cap = 45
            $n = [Math]::Min($cap, $out.Count)
            for ($k = 0; $k -lt $n; $k++) {
                Write-Host ("  {0}" -f $out[$k])
            }
            if ($out.Count -gt $cap) {
                Write-Host ("  ... ({0} more lines in WORKLOG)" -f ($out.Count - $cap)) -ForegroundColor DarkGray
            }
        }
    }
}

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
