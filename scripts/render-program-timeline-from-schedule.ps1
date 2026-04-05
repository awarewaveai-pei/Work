# Renders docs/overview/PROGRAM_TIMELINE.md (tables + Mermaid Gantt) from PROGRAM_SCHEDULE.json.
# PS 5.1: keep this file ASCII-only; Chinese copy lives in JSON (section_title, tasks, etc.).
# Invoked by generate-integrated-status-report.ps1 (AO-CLOSE).

param(
    [string]$WorkspaceRoot = "",
    [string]$SchedulePath = "",
    [string]$TimelinePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AgencyRoot {
    param([string]$InputRoot)
    $resolved = $null
    if ($InputRoot -and (Test-Path $InputRoot)) {
        $resolved = (Resolve-Path $InputRoot).Path
    } elseif ($PSScriptRoot) {
        $resolved = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $resolved = (Get-Location).Path
    }
    $agencyCandidate = Join-Path $resolved "agency-os"
    if (Test-Path (Join-Path $agencyCandidate "scripts\render-program-timeline-from-schedule.ps1")) {
        return (Resolve-Path $agencyCandidate).Path
    }
    return $resolved
}

function Format-TableDate {
    param($Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace("$Value")) { return "TBD" }
    return "$Value"
}

function Should-IncludeInGantt {
    param($Task)
    if ($Task.PSObject.Properties.Name -contains "gantt_include") {
        if ($Task.gantt_include -eq $false) { return $false }
    }
    $s = $Task.start
    $e = $Task.end
    if ($null -eq $s -or $null -eq $e) { return $false }
    if ([string]::IsNullOrWhiteSpace("$s") -or [string]::IsNullOrWhiteSpace("$e")) { return $false }
    return $true
}

function Escape-MermaidLabel {
    param([string]$Text)
    if (-not $Text) { return "" }
    return ($Text -replace ':', ' ')
}

$root = Resolve-AgencyRoot -InputRoot $WorkspaceRoot

if (-not $SchedulePath) {
    $SchedulePath = Join-Path $root "docs\overview\PROGRAM_SCHEDULE.json"
}
if (-not $TimelinePath) {
    $TimelinePath = Join-Path $root "docs\overview\PROGRAM_TIMELINE.md"
}

if (-not (Test-Path -LiteralPath $SchedulePath)) {
    Write-Host "render-program-timeline: schedule missing, skip: $SchedulePath" -ForegroundColor Yellow
    exit 0
}
if (-not (Test-Path -LiteralPath $TimelinePath)) {
    Write-Error "render-program-timeline: timeline missing: $TimelinePath"
    exit 1
}

$jsonText = Get-Content -LiteralPath $SchedulePath -Raw -Encoding UTF8
$data = $jsonText | ConvertFrom-Json

$rh = $null
if ($data.PSObject.Properties.Name -contains "render_hints") { $rh = $data.render_hints }
$noteLines = @("Auto-generated from PROGRAM_SCHEDULE.json. Re-run this script or AO-CLOSE; TASKS/Checklist/Discovery stay canonical.")
if ($rh -and $rh.auto_note_md) {
    $noteLines = ($rh.auto_note_md -split "`n" | ForEach-Object { $_.TrimEnd("`r") })
}

$tcId = "ID"
$tcTask = "Task"
$tcStart = "Start"
$tcEnd = "End"
$tcDep = "Depends"
$sfx = "Gantt (Mermaid)"
if ($rh -and $rh.table_columns) {
    $c = $rh.table_columns
    if ($c.id) { $tcId = $c.id }
    if ($c.task) { $tcTask = $c.task }
    if ($c.start) { $tcStart = $c.start }
    if ($c.end) { $tcEnd = $c.end }
    if ($c.depends) { $tcDep = $c.depends }
    if ($c.gantt_heading_suffix) { $sfx = $c.gantt_heading_suffix }
}

$gen = [System.Text.StringBuilder]::new()
[void]$gen.AppendLine('<!-- program-schedule:generated-begin -->')
[void]$gen.AppendLine("")
foreach ($nl in $noteLines) {
    if (-not [string]::IsNullOrWhiteSpace($nl)) {
        [void]$gen.AppendLine($nl)
    }
}
[void]$gen.AppendLine("")

$si = 1
foreach ($stream in $data.streams) {
    [void]$gen.AppendLine(("## {0}) {1}" -f $si, $stream.section_title))
    [void]$gen.AppendLine("")
    if ($stream.table_intro) {
        [void]$gen.AppendLine($stream.table_intro)
        [void]$gen.AppendLine("")
    }
    $ah = $stream.acceptance_header
    [void]$gen.AppendLine(("| {0} | {1} | {2} | {3} | {4} | {5} |" -f $tcId, $tcTask, $tcStart, $tcEnd, $tcDep, $ah))
    [void]$gen.AppendLine("|----|--------|--------|--------|------|------------|")

    foreach ($t in $stream.tasks) {
        $ds = Format-TableDate -Value $t.start
        $de = Format-TableDate -Value $t.end
        [void]$gen.AppendLine("| **{0}** | {1} | {2} | {3} | {4} | {5} |" -f @(
            $t.id, $t.name, $ds, $de, $t.depends, $t.acceptance
        ))
    }

    [void]$gen.AppendLine("")
    $gTitle = $stream.gantt_title
    [void]$gen.AppendLine(("### {0} {1}" -f $stream.key, $sfx))
    [void]$gen.AppendLine("")
    [void]$gen.AppendLine('```mermaid')
    [void]$gen.AppendLine("gantt")
    [void]$gen.AppendLine("title $gTitle")
    [void]$gen.AppendLine("dateFormat YYYY-MM-DD")
    [void]$gen.AppendLine("axisFormat %m/%d")
    [void]$gen.AppendLine("")

    $groups = [ordered]@{}
    foreach ($t in $stream.tasks) {
        if (-not (Should-IncludeInGantt -Task $t)) { continue }
        $g = $t.gantt_group
        if (-not $groups.Contains($g)) {
            $groups[$g] = [System.Collections.Generic.List[object]]::new()
        }
        $groups[$g].Add($t)
    }

    foreach ($gk in $groups.Keys) {
        [void]$gen.AppendLine("section $gk")
        foreach ($t in $groups[$gk]) {
            $label = Escape-MermaidLabel -Text $t.gantt_label
            $gid = $t.gantt_id
            $crit = ""
            if ($t.crit -eq $true) { $crit = "crit, " }
            [void]$gen.AppendLine(("{0} : {1}{2}, {3}, {4}" -f $label, $crit, $gid, $t.start, $t.end))
        }
        [void]$gen.AppendLine("")
    }

    [void]$gen.AppendLine('```')
    [void]$gen.AppendLine("")
    [void]$gen.AppendLine("---")
    [void]$gen.AppendLine("")
    $si++
}

[void]$gen.AppendLine('<!-- program-schedule:generated-end -->')

$generated = $gen.ToString()
$timelineRaw = Get-Content -LiteralPath $TimelinePath -Raw -Encoding UTF8
$begin = "<!-- program-schedule:generated-begin -->"
$end = "<!-- program-schedule:generated-end -->"
if ($timelineRaw -notmatch [regex]::Escape($begin) -or $timelineRaw -notmatch [regex]::Escape($end)) {
    Write-Error "render-program-timeline: markers not found in PROGRAM_TIMELINE.md"
    exit 1
}

$pattern = '(?s)<!-- program-schedule:generated-begin -->.*?<!-- program-schedule:generated-end -->'
$newTimeline = [regex]::Replace($timelineRaw, $pattern, $generated.TrimEnd("`r", "`n"), 1)

$out = $newTimeline.TrimEnd("`r", "`n") + "`n"
Set-Content -LiteralPath $TimelinePath -Value $out -Encoding UTF8

Write-Host "render-program-timeline: updated $TimelinePath" -ForegroundColor Green
