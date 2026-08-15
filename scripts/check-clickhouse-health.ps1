#requires -Version 5.1
<#
.SYNOPSIS
SSH EU; measure ClickHouse self-telemetry vs application data; write LATEST report.

.DESCRIPTION
Auto-called by ao-resume.ps1 alongside check-backup-health.ps1 / check-cloudflare-security.ps1
/ check-vps-auto-reboot-health.ps1. Writes agency-os/reports/status/clickhouse-LATEST.md (+ .json).

WHY THIS EXISTS
ClickHouse on EU was "fixed" four times in four months (2026-04-20, 04-29, 07-05, 08-15) and
came back every time, because the first three fixes only ever raised the ceiling or deleted
what had already accumulated:

  04-20  OOM            -> memory cap 600MB -> 800MB
  04-29  OOM again      -> cap 800MB -> 1.6GB, mem_limit 1024m -> 2048m, first TTLs
  07-05  OOM death      -> cleared 20GB of logs, mem_limit -> 3072m, cap -> 2.5GB
         spiral (2344 OOM-kills)
  08-15  CPU pegged     -> finally disabled the GENERATORS (trace_log etc.)
         100% for days

The 2026-04-29 commit comment already named trace_log by name. The diagnosis was right
three and a half months before the generators were switched off; every intervention in
between treated whichever resource had blown up rather than the input rate. Because the
ceiling kept rising, the bottleneck migrated from RAM to CPU and the symptom looked new
each time.

WHAT THIS CHECKS (the class, not the specific table)
The durable signal is a ratio: a healthy analytics DB stores far more application data than
self-telemetry. At the 2026-08-15 incident it was inverted 345:1 (system 16.89 GiB /
643,628,136 rows vs trigger_dev 49 MiB / 624,481 rows). Any future table that starts
flooding - not just trace_log - moves that ratio, so this keeps working when the specific
offender changes. Regression of the two generators disabled on 2026-08-15 is also detected
directly, in case a netdata/ClickHouse upgrade or a config revert re-enables them.

Verdict:
  GREEN healthy - ratio and volume within budget, no disabled generator writing again
  YELLOW drift  - ratio > 5x, or system data > 2 GiB, or a persistent merge backlog
  RED broken    - ratio > 20x, or system data > 8 GiB, or a disabled generator is ingesting

Exit code: always 0 (warn-only, same convention as the sibling checks).

.NOTES
SSOT config: lobster-factory/infra/trigger/clickhouse/override.xml
Incident:    agency-os/WORKLOG.md 2026-08-15
Runbook:     runbooks/ADD-PERIODIC-HEALTH-CHECK.md (this file follows that pattern)

PS5.1 source-encoding rule: no unicode emoji literals in source. Big5 console parser
crashes on multi-byte chars without BOM. Emoji are produced at output time only.
#>
[CmdletBinding()]
param(
    [string]$EuHost = "204.168.175.41",
    [string]$SshUser = "root",
    [string]$PrivateKey = (Join-Path $env:USERPROFILE ".ssh\hetzner_trigger"),
    [string]$Container = "trigger-clickhouse",
    [string]$AppDatabase = "trigger_dev",
    [string]$WorkRoot = "",
    [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

$ICON_HEALTHY = [char]::ConvertFromUtf32(0x1F7E2)  # green circle
$ICON_DRIFT   = [char]::ConvertFromUtf32(0x1F7E1)  # yellow circle
$ICON_BROKEN  = [char]::ConvertFromUtf32(0x1F534)  # red circle

# Thresholds. Ratio is the primary signal; the absolute sizes stop a tiny app
# database from making an ordinary system database look catastrophic.
$RATIO_WARN  = 5
$RATIO_FAIL  = 20
$BYTES_WARN  = 2GB
$BYTES_FAIL  = 8GB
$MERGE_WARN  = 10

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) {
        return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    }
    return (Get-Location).Path
}

function Invoke-Ssh {
    param([string]$ServerHost, [string]$Command)
    $sshArgs = @(
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ConnectTimeout=15",
        "-i", $PrivateKey,
        ("{0}@{1}" -f $SshUser, $ServerHost),
        $Command
    )
    $out = Invoke-WithUtf8Console { & ssh @sshArgs 2>&1 }
    return @{
        ExitCode = $LASTEXITCODE
        Output   = (($out | ForEach-Object { [string]$_ }) -join "`n").Trim()
    }
}

function Parse-Kv {
    param([string]$Output, [string]$Key)
    $prefix = $Key + "="
    foreach ($line in ($Output -split "`n")) {
        $t = $line.Trim()
        if ($t.StartsWith($prefix)) { return $t.Substring($prefix.Length) }
    }
    return ""
}

function To-Long {
    param([string]$Text)
    $n = 0L
    if ([long]::TryParse(($Text -replace '[^0-9-]', ''), [ref]$n)) { return $n }
    return 0L
}

function Format-Size {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return ("{0:N2} GiB" -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ("{0:N2} MiB" -f ($Bytes / 1MB)) }
    return ("{0} B" -f $Bytes)
}

# Remote probe. Base64 so no quoting survives three shells (PowerShell -> ssh -> sh),
# which is the trap that produced CRLF and mangled-arg bugs earlier in this stack.
$remoteScript = @'
set -u
CH="/opt/bitnami/clickhouse/bin/clickhouse client --user $CLICKHOUSE_ADMIN_USER --password $CLICKHOUSE_ADMIN_PASSWORD"
q() { $CH --query "$1" 2>/dev/null | head -1; }
echo "system_bytes=$(q "SELECT sum(bytes_on_disk) FROM system.parts WHERE active AND database='system'")"
echo "system_rows=$(q "SELECT sum(rows) FROM system.parts WHERE active AND database='system'")"
echo "app_bytes=$(q "SELECT sum(bytes_on_disk) FROM system.parts WHERE active AND database='__APPDB__'")"
echo "app_rows=$(q "SELECT sum(rows) FROM system.parts WHERE active AND database='__APPDB__'")"
echo "merges=$(q "SELECT count() FROM system.merges")"
echo "max_parts=$(q "SELECT max(c) FROM (SELECT count() AS c FROM system.parts WHERE active AND database='system' GROUP BY table)")"
echo "top_table=$(q "SELECT concat(table,':',toString(sum(bytes_on_disk))) FROM system.parts WHERE active AND database='system' GROUP BY table ORDER BY sum(bytes_on_disk) DESC LIMIT 1")"
echo "trace_log_recent=$(q "SELECT count() FROM system.trace_log WHERE event_time > now() - INTERVAL 1 HOUR")"
echo "async_metric_log_recent=$(q "SELECT count() FROM system.asynchronous_metric_log WHERE event_time > now() - INTERVAL 1 HOUR")"
'@
$remoteScript = $remoteScript.Replace("__APPDB__", $AppDatabase)

$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($remoteScript -replace "`r`n", "`n")))
$remoteCmd = "docker exec -e B64=$b64 $Container sh -lc 'echo `$B64 | base64 -d | sh'"

$root = Resolve-Root -InputRoot $WorkRoot
$res = Invoke-Ssh -ServerHost $EuHost -Command $remoteCmd

$reasons = @()
$worst = "healthy"

function Set-Worst {
    param([string]$Level)
    $order = @{ "healthy" = 0; "drift" = 1; "broken" = 2 }
    if ($order[$Level] -gt $order[$script:worst]) { $script:worst = $Level }
}

$systemBytes = 0L; $appBytes = 0L; $merges = 0L; $maxParts = 0L
$traceRecent = 0L; $asyncRecent = 0L; $systemRows = 0L; $appRows = 0L
$topTable = ""
$ratio = 0.0

if ($res.ExitCode -ne 0) {
    Set-Worst "broken"
    $reasons += "SSH/probe failed (exit $($res.ExitCode)): " + (($res.Output -split "`n") | Select-Object -First 1)
} else {
    $systemBytes = To-Long (Parse-Kv $res.Output "system_bytes")
    $systemRows  = To-Long (Parse-Kv $res.Output "system_rows")
    $appBytes    = To-Long (Parse-Kv $res.Output "app_bytes")
    $appRows     = To-Long (Parse-Kv $res.Output "app_rows")
    $merges      = To-Long (Parse-Kv $res.Output "merges")
    $maxParts    = To-Long (Parse-Kv $res.Output "max_parts")
    $topTable    = Parse-Kv $res.Output "top_table"
    $traceRecent = To-Long (Parse-Kv $res.Output "trace_log_recent")
    $asyncRecent = To-Long (Parse-Kv $res.Output "async_metric_log_recent")

    if ($appBytes -gt 0) { $ratio = [math]::Round($systemBytes / [double]$appBytes, 1) }

    # Regression of the generators switched off on 2026-08-15. Rows arriving in the
    # last hour is the runtime truth; the config file alone can be right while a
    # container still runs an older config.
    if ($traceRecent -gt 0) {
        Set-Worst "broken"
        $reasons += "system.trace_log is ingesting again ($traceRecent rows in the last hour) - the 2026-08-15 generator fix has been reverted or lost"
    }
    if ($asyncRecent -gt 0) {
        Set-Worst "broken"
        $reasons += "system.asynchronous_metric_log is ingesting again ($asyncRecent rows in the last hour)"
    }

    if ($appBytes -le 0) {
        Set-Worst "drift"
        $reasons += "application database '$AppDatabase' reported 0 bytes - ratio cannot be evaluated"
    } elseif ($ratio -ge $RATIO_FAIL) {
        Set-Worst "broken"
        $reasons += "self-telemetry is ${ratio}x the application data (fail at ${RATIO_FAIL}x)"
    } elseif ($ratio -ge $RATIO_WARN) {
        Set-Worst "drift"
        $reasons += "self-telemetry is ${ratio}x the application data (warn at ${RATIO_WARN}x)"
    }

    if ($systemBytes -ge $BYTES_FAIL) {
        Set-Worst "broken"
        $reasons += "system database is $(Format-Size $systemBytes) (fail at $(Format-Size ([long]$BYTES_FAIL)))"
    } elseif ($systemBytes -ge $BYTES_WARN) {
        Set-Worst "drift"
        $reasons += "system database is $(Format-Size $systemBytes) (warn at $(Format-Size ([long]$BYTES_WARN)))"
    }

    if ($merges -ge $MERGE_WARN) {
        Set-Worst "drift"
        $reasons += "$merges merges running concurrently - possible merge backlog"
    }
}

$userLabel = switch ($worst) { "healthy" { "PASS" } "drift" { "WARN" } "broken" { "FAIL" } default { "UNKNOWN" } }
$icon      = switch ($worst) { "healthy" { $ICON_HEALTHY } "drift" { $ICON_DRIFT } "broken" { $ICON_BROKEN } default { $ICON_DRIFT } }

$reportDir = Join-Path $root "agency-os\reports\status"
if (-not (Test-Path -LiteralPath $reportDir)) {
    New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
}

$now = Get-Date
$lines = @()
$lines += "# ClickHouse health (EU)"
$lines += ""
$lines += ("- Generated: {0}" -f $now.ToString("yyyy-MM-dd HH:mm:ss"))
$lines += ("- Overall: **{0} {1}**" -f $icon, $userLabel)
$lines += ("- Host: {0} / container ``{1}``" -f $EuHost, $Container)
$lines += ""
$lines += "## Self-telemetry vs application data"
$lines += ""
$lines += "| Metric | Value |"
$lines += "|--------|-------|"
$lines += ("| system database | {0} ({1:N0} rows) |" -f (Format-Size $systemBytes), $systemRows)
$lines += ("| {0} (application) | {1} ({2:N0} rows) |" -f $AppDatabase, (Format-Size $appBytes), $appRows)
$lines += ("| ratio (system / app) | {0}x |" -f $ratio)
$lines += ("| largest system table | {0} |" -f ($(if ($topTable) { $topTable } else { "n/a" })))
$lines += ("| active merges | {0} |" -f $merges)
$lines += ("| max parts in one system table | {0} |" -f $maxParts)
$lines += ("| trace_log rows last hour | {0} (expected 0 - disabled 2026-08-15) |" -f $traceRecent)
$lines += ("| asynchronous_metric_log rows last hour | {0} (expected 0 - disabled 2026-08-15) |" -f $asyncRecent)
$lines += ""
$lines += "## Findings"
$lines += ""
if ($reasons.Count -eq 0) {
    $lines += "- No drift. Generation rate and volume are within budget."
} else {
    foreach ($r in $reasons) { $lines += ("- {0}" -f $r) }
}
$lines += ""
$lines += "## Why this check exists"
$lines += ""
$lines += "ClickHouse was fixed four times in four months (2026-04-20 / 04-29 / 07-05 / 08-15)."
$lines += "The first three raised the memory ceiling or deleted accumulated rows; none of them"
$lines += "stopped the generators, so it returned with a different symptom each time (OOM, then"
$lines += "OOM death spiral, then a permanently pegged CPU). This check watches the ratio rather"
$lines += "than any single table, so the next flood is visible even if it comes from somewhere new."
$lines += ""
$lines += "Config SSOT: ``lobster-factory/infra/trigger/clickhouse/override.xml``"

$content = ($lines -join "`n") + "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $reportDir "clickhouse-LATEST.md"), $content, $utf8NoBom)

$payload = [ordered]@{
    schemaVersion   = 1
    generatedAtUtc  = $now.ToUniversalTime().ToString("o")
    host            = $EuHost
    container       = $Container
    appDatabase     = $AppDatabase
    systemBytes     = $systemBytes
    systemRows      = $systemRows
    appBytes        = $appBytes
    appRows         = $appRows
    ratio           = $ratio
    activeMerges    = $merges
    maxPartsPerTable = $maxParts
    topSystemTable  = $topTable
    traceLogRowsLastHour = $traceRecent
    asyncMetricLogRowsLastHour = $asyncRecent
    verdict         = $worst
    verdictLabel    = $userLabel
    findings        = $reasons
}
[System.IO.File]::WriteAllText(
    (Join-Path $reportDir "clickhouse-LATEST.json"),
    ($payload | ConvertTo-Json -Depth 6),
    $utf8NoBom)

if ($Json) {
    $payload | ConvertTo-Json -Depth 6
} else {
    Write-Host ("ClickHouse health: {0} {1}" -f $icon, $userLabel)
    Write-Host ("  system={0} app={1} ratio={2}x merges={3}" -f (Format-Size $systemBytes), (Format-Size $appBytes), $ratio, $merges)
    foreach ($r in $reasons) { Write-Host ("  - {0}" -f $r) -ForegroundColor Yellow }
}

exit 0
