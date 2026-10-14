# append-agent-dispatch-to-worklog.ps1
# Reads today's agent-dispatch JSONL and appends a summary block to WORKLOG.md.
# Idempotent: skips if block already present. Always exits 0 (non-blocking).
# Called by: scripts/ao-close.ps1 (after apply-closeout-task-checkmarks, before git add)

param([string]$WorkRoot = "")

$ErrorActionPreference = "SilentlyContinue"

if (-not $WorkRoot) {
    # scripts\ sits directly under the monorepo root (the only scripts tree).
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}
if (-not $WorkRoot) { exit 0 }

$today       = Get-Date
$dateKey     = $today.ToString("yyyy-MM-dd")
$dateStamp   = $today.ToString("yyyyMMdd")
$jsonlPath   = Join-Path $WorkRoot "agency-os\reports\agent-dispatch\dispatch-${dateStamp}.jsonl"
$worklogPath = Join-Path $WorkRoot "agency-os\WORKLOG.md"

if (-not (Test-Path -LiteralPath $jsonlPath))   { exit 0 }
if (-not (Test-Path -LiteralPath $worklogPath)) { exit 0 }

# Parse JSONL
$records = [System.Collections.Generic.List[object]]::new()
$rawLines = Get-Content -LiteralPath $jsonlPath -Encoding UTF8 -ErrorAction SilentlyContinue
foreach ($rawLine in $rawLines) {
    $trimmed = $rawLine.Trim()
    if ($trimmed) {
        try {
            $obj = $trimmed | ConvertFrom-Json
            $records.Add($obj)
        } catch {}
    }
}
if ($records.Count -eq 0) { exit 0 }

$worklog     = Get-Content -LiteralPath $worklogPath -Raw -Encoding UTF8
$todayHeader = "## $dateKey"
$blockMarker = "### Agent"

# Idempotency: if block already written today, skip
$todayIdx = $worklog.IndexOf($todayHeader)
if ($todayIdx -ge 0) {
    $nextIdx = $worklog.IndexOf("`n## ", $todayIdx + 4)
    $todaySection = ""
    if ($nextIdx -ge 0) {
        $todaySection = $worklog.Substring($todayIdx, $nextIdx - $todayIdx)
    } else {
        $todaySection = $worklog.Substring($todayIdx)
    }
    if ($todaySection.Contains($blockMarker)) {
        Write-Host "  agent-dispatch: block already present, skip" -ForegroundColor DarkGray
        exit 0
    }
}

# Build summary block
$nl = "`n"
$blockLines = [System.Collections.Generic.List[string]]::new()
$blockLines.Add("")
$blockLines.Add("### Agent dispatch log")
foreach ($r in $records) {
    $agent  = if ($r.PSObject.Properties["agent"]          -and $r.agent)          { $r.agent }          else { "unknown" }
    $desc   = if ($r.PSObject.Properties["description"]    -and $r.description)    { $r.description }    else { "(no description)" }
    $result = if ($r.PSObject.Properties["result_snippet"] -and $r.result_snippet) { " -> $($r.result_snippet)" } else { "" }
    $blockLines.Add("- ${agent}: ${desc}${result}")
}
$block = [string]::Join($nl, $blockLines)

# Insert into worklog
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$newWorklog = ""
if ($todayIdx -ge 0) {
    $nextIdx = $worklog.IndexOf("`n## ", $todayIdx + 4)
    if ($nextIdx -ge 0) {
        $newWorklog = $worklog.Substring(0, $nextIdx) + $nl + $block + $worklog.Substring($nextIdx)
    } else {
        $newWorklog = $worklog.TrimEnd() + $nl + $block + $nl
    }
} else {
    $firstNL = $worklog.IndexOf($nl)
    if ($firstNL -ge 0) {
        $newWorklog = $worklog.Substring(0, $firstNL + 1) + $nl + $todayHeader + $nl + $block + $nl + $nl + $worklog.Substring($firstNL + 1)
    } else {
        $newWorklog = $nl + $todayHeader + $nl + $block + $nl
    }
}

[System.IO.File]::WriteAllText($worklogPath, $newWorklog, $utf8NoBom)
Write-Host "  agent-dispatch: $($records.Count) records written to WORKLOG ($dateKey)" -ForegroundColor Green
exit 0
