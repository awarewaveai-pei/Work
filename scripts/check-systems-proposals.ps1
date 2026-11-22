<#
.SYNOPSIS
    /ops/systems "new system" requests waiting to be written into agency-os/systems/registry.json (contract 3 of
    agency-os/handoffs/2026-11-21-systems-control-center/briefs/COMMON.md). Read-only. Run by ao-resume.ps1.

.DESCRIPTION
    The page's button writes a system_proposed event; only an agent can turn it into a registry entry (git is the
    definition source). This puts the pending ones in front of the agent at AO-RESUME: one read-only query over ssh
    (ubuntu + sudo docker exec supabase-db psql, the path of scripts/apply-db-migration.mjs, 60 s deadline) ->
    agency-os/reports/status/systems-proposals-LATEST.json -> scripts/lib/smoke-status-digest.ps1 turns a non-empty
    list into one smoke blocker line.
    Pending = same rule as next-admin lib/systems/store.ts pendingFrom: the name, whitespace removed and lower-cased,
    matches no live system's name / slug / alias; the same name asked twice is listed once (newest).
    A failed query is a blind spot (measured=0), never a blocker: it says nothing about the requests.
    Exit 0 = none pending, 1 = some pending, 2 = query failed.
#>
[CmdletBinding()]
param(
    [string]$SshHost = "145.239.195.47",
    [string]$SshUser = "ubuntu",
    [int]$SshPort = 58122,
    [string]$PrivateKey = (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
    [string]$WorkRoot = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "lib\ssh-deadline.ps1")
. (Join-Path $PSScriptRoot "lib\_detector-contract.ps1")

$root = if ($WorkRoot -and (Test-Path -LiteralPath $WorkRoot)) { (Resolve-Path -LiteralPath $WorkRoot).Path } else { (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
$jsonPath = Join-Path $root "agency-os\reports\status\systems-proposals-LATEST.json"

# One JSON array on one line. Mirrors pendingFrom (lib/systems/store.ts); kept to plain SQL so the psql output is the
# answer, no parsing of rows.
$sql = @'
with live as (
  select regexp_replace(lower(x), '\s+', '', 'g') as k
  from public.systems s, unnest(array[s.name, s.slug] || s.aliases) as x
  where s.in_registry
), p as (
  select payload->>'name' as name, payload->>'type' as type, payload->>'purpose' as purpose, occurred_at,
         regexp_replace(lower(payload->>'name'), '\s+', '', 'g') as k
  from public.system_updates
  where event_type = 'system_proposed' and coalesce(btrim(payload->>'name'), '') <> ''
), latest as (
  select distinct on (k) * from p order by k, occurred_at desc
)
select coalesce(json_agg(json_build_object('name', name, 'type', type, 'purpose', purpose, 'at', occurred_at) order by occurred_at), '[]'::json)
from latest where k not in (select k from live);
'@

$proposals = @()
$blind = @()
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sql))
# base64 through the remote shell: no quoting of the SQL, and the default transaction is read-only on top of a select.
$remote = "echo $b64 | base64 -d | sudo -n docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -qtA -c 'set default_transaction_read_only = on' -f -"
$r = Invoke-SshWithDeadline -SshArgs @("-o", "StrictHostKeyChecking=accept-new", "-p", $SshPort, "-i", $PrivateKey, ("{0}@{1}" -f $SshUser, $SshHost), $remote) -DeadlineSec 60 -ConnectTimeoutSec 15
if ($r.TimedOut) {
    $blind += "ssh/psql exceeded the 60 s deadline"
} elseif ($r.ExitCode -ne 0) {
    $err = ([string]$r.Stderr).Trim()
    $blind += ("query failed (exit {0}): {1}" -f $r.ExitCode, $err.Substring(0, [Math]::Min(300, $err.Length)))
} else {
    $line = @(([string]$r.Stdout) -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_.StartsWith("[") }) | Select-Object -Last 1
    if (-not $line) {
        $blind += "psql answered no JSON array"
    } else {
        try { $proposals = @($line | ConvertFrom-Json -ErrorAction Stop) } catch { $blind += ("unreadable psql output: {0}" -f $_.Exception.Message) }
    }
}

$measured = if ($blind.Count -gt 0) { 0 } else { 1 }
$overall = if ($blind.Count -gt 0) { "UNKNOWN" } elseif ($proposals.Count -gt 0) { "WARN" } else { "PASS" }
$null = Write-DetectorArtifact -Path $jsonPath -Overall $overall -Measured $measured -Fields ([ordered]@{
    proposals   = @($proposals | ForEach-Object { [ordered]@{ name = [string]$_.name; type = [string]$_.type; purpose = [string]$_.purpose; at = [string]$_.at } })
    blind_spots = @($blind)
    source      = "ssh $SshUser@${SshHost}:$SshPort supabase-db public.system_updates (system_proposed)"
})

Write-Host "== Systems proposals (/ops/systems, AO-RESUME companion) ==" -ForegroundColor Cyan
if ($blind.Count -gt 0) {
    foreach ($b in $blind) { Write-Host ("BLIND: " + $b) -ForegroundColor Yellow }
    exit 2
}
if ($proposals.Count -gt 0) {
    foreach ($p in $proposals) { Write-Host ("pending: {0} ({1}) -- {2}" -f $p.name, $p.type, $p.purpose) -ForegroundColor Yellow }
    exit 1
}
Write-Host "none pending"
exit 0
