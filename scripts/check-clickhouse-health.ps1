#requires -Version 5.1
<#
.SYNOPSIS
SSH EU; measure ClickHouse self-telemetry vs application data; write LATEST report.

.DESCRIPTION
Auto-called by ao-resume.ps1 alongside check-backup-health.ps1 / check-cloudflare-security.ps1
/ check-vps-auto-reboot-health.ps1. Writes agency-os/reports/status/clickhouse-LATEST.md (+ .json).

WHY THIS EXISTS
ClickHouse on EU was "fixed" five times in five months and came back every time, because
each fix only ever raised the ceiling, deleted what had accumulated, or corrected the one
table that happened to be blowing up:

  04-20  OOM            -> memory cap 600MB -> 800MB
  04-29  OOM again      -> cap 800MB -> 1.6GB, mem_limit 1024m -> 2048m, first TTLs
  07-05  OOM death      -> cleared 20GB of logs, mem_limit -> 3072m, cap -> 2.5GB
         spiral (2344 OOM-kills)
  08-15  CPU pegged     -> finally disabled the GENERATORS (trace_log etc.)
         100% for days
  08-25  CPU pegged     -> removed the two ULTRA-WIDE tables (metric_log 1,344
         again, 3 days     columns, query_metric_log 939); moved every system-log
                           TTL into config so a restart cannot erase it

The 2026-04-29 commit comment already named trace_log by name. The diagnosis was right
three and a half months before the generators were switched off; every intervention in
between treated whichever resource had blown up rather than the input rate. Because the
ceiling kept rising, the bottleneck migrated from RAM to CPU and the symptom looked new
each time.

WHY THIS FILE GREW ON 2026-08-25 (read before adding a threshold)
Incident #5 ran for three days at 100% CPU while THIS CHECK reported only YELLOW, and it
was mathematically incapable of reporting anything worse: system data was 313 MiB (warn
at 2 GiB), concurrent merges were 3 (warn at 10), and the ratio was 8.3x. Every threshold
here had been calibrated against the SIGNATURE of the 2026-08-15 incident - accumulated
volume - and #5 had a different signature because the generators were already off. Its
mechanism was merges that could not complete: a 1,344-column table needs ~800 MiB per
merge, several ran at once, the 2.5 GiB cap aborted them, the parts were never consumed,
and the next attempt picked up even more parts. Volume stayed low precisely BECAUSE the
merges were failing.
So the probes below now measure the MECHANISM as well as the outcome: merge failures,
stalled merges, part backlog, table width, and whether the memory budget is still in
force. A detector calibrated on the last incident only ever catches the last incident.

WHAT THIS CHECKS (the class, not the specific table)
  ratio           system bytes vs application bytes. At the 2026-08-15 incident it was
                  inverted 345:1. Any table that starts flooding moves it.
  merge failures  failed background merge tasks per hour, from two independent
                  merge-specific sources (text_log's MergeTreeBackgroundExecutor and
                  part_log's MergeParts error column). The #5 mechanism; 116,770 such
                  log rows in 24h went completely unreported by the pre-2026-08-25 checks.
  server-wide OOM MEMORY_LIMIT_EXCEEDED per hour, reported separately and worded
                  separately, because system.error_log cannot attribute a cause.
  stalled merges  merges at progress=0 for over a minute - a merge that cannot finish.
  part backlog    max active parts in one PARTITION, in BOTH databases - an absolute
                  level, not a trend. The application side closes the 2026-07-05 class
                  (3002 parts in task_events).
  table width     widest system-log table. metric_log had 1,344 columns; nothing that
                  wide can be merged inside this container's budget.
  budget in force merges_mutations_memory_usage_soft_limit != 0, i.e. background merges
                  still have a memory bound at all.
  no TTL          any system MergeTree table with no TTL - unbounded disk growth.
  retired tables  any generator removed in override.xml that has come back.

Verdict:
  GREEN healthy - everything within budget, no retired generator back, merges completing
  YELLOW drift  - ratio > 5x, system data > 2 GiB, merge backlog, part backlog, a table
                  wider than 200 columns, no-TTL table, orphan table, budget not in force
  RED broken    - ratio > 20x, system data > 8 GiB, a retired generator is ingesting,
                  sustained merge failures, or merges stalled at zero progress

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
    # 2026-08-28 consolidation: trigger-clickhouse now lives on ks-aw-01.
    [string]$EuHost = "145.239.195.47",
    [string]$SshUser = "ubuntu",
    [string]$PrivateKey = (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
    [string]$Container = "trigger-clickhouse",
    [string]$AppDatabase = "trigger_dev",
    [string]$WorkRoot = "",
    [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "lib\ssh-deadline.ps1")

$ICON_HEALTHY = [char]::ConvertFromUtf32(0x1F7E2)  # green circle
$ICON_DRIFT   = [char]::ConvertFromUtf32(0x1F7E1)  # yellow circle
$ICON_BROKEN  = [char]::ConvertFromUtf32(0x1F534)  # red circle

# Thresholds. Ratio is the primary OUTCOME signal; the absolute sizes stop a tiny app
# database from making an ordinary system database look catastrophic. The MERGEFAIL /
# STALLED / PARTS / WIDTH thresholds are the MECHANISM signals added after 2026-08-25,
# when the outcome signals alone could not exceed YELLOW during a three-day outage.
$RATIO_WARN  = 5
$RATIO_FAIL  = 20
$BYTES_WARN  = 2GB
$BYTES_FAIL  = 8GB
$MERGE_WARN  = 10

# Failed background merge tasks in the last hour (merge-specific; see the probe comment).
# A healthy instance is flat zero here - a merge either succeeds or is not attempted - so
# WARN is deliberately low. The 2026-08-25 incident ran at roughly 4,900/hour.
$MERGEFAIL_WARN = 5
$MERGEFAIL_FAIL = 200

# Server-wide MEMORY_LIMIT_EXCEEDED (code 241) in the last hour, from any source: merges,
# mutations, or user queries. Reported separately from merge failures so the two are never
# confused - during the 2026-08-25 incident they coincided, but they need not.
# system.error_log.value is a per-interval delta, not a cumulative counter: verified
# 2026-08-25 by observing rows stop appearing entirely once the errors stopped
# (0 rows / sum 0 in the following 15 minutes), which rules out sum() inflation.
$OOM241_WARN = 20

# Merges sitting at progress=0 for over a minute. On a healthy instance this is 0: a merge
# either progresses or finishes. Anything above zero means merges are being retried, which
# is the shape of the 2026-08-25 ratchet, so it is a hard failure rather than a warning.
$STALLED_FAIL = 1

# Max ACTIVE parts in a single PARTITION, checked in both databases (see the probe comment
# for why per-partition and not per-table). This is an ABSOLUTE LEVEL check, not a trend
# detector: it answers "is the backlog large right now", and a run where parts crept from
# 5 to 29 still reports healthy (codex oracle 2026-08-25 FINDING 3 - confirmed true; the
# prose used to claim trend detection and has been corrected).
# A cross-run trend detector was considered and rejected: this script runs on AO-RESUME,
# which is irregular by hours or days, so a delta between two runs has no stable time base
# and would produce noise, not signal.
# The absolute levels are what make that acceptable. Calibration, all measured on this
# instance: healthy is 11 in system and 4 in trigger_dev; ClickHouse's own protections do
# not engage until parts_to_delay_insert=1000 and parts_to_throw_insert=3000. So 30/80
# fires one to two orders of magnitude before ClickHouse would throttle or reject inserts,
# which leaves ample room to notice a slow climb between two AO-RESUME runs.
# Incident values: 2026-08-25 (system.metric_log) 83; 2026-07-05 (trigger_dev.task_events)
# 3002 - i.e. that one had already hit parts_to_throw_insert and was refusing writes.
$PARTS_WARN = 30
$PARTS_FAIL = 80

# Widest system-log table, in columns. After 2026-08-25 the widest is query_log at 84.
# metric_log (removed) was 1,344 and query_metric_log (removed) was 939 - a merge of a
# table that wide costs ~800 MiB in per-column write buffers and cannot fit this budget.
# Warn only: width is a hazard, not a fault, until merges actually start failing.
$WIDTH_WARN = 200

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
        "-o", "StrictHostKeyChecking=accept-new",
        "-i", $PrivateKey,
        "-p", "58122",
        ("{0}@{1}" -f $SshUser, $ServerHost),
        $Command
    )
    $r = Invoke-SshWithDeadline -SshArgs $sshArgs -DeadlineSec 120 -ConnectTimeoutSec 15
    return @{
        ExitCode = $r.ExitCode
        Output   = $r.Output
        TimedOut = $r.TimedOut
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
# Parts are counted PER PARTITION, not per table. ClickHouse never merges across
# partitions, so a table partitioned by day legitimately holds one part per day:
# trigger_dev.metrics_v1 (PARTITION BY toDate(bucket_start), 60-day TTL) shows 61 parts
# per table and 4 per partition. Counting per table would fail that healthy table
# permanently, and a permanently-red detector gets ignored - which is how this whole
# class of incident stays invisible. Per partition, a high count really is a backlog.
echo "max_parts=$(q "SELECT max(c) FROM (SELECT count() AS c FROM system.parts WHERE active AND database='system' GROUP BY table, partition)")"
echo "app_max_parts_combo=$(q "SELECT concat(table,':',toString(c)) FROM (SELECT table, count() AS c FROM system.parts WHERE active AND database='__APPDB__' GROUP BY table, partition ORDER BY c DESC LIMIT 1)")"
echo "top_table=$(q "SELECT concat(table,':',toString(sum(bytes_on_disk))) FROM system.parts WHERE active AND database='system' GROUP BY table ORDER BY sum(bytes_on_disk) DESC LIMIT 1")"
echo "mergetree_total=$(q "SELECT count() FROM system.tables WHERE database='system' AND engine='MergeTree'")"
# Mechanism probes (2026-08-25). Merge failures are counted from two INDEPENDENT
# merge-specific sources and the verdict takes the larger, so one going blind does not
# read as healthy:
#   text_log   MergeTreeBackgroundExecutor is the logger that runs background merge and
#              mutation tasks; an Error from it means a merge task failed, whatever the
#              cause. Proven signal: 116,770 such rows in 24h during the incident. Needs
#              <level>warning</level> or lower in override.xml, which is set.
#   part_log   MergeParts rows carry an `error` column; non-zero is a failed merge.
# Deliberately NOT keyed on error code 241: system.error_log is server-wide, so a heavy
# ad-hoc query that runs out of memory would be reported as a merge loop and send the
# operator down the wrong path (codex oracle 2026-08-25 FINDING 2 - confirmed true).
# Code 241 is still probed below, but reported as its own server-wide signal.
echo "merge_fail_1h=$(q "SELECT count() FROM system.text_log WHERE event_time > now() - INTERVAL 1 HOUR AND logger_name = 'MergeTreeBackgroundExecutor' AND level IN ('Fatal','Critical','Error')")"
echo "merge_fail_partlog_1h=$(q "SELECT count() FROM system.part_log WHERE event_time > now() - INTERVAL 1 HOUR AND event_type = 'MergeParts' AND error != 0")"
echo "oom_241_1h=$(q "SELECT sum(value) FROM system.error_log WHERE code=241 AND event_time > now() - INTERVAL 1 HOUR")"
echo "stalled_merges=$(q "SELECT count() FROM system.merges WHERE progress = 0 AND elapsed > 60")"
echo "widest_combo=$(q "SELECT concat(table,':',toString(count())) FROM system.columns WHERE database='system' AND table IN (SELECT name FROM system.tables WHERE database='system' AND engine='MergeTree') GROUP BY table ORDER BY count() DESC LIMIT 1")"
echo "merge_budget=$(q "SELECT value FROM system.server_settings WHERE name='merges_mutations_memory_usage_soft_limit'")"
# Existence, not row counts: ClickHouse only creates a system log table when its logger is
# enabled, so a retired generator existing at all means override.xml was reverted or a
# ClickHouse upgrade re-introduced it. Row-count probes on a dropped table return an error
# that q() swallows into "0", which is indistinguishable from healthy - the exact blind
# spot AGENTS.md warns about, so existence is the signal.
echo "retired_combo=$(q "SELECT concat(toString(count()),'|',arrayStringConcat(arraySort(groupArray(name)),',')) FROM system.tables WHERE database='system' AND name IN ('trace_log','asynchronous_metric_log','metric_log','query_metric_log','query_thread_log','s3queue_log')")"
echo "no_ttl_combo=$(q "SELECT concat(toString(count()),'|',arrayStringConcat(arraySort(groupArray(name)),',')) FROM system.tables WHERE database='system' AND engine='MergeTree' AND NOT match(name,'_[0-9]+$') AND position(engine_full,'TTL')=0")"
echo "orphan_dup_count=$(q "SELECT count() FROM system.tables WHERE database='system' AND engine='MergeTree' AND match(name,'_[0-9]+$')")"
'@
$remoteScript = $remoteScript.Replace("__APPDB__", $AppDatabase)

$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($remoteScript -replace "`r`n", "`n")))
$remoteCmd = "sudo docker exec -e B64=$b64 $Container sh -lc 'echo `$B64 | base64 -d | sh'"

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
$systemRows = 0L; $appRows = 0L
$topTable = ""
$ratio = 0.0
$noTtlCount = 0L; $noTtlNames = ""; $orphanDupCount = 0L; $mergetreeTotal = 0L
$mergeFail1h = 0L; $stalledMerges = 0L; $mergeBudget = 0L
$widestTable = ""; $widestCols = 0L
$appMaxParts = 0L; $appMaxPartsTable = ""
$retiredCount = 0L; $retiredNames = ""

# "table:number" -> name + value. Used by widest_combo and app_max_parts_combo so the name
# and its number arrive from one query and cannot disagree (same reasoning as no_ttl_combo).
function Split-Combo {
    param([string]$Combo)
    if (-not $Combo) { return @{ Name = ""; Value = 0L } }
    $idx = $Combo.LastIndexOf(":")
    if ($idx -lt 0) { return @{ Name = $Combo; Value = 0L } }
    return @{
        Name  = $Combo.Substring(0, $idx)
        Value = (To-Long $Combo.Substring($idx + 1))
    }
}

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
    $mergetreeTotal = To-Long (Parse-Kv $res.Output "mergetree_total")
    $orphanDupCount = To-Long (Parse-Kv $res.Output "orphan_dup_count")
    # Two independent merge-failure sources; the larger wins so that one probe returning
    # an empty string (query error swallowed by q()) cannot mask the other.
    $mergeFailText  = To-Long (Parse-Kv $res.Output "merge_fail_1h")
    $mergeFailParts = To-Long (Parse-Kv $res.Output "merge_fail_partlog_1h")
    $mergeFail1h    = [Math]::Max($mergeFailText, $mergeFailParts)
    $oom241         = To-Long (Parse-Kv $res.Output "oom_241_1h")
    $stalledMerges  = To-Long (Parse-Kv $res.Output "stalled_merges")
    $mergeBudget    = To-Long (Parse-Kv $res.Output "merge_budget")

    $widest = Split-Combo (Parse-Kv $res.Output "widest_combo")
    $widestTable = $widest.Name; $widestCols = $widest.Value

    $appParts = Split-Combo (Parse-Kv $res.Output "app_max_parts_combo")
    $appMaxPartsTable = $appParts.Name; $appMaxParts = $appParts.Value

    $retiredCombo = Parse-Kv $res.Output "retired_combo"
    if ($retiredCombo) {
        $retiredParts = $retiredCombo.Split("|", 2)
        $retiredCount = To-Long $retiredParts[0]
        $retiredNames = if ($retiredParts.Length -gt 1) { $retiredParts[1] } else { "" }
    }

    # count and names come back as one atomic "count|comma,sorted,names" field so a
    # transient catalog change between two separate queries can't split them apart
    # (critic 2026-08-19 m1: two independent round-trips could disagree).
    $noTtlCombo = Parse-Kv $res.Output "no_ttl_combo"
    if ($noTtlCombo) {
        $comboParts = $noTtlCombo.Split("|", 2)
        $noTtlCount = To-Long $comboParts[0]
        $noTtlNames = if ($comboParts.Length -gt 1) { $comboParts[1] } else { "" }
    }

    if ($appBytes -gt 0) { $ratio = [math]::Round($systemBytes / [double]$appBytes, 1) }

    # critic 2026-08-19 M1: system.tables can never legitimately report 0 MergeTree
    # tables (11 today) - if the probe query itself failed (memory-limit error,
    # TOO_MANY_SIMULTANEOUS_QUERIES, etc, all `2>/dev/null`'d by `q()`), no_ttl/orphan
    # would render as a clean "0" that is indistinguishable from genuinely healthy.
    # That failure mode overlaps exactly with the incident conditions this script
    # exists to catch (AGENTS.md: "偵測器啞了不可以長得像一切正常"), so treat it as a
    # blind spot rather than trusting the zero.
    if ($mergetreeTotal -le 0) {
        Set-Worst "drift"
        $reasons += "TTL/orphan probe returned nothing this run (mergetree_total=$mergetreeTotal) - detector blind, no-TTL and orphan-table results below are not trustworthy"
    } else {
        # A system log table's TTL does not survive a rename-and-recreate cycle: ClickHouse
        # renames the old table to <table>_N and builds a fresh one from the config-derived
        # definition, so anything applied with a live ALTER is silently lost. That is exactly
        # what the 2026-08-22 auto-reboot did to part_log / query_views_log /
        # opentelemetry_span_log, whose TTLs had been applied by ALTER on 2026-08-19.
        # Since 2026-08-25 every system log TTL is declared in override.xml instead, which
        # survives restarts - so a non-zero count here now means either a ClickHouse upgrade
        # added a new log table nobody has declared yet, or override.xml was reverted.
        # (Orphaned _N tables are excluded from this query - they're covered by the
        # orphan-count check below, and being unwritten leftovers they don't "grow".)
        if ($noTtlCount -gt 0) {
            Set-Worst "drift"
            $namesPart = if ($noTtlNames) { ": $noTtlNames" } else { " (names unavailable)" }
            $reasons += "$noTtlCount system table(s) have no TTL and will grow unbounded$namesPart"
        }
        if ($orphanDupCount -gt 0) {
            Set-Worst "drift"
            $reasons += "$orphanDupCount orphaned renamed system table(s) (_<N> suffix, any generation) left behind by a past rename-and-recreate cycle - safe to DROP after confirming the active table has the correct TTL"
        }
    }

    # Regression of the generators removed in override.xml (2026-08-15 and 2026-08-25).
    # Existence is the runtime truth: the config file can be right while the container
    # still runs an older config, and ClickHouse only creates these tables when their
    # logger is enabled.
    if ($retiredCount -gt 0) {
        Set-Worst "broken"
        $namesPart = if ($retiredNames) { ": $retiredNames" } else { " (names unavailable)" }
        $reasons += "$retiredCount retired system log table(s) have come back$namesPart - override.xml was reverted or a ClickHouse upgrade re-enabled the logger"
    }

    # The 2026-08-25 mechanism. Merges that abort never consume their parts, so the next
    # attempt takes on more parts and fails harder; the loop is a ratchet that does not
    # self-correct and survives restarts. Volume stays LOW while this happens, which is
    # why the ratio and byte thresholds below cannot see it.
    $mergeFailSrc = "text_log=$mergeFailText part_log=$mergeFailParts"
    if ($mergeFail1h -ge $MERGEFAIL_FAIL) {
        Set-Worst "broken"
        $reasons += "$mergeFail1h background merge task failures in the last hour ($mergeFailSrc; fail at $MERGEFAIL_FAIL) - merges are aborting and being retried, so their parts are never consumed; check the widest table and see override.xml MERGE MEMORY BUDGET"
    } elseif ($mergeFail1h -ge $MERGEFAIL_WARN) {
        Set-Worst "drift"
        $reasons += "$mergeFail1h background merge task failures in the last hour ($mergeFailSrc; warn at $MERGEFAIL_WARN)"
    }

    # Separate signal, separate wording: this one is server-wide and says nothing about
    # where the memory went. Merge failures above are the merge-specific claim.
    if ($oom241 -ge $OOM241_WARN) {
        Set-Worst "drift"
        $reasons += "$oom241 server-wide MEMORY_LIMIT_EXCEEDED errors in the last hour (warn at $OOM241_WARN) - source not attributed; could be merges, mutations or user queries"
    }
    if ($stalledMerges -ge $STALLED_FAIL) {
        Set-Worst "broken"
        $reasons += "$stalledMerges merge(s) stalled at progress=0 for over a minute - a merge that cannot complete will never release its parts"
    }

    # Merge memory budget still in force. 0 means unlimited, which is what allowed three
    # concurrent ~800 MiB merges inside a 2.5 GiB cap on 2026-08-25.
    if ($mergeBudget -le 0) {
        Set-Worst "drift"
        $reasons += "merges_mutations_memory_usage_soft_limit is 0 (unlimited) - background merges have no memory bound; override.xml sets this and the running container is not honouring it"
    }

    # Width hazard. Nothing this wide can be merged inside the container budget.
    if ($widestCols -ge $WIDTH_WARN) {
        Set-Worst "drift"
        $reasons += "widest system log table is $widestTable at $widestCols columns (warn at $WIDTH_WARN) - a merge costs roughly one write buffer per column; metric_log at 1,344 columns is what caused 2026-08-25"
    }

    # Part ratchet, both databases. System side caught 2026-08-25 (83 parts in metric_log);
    # application side covers 2026-07-05 (3002 parts in trigger_dev.task_events).
    if ($maxParts -ge $PARTS_FAIL) {
        Set-Worst "broken"
        $reasons += "a system partition holds $maxParts active parts (fail at $PARTS_FAIL) - merges are not keeping up"
    } elseif ($maxParts -ge $PARTS_WARN) {
        Set-Worst "drift"
        $reasons += "a system partition holds $maxParts active parts (warn at $PARTS_WARN)"
    }
    if ($appMaxParts -ge $PARTS_FAIL) {
        Set-Worst "broken"
        $reasons += "one $AppDatabase.$appMaxPartsTable partition holds $appMaxParts active parts (fail at $PARTS_FAIL) - this is the 2026-07-05 shape (3002 parts, 2344 OOM-kills at startup)"
    } elseif ($appMaxParts -ge $PARTS_WARN) {
        Set-Worst "drift"
        $reasons += "one $AppDatabase.$appMaxPartsTable partition holds $appMaxParts active parts (warn at $PARTS_WARN)"
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
$lines += ("| merges stalled at progress=0 | {0} (expected 0) |" -f $stalledMerges)
$lines += ("| failed merge tasks last hour | {0} (text_log {1} / part_log {2}; expected 0) |" -f $mergeFail1h, $mergeFailText, $mergeFailParts)
$lines += ("| server-wide MEMORY_LIMIT_EXCEEDED last hour | {0} (not attributed to a source) |" -f $oom241)
$lines += ("| merge memory budget | {0} |" -f $(if ($mergeBudget -gt 0) { Format-Size $mergeBudget } else { "0 - UNLIMITED" }))
$lines += ("| max parts in one system partition | {0} |" -f $maxParts)
$lines += ("| max parts in one {0} partition | {1}{2} |" -f $AppDatabase, $appMaxParts, $(if ($appMaxPartsTable) { " ($appMaxPartsTable)" } else { "" }))
$lines += ("| widest system log table | {0} |" -f $(if ($widestTable) { "$widestTable ($widestCols columns)" } else { "n/a" }))
$lines += ("| retired generators present | {0}{1} (expected 0) |" -f $retiredCount, $(if ($retiredNames) { " ($($retiredNames -replace '\|', '\|'))" } else { "" }))
# critic 2026-08-19 S3: a `|` in a table name would break this markdown row (no
# attack path today - names come from system.tables, not user input - but cheap
# to guard). JSON payload below needs no escaping, ConvertTo-Json handles it.
$noTtlNamesMd = $noTtlNames -replace '\|', '\|'
$lines += ("| system tables missing TTL | {0}{1} |" -f $noTtlCount, $(if ($noTtlNamesMd) { " ($noTtlNamesMd)" } else { "" }))
$lines += ("| orphaned renamed tables (_<N> suffix) | {0} |" -f $orphanDupCount)
$lines += ("| MergeTree tables seen this run | {0}{1} |" -f $mergetreeTotal, $(if ($mergetreeTotal -le 0) { " (blind spot - see findings)" } else { "" }))
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
$lines += "ClickHouse was fixed five times in five months (2026-04-20 / 04-29 / 07-05 / 08-15 / 08-25)."
$lines += "The first three raised the memory ceiling or deleted accumulated rows; none of them"
$lines += "stopped the generators, so it returned with a different symptom each time (OOM, then"
$lines += "OOM death spiral, then a permanently pegged CPU). 08-15 stopped the biggest generators."
$lines += "08-25 was different again: merges of a 1,344-column table could not fit the memory cap,"
$lines += "so they aborted and retried forever - and because the parts were never consumed, VOLUME"
$lines += "STAYED LOW and every volume-based threshold here stayed green through a three-day outage."
$lines += "So this check now watches the mechanism (merge failures, stalled merges, part backlog,"
$lines += "table width, memory budget in force) as well as the outcome (ratio, bytes)."
$lines += ""
$lines += "Config SSOT: ``lobster-factory/infra/trigger/clickhouse/override.xml``"

$content = ($lines -join "`n") + "`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $reportDir "clickhouse-LATEST.md"), $content, $utf8NoBom)

$payload = [ordered]@{
    schemaVersion   = 2
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
    appMaxPartsPerTable = $appMaxParts
    appMaxPartsTable = $appMaxPartsTable
    mergeFailuresLastHour = $mergeFail1h
    mergeFailuresTextLog = $mergeFailText
    mergeFailuresPartLog = $mergeFailParts
    serverWideOom241LastHour = $oom241
    stalledMerges   = $stalledMerges
    mergeMemoryBudgetBytes = $mergeBudget
    widestSystemLogTable = $widestTable
    widestSystemLogColumns = $widestCols
    retiredTablesPresent = $retiredCount
    retiredTableNames = $retiredNames
    mergeTreeTablesSeen = $mergetreeTotal
    noTtlTableCount = $noTtlCount
    noTtlTableNames = $noTtlNames
    orphanDupTableCount = $orphanDupCount
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
    Write-Host ("  system={0} app={1} ratio={2}x merges={3} stalled={4} mergefail1h={5} widest={6}" -f (Format-Size $systemBytes), (Format-Size $appBytes), $ratio, $merges, $stalledMerges, $mergeFail1h, $(if ($widestTable) { "${widestTable}:${widestCols}" } else { "n/a" }))
    foreach ($r in $reasons) { Write-Host ("  - {0}" -f $r) -ForegroundColor Yellow }
}

exit 0
