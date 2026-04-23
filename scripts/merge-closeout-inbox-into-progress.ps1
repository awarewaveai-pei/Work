<#
.SYNOPSIS
  Verbatim merge of closeout-inbox into WORKLOG + memory/daily + CONVERSATION_MEMORY pointer; reset inbox from template.

.DESCRIPTION
  ASCII-only script body for Windows PowerShell 5.1. UTF-8 no BOM for .md writes.
  Inbox file uses the *last* "---" in the file; everything after that line is the payload. Convention:
  new "### ..." blocks are **prepended** immediately after that "---" (newest entry first, older blocks below).
  Skips: sections ### merged-to-worklog*, ### example-agent*. Drops any text before the first "###" in the
  tail (legacy templates that put instructions between "---" and the first block).
  Idempotent per SHA256 of payload.
  CONVERSATION_MEMORY: one bullet under ## Current Operating Context (pointer to WORKLOG); not a full distill.
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
$stateDir = Join-Path $agencyRoot ".agency-state"
$inboxPath = Join-Path $stateDir "closeout-inbox.md"
$templatePath = Join-Path $agencyRoot "docs\operations\closeout-inbox-TEMPLATE.md"
$worklogPath = Join-Path $agencyRoot "WORKLOG.md"
$dailyPath = Join-Path $agencyRoot "memory\daily\$today.md"
$convPath = Join-Path $agencyRoot "memory\CONVERSATION_MEMORY.md"
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Write-Utf8NoBomFile {
    param([string]$Path, [string]$Content)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Get-LastFencedDashIndex {
    param([string[]]$Lines)
    $last = -1
    for ($i = 0; $i -lt $Lines.Length; $i++) {
        if ($Lines[$i].Trim() -eq "---") {
            $last = $i
        }
    }
    return $last
}

function Get-InboxPayloadSections {
    param([string[]]$TailLines)
    $sections = New-Object "System.Collections.Generic.List[string]"
    $buf = New-Object "System.Collections.Generic.List[string]"
    foreach ($line in $TailLines) {
        if ($line -match '^\s*###\s+') {
            if ($buf.Count -gt 0) {
                $sections.Add(($buf.ToArray() -join [Environment]::NewLine))
                $buf.Clear() | Out-Null
            }
        }
        $buf.Add($line) | Out-Null
    }
    if ($buf.Count -gt 0) {
        $sections.Add(($buf.ToArray() -join [Environment]::NewLine))
    }
    return ,$sections.ToArray()
}

function Section-ShouldSkip {
    param([string]$Block)
    $first = ($Block -split [Environment]::NewLine, 2)[0].Trim()
    if ($first -match '^(?i)###\s+merged-to-worklog') {
        return $true
    }
    if ($first -match '^(?i)###\s+example-agent') {
        return $true
    }
    return $false
}

function Get-WorklogTodayBounds {
    param([string[]]$Lines, [string]$DateStr)
    $hdr = "## $DateStr"
    $start = -1
    for ($i = 0; $i -lt $Lines.Length; $i++) {
        if ($Lines[$i].Trim() -eq $hdr) {
            $start = $i
            break
        }
    }
    if ($start -lt 0) {
        return $null
    }
    $end = $Lines.Length
    for ($j = $start + 1; $j -lt $Lines.Length; $j++) {
        if ($Lines[$j] -match '^\s*##\s+\d{4}-\d{2}-\d{2}\s*$') {
            $end = $j
            break
        }
    }
    return @{ Start = $start; End = $end }
}

if (-not (Test-Path -LiteralPath $inboxPath)) {
    Write-Host "merge-closeout-inbox: no inbox file (skip)" -ForegroundColor DarkGray
    exit 0
}

$inboxLines = [System.IO.File]::ReadAllLines($inboxPath, $utf8)
$dash = Get-LastFencedDashIndex -Lines $inboxLines
if ($dash -lt 0) {
    Write-Host "merge-closeout-inbox: no --- separator (skip)" -ForegroundColor DarkGray
    exit 0
}

$tail = @()
if ($dash + 1 -lt $inboxLines.Length) {
    $tail = $inboxLines[($dash + 1)..($inboxLines.Length - 1)]
}
# If legacy/accidental prose appears before the first ### in the tail, drop it (do not merge into WORKLOG).
$firstH3 = -1
for ($ti = 0; $ti -lt $tail.Length; $ti++) {
    if ($tail[$ti] -match '^\s*###\s+') {
        $firstH3 = $ti
        break
    }
}
if ($firstH3 -gt 0) {
    $tail = $tail[$firstH3..($tail.Length - 1)]
}

$sections = Get-InboxPayloadSections -TailLines $tail
$keep = New-Object "System.Collections.Generic.List[string]"
foreach ($s in $sections) {
    $t = $s.Trim()
    if ($t.Length -eq 0) {
        continue
    }
    if (Section-ShouldSkip -Block $s) {
        continue
    }
    $keep.Add($s) | Out-Null
}

if ($keep.Count -eq 0) {
    Write-Host "merge-closeout-inbox: no mergeable sections after filters (skip)" -ForegroundColor DarkGray
    exit 0
}

$payload = ($keep.ToArray() -join ([Environment]::NewLine + [Environment]::NewLine)).Trim()
if ($payload.Length -eq 0) {
    exit 0
}

$modifiedTargets = New-Object "System.Collections.Generic.List[string]"

$sha = [System.Security.Cryptography.SHA256]::Create()
$hashHex = [BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($payload))).Replace("-", "").ToLowerInvariant()
$marker = "<!-- ao-close-inbox-sha256:$hashHex -->"

if (-not (Test-Path -LiteralPath $worklogPath)) {
    Write-Warning "merge-closeout-inbox: WORKLOG missing (skip)"
    exit 0
}

$wlRaw = [System.IO.File]::ReadAllText($worklogPath, $utf8)
if ($wlRaw.Contains($marker)) {
    Write-Host "merge-closeout-inbox: same payload already merged (skip)" -ForegroundColor DarkGray
    exit 0
}

$wlLines = [System.IO.File]::ReadAllLines($worklogPath, $utf8)
$bounds = Get-WorklogTodayBounds -Lines $wlLines -DateStr $today
if ($null -eq $bounds) {
    Write-Warning "merge-closeout-inbox: no WORKLOG section for $today (run scaffold first)"
    exit 1
}

$mergeBlock = @(
    "",
    "### Closeout inbox (AO-CLOSE auto, verbatim)",
    $marker,
    "",
    $payload,
    ""
)
$insertAt = $bounds.End
$before = @()
if ($insertAt -gt 0) {
    $before = $wlLines[0..($insertAt - 1)]
}
$after = @()
if ($insertAt -lt $wlLines.Length) {
    $after = $wlLines[$insertAt..($wlLines.Length - 1)]
}
$newWl = @($before) + $mergeBlock + $after
Write-Utf8NoBomFile -Path $worklogPath -Content (($newWl -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine)
Write-Host "merge-closeout-inbox: appended to WORKLOG $today" -ForegroundColor Green
$modifiedTargets.Add("agency-os/WORKLOG.md (inbox verbatim block)") | Out-Null

if (Test-Path -LiteralPath $dailyPath) {
    $dailyRaw = [System.IO.File]::ReadAllText($dailyPath, $utf8)
    if (-not $dailyRaw.Contains($marker)) {
        $append = @(
            "",
            "## Closeout inbox (AO-CLOSE auto, verbatim)",
            $marker,
            "",
            $payload,
            ""
        ) -join [Environment]::NewLine
        Write-Utf8NoBomFile -Path $dailyPath -Content ($dailyRaw.TrimEnd() + [Environment]::NewLine + $append)
        Write-Host "merge-closeout-inbox: appended to memory/daily/$today.md" -ForegroundColor Green
        $modifiedTargets.Add("agency-os/memory/daily/$today.md (inbox verbatim block)") | Out-Null
    }
} else {
    Write-Host "merge-closeout-inbox: daily note missing (WORKLOG only)" -ForegroundColor DarkYellow
}

$convMarker = "<!-- ao-close-conv-inbox:$hashHex -->"
if (Test-Path -LiteralPath $convPath) {
    $convRaw = [System.IO.File]::ReadAllText($convPath, $utf8)
    if ($convRaw.Contains($convMarker)) {
        Write-Host "merge-closeout-inbox: CONVERSATION_MEMORY already has pointer for this payload (skip)" -ForegroundColor DarkGray
    } else {
        $convLines = [System.IO.File]::ReadAllLines($convPath, $utf8)
        $sectionHeading = "## Current Operating Context"
        $insertIdx = -1
        for ($ci = 0; $ci -lt $convLines.Length; $ci++) {
            if ($convLines[$ci].Trim() -eq $sectionHeading) {
                $insertIdx = $ci + 1
                break
            }
        }
        $bullet = "- **" + $today + " (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## " + $today + ' / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". ' + $convMarker
        if ($insertIdx -lt 0) {
            $append = @(
                "",
                "## AO-CLOSE inbox pointer",
                "",
                $bullet,
                ""
            ) -join [Environment]::NewLine
            Write-Utf8NoBomFile -Path $convPath -Content ($convRaw.TrimEnd() + [Environment]::NewLine + $append)
            Write-Warning "merge-closeout-inbox: CONVERSATION_MEMORY missing '## Current Operating Context'; appended ## AO-CLOSE inbox pointer"
        } else {
            $beforeC = @()
            if ($insertIdx -gt 0) {
                $beforeC = $convLines[0..($insertIdx - 1)]
            }
            $afterC = @()
            if ($insertIdx -le ($convLines.Length - 1)) {
                $afterC = $convLines[$insertIdx..($convLines.Length - 1)]
            }
            $newConv = @($beforeC) + $bullet + $afterC
            Write-Utf8NoBomFile -Path $convPath -Content (($newConv -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine)
        }
        Write-Host "merge-closeout-inbox: CONVERSATION_MEMORY updated (pointer line)" -ForegroundColor Green
        $modifiedTargets.Add("agency-os/memory/CONVERSATION_MEMORY.md (one AO-CLOSE pointer line)") | Out-Null
    }
} else {
    Write-Host "merge-closeout-inbox: CONVERSATION_MEMORY.md missing (skip)" -ForegroundColor DarkGray
}

if (Test-Path -LiteralPath $templatePath) {
    Copy-Item -LiteralPath $templatePath -Destination $inboxPath -Force
    Write-Host "merge-closeout-inbox: inbox reset from TEMPLATE" -ForegroundColor Green
    $modifiedTargets.Add("agency-os/.agency-state/closeout-inbox.md (reset from TEMPLATE)") | Out-Null
} else {
    $stub = "# Closeout inbox`n`nAppend-only. Template missing; restore from git.`n"
    Write-Utf8NoBomFile -Path $inboxPath -Content $stub
    Write-Warning "merge-closeout-inbox: TEMPLATE missing; wrote minimal stub inbox"
}

if ($modifiedTargets.Count -gt 0) {
    Write-Host ""
    Write-Host "=== merge-closeout-inbox: FILES TOUCHED (review in git diff) ===" -ForegroundColor Yellow
    foreach ($t in $modifiedTargets) {
        Write-Host "  - $t" -ForegroundColor Yellow
    }
    Write-Host "=== NOT touched: LAST_AO_RESUME_BRIEF.md (AO-RESUME only), SESSION_TEMPLATE.md ===" -ForegroundColor DarkGray
    Write-Host ""
}

exit 0
