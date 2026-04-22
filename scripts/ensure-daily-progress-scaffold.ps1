<#
.SYNOPSIS
  Ensures today's WORKLOG heading and memory/daily note exist (minimal scaffold).

.DESCRIPTION
  Mechanical only — no LLM. Creates empty structure so AO-CLOSE / recap are not
  misleading "missing files" when the operator only ran the script.
  Inbox merge is merge-closeout-inbox-into-progress.ps1 (called from ao-close.ps1).
#>
param(
    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

$today = (Get-Date).ToString("yyyy-MM-dd")
$agencyRoot = Join-Path $WorkRoot "agency-os"
$worklogPath = Join-Path $agencyRoot "WORKLOG.md"
$dailyDir = Join-Path $agencyRoot "memory\daily"
$dailyPath = Join-Path $dailyDir "$today.md"
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Write-Utf8NoBomFile {
    param([string]$Path, [string]$Content)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

$did = $false

if (Test-Path -LiteralPath $worklogPath) {
    $todayHeader = "## $today"
    $lines = [System.IO.File]::ReadAllLines($worklogPath, $utf8)
    $hasToday = $false
    foreach ($ln in $lines) {
        if ($ln.Trim() -eq $todayHeader) {
            $hasToday = $true
            break
        }
    }
    if (-not $hasToday) {
        $insertAt = -1
        for ($i = 0; $i -lt $lines.Length; $i++) {
            if ($lines[$i] -match '^\s*##\s+\d{4}-\d{2}-\d{2}\s*$') {
                $insertAt = $i
                break
            }
        }
        $block = @(
            $todayHeader,
            "",
            "### Daily",
            "- (TBD)",
            ""
        )
        if ($insertAt -lt 0) {
            $newLines = @($lines) + @("") + $block
        } elseif ($insertAt -eq 0) {
            $newLines = $block + $lines
        } else {
            $before = $lines[0..($insertAt - 1)]
            $after = $lines[$insertAt..($lines.Length - 1)]
            $newLines = @($before) + $block + @($after)
        }
        Write-Utf8NoBomFile -Path $worklogPath -Content (($newLines -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine)
        Write-Host "ensure-daily-progress-scaffold: inserted WORKLOG $todayHeader" -ForegroundColor Green
        $did = $true
    }
} else {
    Write-Warning "ensure-daily-progress-scaffold: WORKLOG.md missing at $worklogPath (skipped)"
}

if (-not (Test-Path -LiteralPath $dailyPath)) {
    New-Item -ItemType Directory -Force -Path $dailyDir | Out-Null
    $dailyBody = @(
        "# Daily Note - $today",
        "",
        "## Done today",
        "- (TBD)",
        "",
        "## Current state",
        "- (TBD)",
        "",
        "## Next steps",
        "- (TBD)",
        ""
    ) -join [Environment]::NewLine
    Write-Utf8NoBomFile -Path $dailyPath -Content $dailyBody
    Write-Host "ensure-daily-progress-scaffold: created $dailyPath" -ForegroundColor Green
    $did = $true
}

if (-not $did) {
    Write-Host "ensure-daily-progress-scaffold: already present (WORKLOG + daily)" -ForegroundColor DarkGray
}

exit 0
