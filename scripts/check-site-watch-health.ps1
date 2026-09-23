#requires -Version 5.1
<#
.SYNOPSIS
  site-watch watchdog -- is the client-site monitor itself alive? (AO-RESUME companion, read-only)

.DESCRIPTION
  site-watch (agency-os/docs/operations/SITE_WATCH_MASTER_PLAN.md) tells the operator when a CLIENT
  site breaks. This tells the operator when site-watch breaks: a dead monitor is silent, and silence
  is exactly what "every client site is fine" looks like.

  Four probes, each on a mechanism rather than on the last incident's signature
  (runbooks/ADD-PERIODIC-HEALTH-CHECK.md, 2026-08-25 addendum):
    a heartbeat  site_watch_maintenance.last_heartbeat_at age: >2h WARN, >6h or never FAIL. Stamped
                 by /api/internal/site-watch/due BEFORE its kill-switch check, so this is the
                 Trigger.dev -> next-admin -> DB chain whether the system is switched on or off.
    b executor   kill switch on (enabled heartbeat < 2h) and a monitored target has not completed a
                 run within its period + 2h (hourly 3h / every_6h 8h / daily 26h) -> WARN. Per
                 target on purpose: one target whose page crashes the renderer never completes,
                 while every other target keeps "newest result anywhere" fresh.
    c notify     kill switch on and a message owed > 3h (site_watch_page_state.owed_since) -> WARN.
                 owed_since, not updated_at: every failed send rewrites updated_at, so an updated_at
                 probe stays green for exactly the faults it exists for (Telegram 4xx/5xx retried
                 forever).
    d migration  0091 not applied while the code IS deployed -> FAIL. Deployed = an unauthenticated
                 POST to /api/internal/site-watch/due answers 401 (route behind its bearer check);
                 404 = not deployed yet -> overall NOT_DEPLOYED (neutral, exit 0). Without this split
                 the check would sit red at every AO-RESUME until rollout, and a red that is always
                 "expected" teaches everyone to ignore it.
  A probe that could not run or parse is a BLIND SPOT -> WARN, never PASS.

.NOTES
  Read-only. The thresholds below are the only copy. -LocalDbContainer runs the same SQL against a
  local Postgres container instead of prod (how each verdict was proven with fake timestamps).
  Exit 0 PASS or NOT_DEPLOYED / 1 WARN / 2 FAIL; scripts/ao-resume.ps1 treats every exit as warn-only.
#>
[CmdletBinding()]
param(
    [string]$KsAw01Host = "145.239.195.47",
    [string]$KsAw01SshUser = "ubuntu",
    [int]$KsAw01SshPort = 58122,
    [string]$KsAw01PrivateKey = (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
    [string]$DbContainer = "supabase-db",
    [string]$DbUser = "supabase_admin",
    [string]$LocalDbContainer = "",
    [string]$DeployProbeUrl = "https://app.aware-wave.com/api/internal/site-watch/due",
    [string]$WorkRoot = "",
    [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
# PS 5.1 defaults below TLS 1.2, which Cloudflare refuses (process-local setting).
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

$HeartbeatWarnH = 2
$HeartbeatFailH = 6
$EnabledRecentH = 2
$OverdueSlackH  = 2
$NotifyStuckH   = 3

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) { return (Resolve-Path -LiteralPath $InputRoot).Path }
    if ($PSScriptRoot) { return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

# One key=value per line. Everything is computed on the DB clock, so the laptop's clock never matters.
# overdue: a never-completed target counts from its creation; see probe b above for why per target.
$sql = @'
SELECT CASE WHEN to_regclass('public.site_watch_maintenance') IS NULL THEN 'false' ELSE 'true' END AS sw_applied \gset
\echo applied=:sw_applied
\if :sw_applied
WITH m AS (SELECT * FROM public.site_watch_maintenance WHERE id = 1),
monitored AS (
  SELECT o.slug, t.frequency, coalesce(t.last_completed_bucket_start, t.created_at) AS since
    FROM public.site_watch_targets t JOIN public.organizations o ON o.id = t.organization_id
   WHERE t.enabled AND o.status = 'active' AND t.frequency <> 'update_only'
     AND coalesce(o.metadata -> 'client_config' ->> 'site_url', '') ~* '^https?://'
),
overdue AS (
  SELECT slug FROM monitored
   WHERE since < now() - make_interval(hours => CASE frequency WHEN 'hourly' THEN 1 WHEN 'every_6h' THEN 6 ELSE 24 END + __SLACK_H__)
)
SELECT 'hb_age_s=' || coalesce((SELECT floor(extract(epoch FROM now() - last_heartbeat_at))::bigint::text FROM m), 'none')
UNION ALL SELECT 'enabled_hb_age_s=' || coalesce((SELECT floor(extract(epoch FROM now() - last_enabled_heartbeat_at))::bigint::text FROM m), 'none')
UNION ALL SELECT 'monitored_targets=' || (SELECT count(*) FROM monitored)
UNION ALL SELECT 'overdue_targets=' || (SELECT count(*) FROM overdue)
UNION ALL SELECT 'overdue_slugs=' || coalesce((SELECT string_agg(slug, ',' ORDER BY slug) FROM (SELECT slug FROM overdue ORDER BY slug LIMIT 10) x), '')
UNION ALL SELECT 'owed_notifications=' || (SELECT count(*) FROM public.site_watch_page_state WHERE owed_since IS NOT NULL)
UNION ALL SELECT 'stuck_notifications=' || (SELECT count(*) FROM public.site_watch_page_state WHERE owed_since < now() - make_interval(hours => __STUCK_H__))
UNION ALL SELECT 'oldest_owed_s=' || coalesce((SELECT floor(extract(epoch FROM now() - min(owed_since)))::bigint::text FROM public.site_watch_page_state), 'none')
UNION ALL SELECT 'last_result_age_s=' || coalesce((SELECT floor(extract(epoch FROM now() - max(created_at)))::bigint::text FROM public.site_watch_results), 'none');
\endif
'@
$sql = $sql.Replace('__SLACK_H__', [string]$OverdueSlackH).Replace('__STUCK_H__', [string]$NotifyStuckH)

# The SQL travels base64 in an env var and is decoded inside the DB container: no quote of it ever
# passes through PowerShell's native-argument handling or the remote shell (the psql "option requires
# an argument -- F" trap in check-staging-orphans.ps1 notes).
function Invoke-DbProbe {
    param([string]$Query)
    $lf = $Query.Replace([string][char]13 + [string][char]10, [string][char]10)
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($lf))
    $inner = "echo `$B64 | base64 -d | psql -U $effectiveDbUser -d postgres -X -q -t -A -v ON_ERROR_STOP=1"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($LocalDbContainer) {
            $out = Invoke-WithUtf8Console { & docker exec -e "B64=$b64" $LocalDbContainer sh -c $inner 2>&1 }
        } else {
            $remote = "sudo -n docker exec -e B64=$b64 $DbContainer sh -c '$inner'"
            $sshArgs = @(
                "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10",
                "-p", $KsAw01SshPort, "-i", $KsAw01PrivateKey, ("{0}@{1}" -f $KsAw01SshUser, $KsAw01Host), $remote
            )
            $out = Invoke-WithUtf8Console { & ssh @sshArgs 2>&1 }
        }
        return @{ ExitCode = $LASTEXITCODE; Output = (($out | ForEach-Object { [string]$_ }) -join "`n") }
    } catch {
        return @{ ExitCode = -1; Output = ("probe threw: " + $_.Exception.Message) }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

# HTTP status of an unauthenticated POST (-1 = no response). Read-only: the route refuses before any work.
function Get-RouteStatus {
    param([string]$Url)
    try {
        return [int](Invoke-WebRequest -Method Post -Uri $Url -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop).StatusCode
    } catch {
        $resp = $null
        try { $resp = $_.Exception.Response } catch { }
        if ($null -ne $resp) { try { return [int]$resp.StatusCode } catch { } }
        return -1
    }
}

# A local test container is stock Postgres (superuser "postgres"); prod is Supabase.
$effectiveDbUser = if ($LocalDbContainer -and -not $PSBoundParameters.ContainsKey('DbUser')) { "postgres" } else { $DbUser }

$root = Resolve-Root -InputRoot $WorkRoot
$statusDir = Join-Path $root "agency-os\reports\status"
$null = New-Item -ItemType Directory -Force -Path $statusDir
$stamp = Get-Date
$source = if ($LocalDbContainer) { "local container $LocalDbContainer" } else { "prod {0} {1}" -f $KsAw01Host, $DbContainer }

$res = Invoke-DbProbe -Query $sql
$kv = @{}
foreach ($line in ($res.Output -split "`n")) {
    $t = $line.Trim()
    if ($t -match '^([a-z_]+)=(.*)$') { $kv[$Matches[1]] = $Matches[2] }
}

$blindSpots = New-Object System.Collections.ArrayList
$required = @('hb_age_s', 'enabled_hb_age_s', 'monitored_targets', 'overdue_targets', 'overdue_slugs',
              'owed_notifications', 'stuck_notifications', 'oldest_owed_s', 'last_result_age_s')
if ($res.ExitCode -ne 0) {
    $first = (($res.Output -split "`n") | Where-Object { $_.Trim() } | Select-Object -First 1)
    [void]$blindSpots.Add(("probe_failed(exit {0}): {1}" -f $res.ExitCode, $first))
} elseif (-not $kv.ContainsKey('applied')) {
    [void]$blindSpots.Add("probe_output_unparsed")
} elseif ($kv['applied'] -eq 'true') {
    $missing = @($required | Where-Object { -not $kv.ContainsKey($_) })
    if ($missing.Count -gt 0) { [void]$blindSpots.Add("probe_output_incomplete: " + ($missing -join ',')) }
}

# Ages arrive raw; "none" = never. The clamp for a future stamp (clock skew) lives HERE, not in SQL:
# PostgreSQL's greatest() ignores NULL, so greatest(0, <never>) reads as "0 seconds ago" -- a scheduler
# that never ran would report healthy (caught by the verdict matrix, 2026-09-23).
function Get-Num {
    param($v)
    if ($v -is [string] -and $v -match '^-?\d+$') { return [math]::Max([long]0, [long]$v) }
    return $null
}
function Format-H {
    param($s)
    if ($null -eq $s) { return "never" }
    return ("{0:0.0}h" -f ($s / 3600.0))
}
function New-Probe {
    param([string]$Verdict, [string]$Detail)
    return [ordered]@{ verdict = $Verdict; detail = $Detail }
}

$probes = [ordered]@{}
$notDeployed = $false
$routeStatus = $null
if ($blindSpots.Count -eq 0 -and $kv['applied'] -ne 'true') {
    $routeStatus = Get-RouteStatus -Url $DeployProbeUrl
    if ($routeStatus -eq 404) { $notDeployed = $true }
    elseif ($routeStatus -ne 401) { [void]$blindSpots.Add(("deploy_probe: {0} answered {1} (expected 401 deployed / 404 not deployed)" -f $DeployProbeUrl, $routeStatus)) }
}
if ($blindSpots.Count -gt 0) {
    foreach ($p in @('migration', 'heartbeat', 'executor', 'notifications')) { $probes[$p] = New-Probe "UNKNOWN" "blind spot: probe did not run" }
} elseif ($notDeployed) {
    $probes['migration'] = New-Probe "SKIP" "site-watch not deployed yet (/due answers 404; MASTER PLAN section 7 step 10)"
    foreach ($p in @('heartbeat', 'executor', 'notifications')) { $probes[$p] = New-Probe "SKIP" "nothing to watch before rollout" }
} elseif ($kv['applied'] -ne 'true') {
    $probes['migration'] = New-Probe "FAIL" "code is deployed (/due answers 401) but migration 0091 is not applied -- the hourly cleanup call fails on missing tables (MASTER PLAN step 10b)"
    foreach ($p in @('heartbeat', 'executor', 'notifications')) { $probes[$p] = New-Probe "SKIP" "nothing to measure before 0091" }
} else {
    $probes['migration'] = New-Probe "PASS" "0091 applied"

    $hb = Get-Num $kv['hb_age_s']
    $probes['heartbeat'] =
        if ($null -eq $hb) { New-Probe "FAIL" "no heartbeat ever recorded (Trigger task site-watch-heartbeat not deployed, or never reached /due)" }
        elseif ($hb -gt $HeartbeatFailH * 3600) { New-Probe "FAIL" ("last heartbeat {0} ago (> {1}h): Trigger -> next-admin -> DB chain is down" -f (Format-H $hb), $HeartbeatFailH) }
        elseif ($hb -gt $HeartbeatWarnH * 3600) { New-Probe "WARN" ("last heartbeat {0} ago (> {1}h)" -f (Format-H $hb), $HeartbeatWarnH) }
        else { New-Probe "PASS" ("last heartbeat {0} ago" -f (Format-H $hb)) }

    $ehb = Get-Num $kv['enabled_hb_age_s']
    $switchedOn = ($null -ne $ehb) -and ($ehb -le $EnabledRecentH * 3600)
    $monitored = Get-Num $kv['monitored_targets']
    $overdue = Get-Num $kv['overdue_targets']
    $lastResult = Get-Num $kv['last_result_age_s']
    $probes['executor'] =
        if (-not $switchedOn) { New-Probe "SKIP" ("kill switch off (last enabled heartbeat: {0} ago) -- no run expected" -f (Format-H $ehb)) }
        elseif ($overdue -gt 0) { New-Probe "WARN" ("{0} of {1} monitored target(s) completed no run within period + {2}h: {3} -- Trigger site-watch-run red runs, renderer" -f $overdue, $monitored, $OverdueSlackH, $kv['overdue_slugs']) }
        else { New-Probe "PASS" ("{0} monitored target(s), none overdue; newest result: {1}" -f $monitored, $(if ($null -eq $lastResult) { "none yet" } else { (Format-H $lastResult) + " ago" })) }

    $owed = Get-Num $kv['owed_notifications']
    $stuck = Get-Num $kv['stuck_notifications']
    $oldest = Get-Num $kv['oldest_owed_s']
    $probes['notifications'] =
        if (-not $switchedOn) { New-Probe "SKIP" ("kill switch off: {0} owed message(s) paused until it is on" -f $owed) }
        elseif ($stuck -gt 0) { New-Probe "WARN" ("{0} message(s) owed > {1}h (oldest {2}) -- Telegram token/chat ids (ops-inbox alerts likely broken too)" -f $stuck, $NotifyStuckH, (Format-H $oldest)) }
        else { New-Probe "PASS" ("{0} owed right now (oldest {1})" -f $owed, $(if ($owed -gt 0) { Format-H $oldest } else { "-" })) }
}

$verdicts = @($probes.Values | ForEach-Object { $_.verdict })
$overall =
    if ($verdicts -contains "FAIL") { "FAIL" }
    elseif (($verdicts -contains "WARN") -or $blindSpots.Count -gt 0) { "WARN" }
    elseif ($notDeployed) { "NOT_DEPLOYED" }
    else { "PASS" }

$ICON = @{
    PASS         = [char]::ConvertFromUtf32(0x1F7E2)
    WARN         = [char]::ConvertFromUtf32(0x1F7E1)
    FAIL         = [char]::ConvertFromUtf32(0x1F534)
    SKIP         = [char]::ConvertFromUtf32(0x26AA)
    UNKNOWN      = [char]::ConvertFromUtf32(0x26AA)
    NOT_DEPLOYED = [char]::ConvertFromUtf32(0x26AA)
}
$labels = [ordered]@{ migration = "d migration"; heartbeat = "a heartbeat"; executor = "b executor"; notifications = "c notify" }

$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("# site-watch watchdog (monitor of the client-site monitor)")
[void]$md.AppendLine("")
[void]$md.AppendLine("- Generated: " + $stamp.ToString("yyyy-MM-dd HH:mm:ss") + " -- source: " + $source)
[void]$md.AppendLine("- Overall: " + $ICON[$overall] + " **" + $overall + "**")
[void]$md.AppendLine("")
[void]$md.AppendLine("| probe | verdict | detail |")
[void]$md.AppendLine("|---|---|---|")
foreach ($k in $labels.Keys) {
    $p = $probes[$k]
    [void]$md.AppendLine("| " + $labels[$k] + " | " + $ICON[$p.verdict] + " " + $p.verdict + " | " + $p.detail + " |")
}
if ($blindSpots.Count -gt 0) {
    [void]$md.AppendLine("")
    [void]$md.AppendLine("> **BLIND SPOT**: " + ($blindSpots -join "; "))
    [void]$md.AppendLine("> Nothing was measured this run. Not measured is not healthy, so the verdict is WARN.")
}
[void]$md.AppendLine("")
[void]$md.AppendLine("What to do per verdict: agency-os/docs/operations/SITE_WATCH_MASTER_PLAN.md section 11 (AO-RESUME site-watch row).")

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $statusDir "site-watch-LATEST.md"), $md.ToString(), $utf8NoBom)
$payload = [ordered]@{
    generatedAt = $stamp.ToUniversalTime().ToString("o")
    overall     = $overall
    blind_spots = @($blindSpots)
    source      = $source
    probes      = $probes
    raw         = $kv
    route_status = $routeStatus
    thresholds  = [ordered]@{ heartbeat_warn_h = $HeartbeatWarnH; heartbeat_fail_h = $HeartbeatFailH; enabled_recent_h = $EnabledRecentH; overdue_slack_h = $OverdueSlackH; notify_stuck_h = $NotifyStuckH }
    reportPath  = "agency-os/reports/status/site-watch-LATEST.md"
}
[System.IO.File]::WriteAllText((Join-Path $statusDir "site-watch-LATEST.json"), ($payload | ConvertTo-Json -Depth 6), $utf8NoBom)

if ($Json) {
    $payload | ConvertTo-Json -Depth 6
} else {
    Write-Host "== site-watch watchdog (AO-RESUME companion, warn-only) ==" -ForegroundColor Cyan
    Write-Host ("Overall: " + $overall + "   source: " + $source)
    foreach ($k in $labels.Keys) {
        $p = $probes[$k]
        $color = switch ($p.verdict) { "FAIL" { "Red" } "WARN" { "Yellow" } "PASS" { "Green" } default { "DarkGray" } }
        Write-Host ("- {0}: {1} -- {2}" -f $labels[$k], $p.verdict, $p.detail) -ForegroundColor $color
    }
    if ($blindSpots.Count -gt 0) { Write-Host ("BLIND SPOT: " + ($blindSpots -join "; ")) -ForegroundColor Yellow }
}

if ($overall -eq "PASS" -or $overall -eq "NOT_DEPLOYED") { exit 0 }
if ($overall -eq "WARN") { exit 1 }
exit 2
