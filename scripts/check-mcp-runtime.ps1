# Reads the newest `init_mcp=connected:N/pending:N/failed:N/needs_auth:N/...` line Claude desktop writes
# to main.log and records it as reports/status/mcp-runtime-LATEST.json (detector contract).
# failed>0 -> WARN. No readable line -> measured=0, overall UNKNOWN (never PASS). Weeks of failed:14 went unread.
# Exit: 0 PASS, 1 WARN, 2 UNKNOWN.
param(
    [string]$LogDir = "",
    [string]$OutPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')
. (Join-Path $PSScriptRoot 'lib\_detector-contract.ps1')

if (-not $LogDir) { $LogDir = Join-Path $env:LOCALAPPDATA 'Claude\Logs' }
if (-not $OutPath) { $OutPath = Join-Path (Resolve-AgencyRoot) 'reports\status\mcp-runtime-LATEST.json' }

$counts = $null
$lineStamp = $null
$source = $null
$note = $null
try {
    # main.log rotates to main1..N.log; newest file that holds an init_mcp line wins.
    $logs = @(Get-ChildItem -LiteralPath $LogDir -Filter 'main*.log' -File -ErrorAction Stop | Sort-Object LastWriteTime -Descending)
    foreach ($log in $logs) {
        $hit = Select-String -LiteralPath $log.FullName -Pattern 'init_mcp=' -Encoding UTF8 | Select-Object -Last 1
        if (-not $hit) { continue }
        $m = [regex]::Match($hit.Line, 'init_mcp=((?:\w+:\d+/?)+)')
        if (-not $m.Success) { continue }
        $counts = [ordered]@{}
        foreach ($pair in $m.Groups[1].Value.TrimEnd('/').Split('/')) {
            $kv = $pair.Split(':')
            $counts[$kv[0]] = [int]$kv[1]
        }
        $lineStamp = $hit.Line.Substring(0, [Math]::Min(19, $hit.Line.Length))
        $source = $log.FullName
        break
    }
    if (-not $counts) { $note = "no init_mcp line in $($logs.Count) main*.log file(s) under $LogDir" }
} catch {
    $note = "log unreadable: " + $_.Exception.Message
}

if ($counts) {
    $measured = [int](($counts.Values | Measure-Object -Sum).Sum)
    $failed = if ($counts.Contains('failed')) { $counts['failed'] } else { 0 }
    $overall = if ($measured -le 0) { 'UNKNOWN' } elseif ($failed -gt 0) { 'WARN' } else { 'PASS' }
} else {
    $measured = 0
    $overall = 'UNKNOWN'
}

$fields = @{ source = $source; line_local_time = $lineStamp; counts = $counts; note = $note }
$res = Write-DetectorArtifact -Path $OutPath -Overall $overall -Measured $measured -Fields $fields

if ($counts) {
    Write-Output ("mcp-runtime: {0} measured={1} {2} (line {3})" -f $res.overall, $measured, (($counts.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' '), $lineStamp)
} else {
    Write-Output ("mcp-runtime: {0} measured=0 -- {1}" -f $res.overall, $note)
}
switch ($res.overall) { 'PASS' { exit 0 } 'WARN' { exit 1 } default { exit 2 } }
