# MCP runtime availability of the governed servers (project .mcp.json + user scope), from the authoritative
# per-server source: `claude mcp list` (it starts each server and prints Connected / Failed / Needs
# authentication). Writes reports/status/mcp-runtime-LATEST.json (detector contract) naming every server
# that is not connected. Not the desktop main.log `init_mcp=` totals: those also count claude.ai connectors
# and plugin servers nobody authorises (2026-10-23: needs_auth:26 / failed:18 while 10/11 governed were up).
# Not connected -> WARN. CLI missing / timed out / no server lines -> measured=0, UNKNOWN (never PASS).
# Exit: 0 PASS, 1 WARN, 2 UNKNOWN.
param(
    [string]$OutPath = "",
    [string]$ListOutputFile = ""   # tests: parse this captured `claude mcp list` output instead of running it
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot 'lib\repo-roots.ps1')
. (Join-Path $PSScriptRoot 'lib\_detector-contract.ps1')
. (Join-Path $PSScriptRoot 'lib\process-deadline.ps1')

$workRoot = Get-MonorepoRoot
if (-not $OutPath) { $OutPath = Join-Path (Resolve-AgencyRoot) 'reports\status\mcp-runtime-LATEST.json' }

$text = $null
$note = $null
if ($ListOutputFile) {
    $text = [IO.File]::ReadAllText($ListOutputFile)
} else {
    $cli = Get-Command claude -ErrorAction SilentlyContinue
    $exe = if ($cli) { $cli.Source } else { Join-Path $env:USERPROFILE '.local\bin\claude.exe' }
    if (-not (Test-Path -LiteralPath $exe)) {
        $note = "claude CLI not found (PATH or $exe)"
    } else {
        $r = Invoke-ProcessWithDeadline -FilePath $exe -ArgumentList @('mcp', 'list') -DeadlineSec 120 -WorkingDirectory $workRoot
        if ($r.TimedOut -or $r.ExitCode -ne 0) { $note = "claude mcp list: exit $($r.ExitCode); $($r.Stderr)".Trim() } else { $text = $r.Stdout }
    }
}

# Server line: `<name>: <command or url> - <status>`. Status words, not the check-mark glyphs.
$servers = @()
if ($text) {
    foreach ($line in ($text -split "`r?`n")) {
        $m = [regex]::Match($line, '^(?<name>[^\s:][^:]*?): .* - (?<status>.+)$')
        if (-not $m.Success) { continue }
        $s = $m.Groups['status'].Value
        $state = if ($s -match '\bConnected\b') { 'connected' } elseif ($s -match 'Needs authentication') { 'needs_auth' } else { 'failed' }
        $servers += [pscustomobject]@{ name = $m.Groups['name'].Value.Trim(); state = $state; status = $s.Trim() }
    }
    if ($servers.Count -eq 0) { $note = 'no server lines in claude mcp list output' }
}

$down = @($servers | Where-Object { $_.state -ne 'connected' })
$measured = $servers.Count
$overall = if ($measured -le 0) { 'UNKNOWN' } elseif ($down.Count -gt 0) { 'WARN' } else { 'PASS' }

$fields = @{ source = 'claude mcp list'; servers = @($servers); not_connected = @($down | ForEach-Object { "$($_.name)=$($_.state)" }); note = $note }
$res = Write-DetectorArtifact -Path $OutPath -Overall $overall -Measured $measured -Fields $fields

if ($measured -gt 0) {
    $tail = if ($down.Count) { ' not connected: ' + (($down | ForEach-Object { "$($_.name) ($($_.state))" }) -join ', ') } else { '' }
    Write-Output ("mcp-runtime: {0} {1}/{2} connected{3}" -f $res.overall, ($measured - $down.Count), $measured, $tail)
} else {
    Write-Output ("mcp-runtime: {0} measured=0 -- {1}" -f $res.overall, $note)
}
switch ($res.overall) { 'PASS' { exit 0 } 'WARN' { exit 1 } default { exit 2 } }
