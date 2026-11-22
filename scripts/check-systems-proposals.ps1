<#
.SYNOPSIS
    /ops/systems "new system" requests waiting to be written into agency-os/systems/registry.json (contract 3 of
    agency-os/handoffs/2026-11-21-systems-control-center/briefs/COMMON.md). Read-only. Run by ao-resume.ps1.

.DESCRIPTION
    The page's button writes a system_proposed event; only an agent can turn it into a registry entry (git is the
    definition source). This puts the pending ones in front of the agent at AO-RESUME: ssh to the host, where curl asks
    next-admin GET http://127.0.0.1:3002/api/internal/systems/pending -- the same answer the host importer gets, so
    "pending" has one definition only (next-admin lib/systems/store.ts pendingFrom). The bearer token is read on the
    host from /root/lobster-phase1/.env (plain read like scripts/poke.sh, never sourced) and handed to curl on stdin:
    it is never on the laptop, in argv or in this report. The host script travels base64-encoded (no quoting).
    -> agency-os/reports/status/systems-proposals-LATEST.json -> scripts/lib/smoke-status-digest.ps1 turns a non-empty
    list into one smoke blocker line. A failed call is a blind spot (measured=0), never a blocker.
    -PendingJson <text> skips ssh and uses the text as the route's answer (tests).
    Exit 0 = none pending, 1 = some pending, 2 = the call failed.
#>
[CmdletBinding()]
param(
    [string]$SshHost = "145.239.195.47",
    [string]$SshUser = "ubuntu",
    [int]$SshPort = 58122,
    [string]$PrivateKey = (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
    [string]$WorkRoot = "",
    [string]$PendingJson = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "lib\ssh-deadline.ps1")
. (Join-Path $PSScriptRoot "lib\_detector-contract.ps1")

$root = if ($WorkRoot -and (Test-Path -LiteralPath $WorkRoot)) { (Resolve-Path -LiteralPath $WorkRoot).Path } else { (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
$jsonPath = Join-Path $root "agency-os\reports\status\systems-proposals-LATEST.json"

# Runs as root on the host (sudo -n bash). curl -f: a non-2xx (401 / 500) is a failure, not an answer.
$hostScript = @'
set -euo pipefail
t="$(sed -n 's/^SYSTEMS_INGEST_TOKEN=//p' /root/lobster-phase1/.env | tail -1 | tr -d '\r"')"
[ -n "$t" ] || { echo "SYSTEMS_INGEST_TOKEN not set in /root/lobster-phase1/.env" >&2; exit 3; }
printf 'Authorization: Bearer %s\n' "$t" | curl -sS -f -m 30 -H @- http://127.0.0.1:3002/api/internal/systems/pending
'@

$proposals = @()
$blind = @()
$answer = $null
if ($PendingJson) {
    $answer = $PendingJson
} else {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($hostScript -replace "`r`n", "`n")))
    $remote = "echo $b64 | base64 -d | sudo -n bash"
    $r = Invoke-SshWithDeadline -SshArgs @("-o", "StrictHostKeyChecking=accept-new", "-p", $SshPort, "-i", $PrivateKey, ("{0}@{1}" -f $SshUser, $SshHost), $remote) -DeadlineSec 60 -ConnectTimeoutSec 15
    if ($r.TimedOut) {
        $blind += "ssh/curl exceeded the 60 s deadline"
    } elseif ($r.ExitCode -ne 0) {
        $err = ([string]$r.Stderr).Trim()
        $blind += ("pending call failed (exit {0}): {1}" -f $r.ExitCode, $err.Substring(0, [Math]::Min(300, $err.Length)))
    } else {
        $answer = [string]$r.Stdout
    }
}
if ($null -ne $answer) {
    try {
        $p = $answer | ConvertFrom-Json -ErrorAction Stop
        if ($null -eq $p -or -not $p.PSObject.Properties['proposals']) { throw "no proposals field" }
        # PS 5.1: piping through ForEach-Object flattens 0 / 1 / n items alike (a bare @($p.proposals) does not).
        $proposals = @($p.proposals | ForEach-Object { $_ })
    } catch {
        $blind += ("unreadable answer from the pending route: {0}" -f $_.Exception.Message)
        $proposals = @()
    }
}

$measured = if ($blind.Count -gt 0) { 0 } else { 1 }
$overall = if ($blind.Count -gt 0) { "UNKNOWN" } elseif ($proposals.Count -gt 0) { "WARN" } else { "PASS" }
$null = Write-DetectorArtifact -Path $jsonPath -Overall $overall -Measured $measured -Fields ([ordered]@{
    proposals   = @($proposals | ForEach-Object { [ordered]@{ event_key = [string]$_.event_key; name = [string]$_.name; type = [string]$_.type; purpose = [string]$_.purpose; at = [string]$_.at } })
    blind_spots = @($blind)
    source      = "ssh $SshUser@${SshHost}:$SshPort -> GET 127.0.0.1:3002/api/internal/systems/pending"
})

Write-Host "== Systems proposals (/ops/systems, AO-RESUME companion) ==" -ForegroundColor Cyan
if ($blind.Count -gt 0) {
    foreach ($b in $blind) { Write-Host ("BLIND: " + $b) -ForegroundColor Yellow }
    exit 2
}
if ($proposals.Count -gt 0) {
    foreach ($x in $proposals) { Write-Host ("pending: {0} ({1}) -- {2}" -f $x.name, $x.type, $x.purpose) -ForegroundColor Yellow }
    exit 1
}
Write-Host "none pending"
exit 0
