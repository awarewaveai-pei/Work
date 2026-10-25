#requires -Version 5.1
<#
    Capacity health for ks-aw-01 (SG/EU were consolidated into it 2026-08-28 and
    deleted 2026-08-30; their host/key parameters were removed 2026-09-24 -- no caller passed them).

    WHY THIS EXISTS
    ---------------
    ks-aw-01 is the KS-6 128 GB production host carrying soulful + Chatwoot + the
    whole EU/SG consolidation. It meets the 128 GB plan floor, but it is now the sole
    production host, so its capacity monitor remains a load-bearing control: if it is
    noisy, ignored, or silently broken, a whole-host exhaustion event is unmanaged.

    WHAT IT MEASURES, AND WHY NOT JUST "RAM %"
    ------------------------------------------
    Per runbooks/ADD-PERIODIC-HEALTH-CHECK.md (2026-08-25 addendum): measure the
    MECHANISM, not the last incident's signature. "Percent used" is a bad memory
    detector in both directions -- 85% can be harmless reclaimable page cache, and
    70% can be a box actively thrashing. So every dimension has an outcome probe AND
    a mechanism probe:

      dimension  outcome                    mechanism
      memory     MemAvailable / MemTotal    PSI /proc/pressure/memory (stall time)
      memory     -                          OOM kills (two independent sources)
      memory     swap used %                -
      disk       used %                     reclaimable docker garbage
      cpu        load1 per core             PSI /proc/pressure/cpu (stall time)
      service    -                          container restart counts, unhealthy count

    CPU was added on 2026-08-27 after the first real run reported SG at load 3.57 on
    2 cores while the check printed the number and passed it -- a dimension that was
    collected but never judged. PSI is primary and load average only corroborates,
    because Linux load also counts uninterruptible-IO tasks: a high load with flat PSI
    is a disk story, not a CPU one.

    MemAvailable, not free(1) "used": it is the kernel's own estimate of what can be
    allocated without swapping, and is the only number that means the same thing
    across kernels and cgroup versions.

    OOM is read from BOTH /proc/vmstat and the kernel journal, because vmstat resets at
    boot and the journal can be rotated away. One source going blind must not read as
    healthy. Only the journal can be dated, so it alone decides FAIL (kills in 24h) vs
    WARN (kills earlier in the 7-day window) -- see Get-HostVerdict.

    BLIND SPOTS
    -----------
    Any probe that returns nothing is recorded in blind_spots and forces the verdict
    to at least WARN. "The detector went quiet" must never wear the costume of
    "everything is fine" -- that is the 2026-08-03 soulful mail failure and the fifth
    ClickHouse incident, both of which looked green while broken.

    THRESHOLDS ARE MEASURED, NOT INVENTED
    -------------------------------------
    Calibrated 2026-08-27 against real readings from all three hosts (see
    $HOST_POLICY). ks-aw-01 is deliberately the strictest because it is the
    consolidation target with the thin headroom; SG and EU are small boxes that run
    hot by design and a 60% line there would be permanently yellow -- and a detector
    that is always yellow is a detector nobody reads.

    Read-only. No writes, no restarts, no pruning.
#>
[CmdletBinding()]
param(
    [string]$KsAw01Host = "145.239.195.47",
    [string]$KsAw01SshUser = "ubuntu",
    [int]$KsAw01SshPort = 58122,
    [string]$KsAw01PrivateKey = (Join-Path $env:USERPROFILE ".ssh\id_ed25519"),
    [string]$WorkRoot = "",
    [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# ssh with keepalive + hard total deadline; decodes stdout as UTF-8 itself (scripts/lib/ssh-deadline.ps1).
. (Join-Path $PSScriptRoot "lib\ssh-deadline.ps1")
. (Join-Path $PSScriptRoot "lib\_detector-contract.ps1")

# -------------------------------------------------------------------------------------
# Per-host policy. Calibrated 2026-08-27 from measured readings:
#   ks-aw-01  mem  8% used  disk  2%   (all production services; 16 cores, 128 GB, 954 GB RAID)
#   SG        mem 53% used  disk 70%   (10 containers, 3.7 GB, 2 cores)
#   EU        mem 62% used  disk 55%   (29 containers, 7.6 GB, 4 cores)
# SG disk sits at 70% today with ~27 GB reclaimable docker garbage, so its warn line is
# set ABOVE today's reading on purpose: arming a threshold that is already tripped
# produces a permanently-yellow check, which is the same as no check at all. The
# reclaimable figure is reported alongside so a high number explains itself instead of
# just glowing.
# -------------------------------------------------------------------------------------
$HOST_POLICY = @{
    "ks-aw-01" = @{ MemWarnUsedPct = 60; MemFailUsedPct = 85; DiskWarnPct = 60; DiskFailPct = 80 }
    "SG"       = @{ MemWarnUsedPct = 80; MemFailUsedPct = 92; DiskWarnPct = 80; DiskFailPct = 90 }
    "EU"       = @{ MemWarnUsedPct = 80; MemFailUsedPct = 92; DiskWarnPct = 75; DiskFailPct = 88 }
}
# Mechanism thresholds are host-independent: a stalled task is a stalled task.
$PSI_MEM_FULL_WARN = 1.0    # % of wall time ALL runnable tasks were stalled on memory
$PSI_MEM_SOME_WARN = 10.0   # % of wall time at least one task was stalled on memory
$PSI_CPU_SOME_WARN = 30.0   # % of wall time at least one task was stalled waiting for CPU
$PSI_CPU_SOME_FAIL = 60.0
$LOAD_PER_CORE_WARN = 1.5   # secondary context only: load avg also counts D-state (IO) tasks
$SWAP_USED_WARN_PCT = 50
$RESTART_WARN_COUNT = 3

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
    param(
        [Parameter(Mandatory = $true)][string]$ServerHost,
        [Parameter(Mandatory = $true)][string]$Command,
        [string]$User = $SshUser,
        [string]$Key = $PrivateKey,
        [int]$Port = 22
    )
    $sshArgs = @(
        "-o", "StrictHostKeyChecking=accept-new",
        "-p", $Port,
        "-i", $Key,
        ("{0}@{1}" -f $User, $ServerHost),
        $Command
    )
    # Helper owns BatchMode/ConnectTimeout/ServerAlive* and a hard total deadline. ServerAlive* alone
    # drops a dead link; a host that ACCEPTS the connection and then stalls -- memory thrash or IO
    # saturation, i.e. precisely what this check exists to detect -- needs the deadline. This runs inside
    # a blocking UserPromptSubmit hook, so an unbounded call hangs the operator's first prompt of the day.
    # Timeout = ExitCode -1, which lands in the host-unreachable (BLIND) path. Benign ssh stderr notices
    # are captured by the helper, so none can raise NativeCommandError under the script-level 'Stop'.
    $r = Invoke-SshWithDeadline -SshArgs $sshArgs -DeadlineSec 105 -ConnectTimeoutSec 15
    return @{
        ExitCode = $r.ExitCode
        Output   = $r.Output
        TimedOut = $r.TimedOut
    }
}

function Parse-ResultLine {
    param([string]$Output, [string]$Key)
    $prefix = $Key + "="
    foreach ($line in ($Output -split "`n")) {
        $t = $line.Trim()
        if ($t.StartsWith($prefix)) { return $t.Substring($prefix.Length) }
    }
    return ""
}

# Numeric coercion that distinguishes "measured zero" from "did not measure".
# Returns $null when unparseable, and every caller treats $null as a blind spot rather
# than as a passing value.
function ConvertTo-NumOrNull {
    param([string]$Raw)
    if ($null -eq $Raw) { return $null }
    $t = $Raw.Trim()
    if ($t -eq "") { return $null }
    # InvariantCulture explicitly: the default overload uses CurrentCulture, and under a
    # comma-decimal locale "1.94" parses as 194 and PSI "0.17" as 17 -- turning every reading
    # into a false FAIL. This machine is zh-TW (dot decimal) today; that is luck, not design.
    $parsed = 0.0
    if ([double]::TryParse($t, [Globalization.NumberStyles]::Float,
                           [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) { return $parsed }
    return $null
}

function Get-HostCapacity {
    param(
        [Parameter(Mandatory = $true)][string]$ServerHost,
        [string]$User = $SshUser,
        [string]$Key = $PrivateKey,
        [int]$Port = 22,
        [switch]$UseSudo
    )

    # NOTE: `df --output` is deliberately used WITHOUT -P. GNU df rejects the two as
    # mutually exclusive ("df: options -P and --output are mutually exclusive"), and
    # because the error goes to stderr inside a pipeline the loop simply reads nothing
    # -- the probe reports no disk data at all while exiting 0. That bug was written and
    # caught during this script's own calibration run on 2026-08-27; it is precisely the
    # silent-detector failure this check exists to prevent, so it is pinned here in a
    # comment rather than left as folklore.
    $parts = @(
        'set -uo pipefail',
        'kv(){ printf "%s=%s\n" "$1" "$2"; }',
        # The two slow probes run in PARALLEL, each under its own timeout. Measured on ks-aw-01
        # 2026-10-25: journalctl -k over 7 days = 43s (500k kernel lines, 2 GB journal),
        # docker system df = 18.5s. Run serially they overran the whole-probe timeout, and the
        # host was reported "unreachable" while 636 OOM kills sat unreported. A slow sub-probe
        # must cost only its own field (empty -> blind spot), never the whole host.
        'tmpd=$(mktemp -d); trap "rm -rf $tmpd" EXIT',
        # _TRANSPORT=kernel, NOT -k: -k implies -b (current boot only), so an OOM before the
        # 20:00 UTC unattended-upgrades reboot would vanish from both journal and vmstat (47s, measured).
        '( timeout 70 journalctl _TRANSPORT=kernel --since "7 days ago" -o short-unix 2>/dev/null | grep -iE "out of memory: killed|oom-kill:" > "$tmpd/oom"; echo "${PIPESTATUS[0]}" > "$tmpd/oom.rc" ) &',
        'if command -v docker >/dev/null 2>&1; then ( timeout 30 docker system df --format "{{.Type}}={{.Reclaimable}}" 2>/dev/null | tr "\n" "," | sed "s/,$//" > "$tmpd/df"; echo "${PIPESTATUS[0]}" > "$tmpd/df.rc" ) & fi',
        'mt=$(awk "/^MemTotal:/{print \$2}" /proc/meminfo 2>/dev/null || echo "")',
        'ma=$(awk "/^MemAvailable:/{print \$2}" /proc/meminfo 2>/dev/null || echo "")',
        'st=$(awk "/^SwapTotal:/{print \$2}" /proc/meminfo 2>/dev/null || echo "")',
        'sf=$(awk "/^SwapFree:/{print \$2}" /proc/meminfo 2>/dev/null || echo "")',
        'kv MEM_TOTAL_KB "${mt:-}"; kv MEM_AVAIL_KB "${ma:-}"',
        'kv SWAP_TOTAL_KB "${st:-}"; kv SWAP_FREE_KB "${sf:-}"',
        'for r in memory io cpu; do f="/proc/pressure/$r"; if [ -r "$f" ]; then',
        '  kv "PSI_$(echo $r | tr a-z A-Z)_SOME" "$(awk "/^some/{for(i=1;i<=NF;i++) if(\$i ~ /^avg60=/){sub(\"avg60=\",\"\",\$i); print \$i}}" "$f")";',
        '  kv "PSI_$(echo $r | tr a-z A-Z)_FULL" "$(awk "/^full/{for(i=1;i<=NF;i++) if(\$i ~ /^avg60=/){sub(\"avg60=\",\"\",\$i); print \$i}}" "$f")";',
        'else kv "PSI_$(echo $r | tr a-z A-Z)_SOME" ""; kv "PSI_$(echo $r | tr a-z A-Z)_FULL" ""; fi; done',
        'kv OOM_VMSTAT "$(awk "/^oom_kill /{print \$2}" /proc/vmstat 2>/dev/null || echo "")"',
        'wait',
        # Only a journalctl that finished (rc 0) yields a count: grep -c on a timed-out, empty
        # stream prints "0", which would read as "measured: no OOM kills".
        'if [ "$(cat "$tmpd/oom.rc" 2>/dev/null)" = 0 ]; then',
        '  kv OOM_JOURNAL "$(grep -ci "out of memory: killed" "$tmpd/oom" || true)"',
        '  kv OOM_JOURNAL_24H "$(grep -i "out of memory: killed" "$tmpd/oom" | awk -v c="$(( $(date +%s) - 86400 ))" "int(\$1)>c{n++} END{print n+0}")"',
        '  kv OOM_MEMCG "$(grep -o "task_memcg=/system.slice/docker-[0-9a-f]*" "$tmpd/oom" | sed "s#.*docker-##" | sort | uniq -c | sort -rn | head -5 | while read n id; do nm=$(docker inspect --format "{{.Name}}" "$id" 2>/dev/null | sed "s#^/##"); printf "%s(%s) " "${nm:-${id:0:12}}" "$n"; done)"',
        'else kv OOM_JOURNAL ""; kv OOM_JOURNAL_24H ""; kv OOM_MEMCG ""; fi',
        'root_line=$(df -k --output=size,used,pcent,target 2>/dev/null | awk "\$4==\"/\"{print \$1\" \"\$2\" \"\$3; exit}")',
        'kv DISK_TOTAL_KB "$(printf "%s" "$root_line" | awk "{print \$1}")"',
        'kv DISK_USED_KB  "$(printf "%s" "$root_line" | awk "{print \$2}")"',
        'kv DISK_PCT      "$(printf "%s" "$root_line" | awk "{gsub(\"%\",\"\",\$3); print \$3}")"',
        'kv INODE_PCT "$(df -i / 2>/dev/null | awk "NR==2{gsub(\"%\",\"\",\$5); print \$5}")"',
        'if command -v docker >/dev/null 2>&1; then',
        '  kv CONTAINERS_RUNNING "$(docker ps -q 2>/dev/null | wc -l)"',
        '  kv CONTAINERS_TOTAL "$(docker ps -aq 2>/dev/null | wc -l)"',
        '  kv CONTAINERS_UNHEALTHY "$(docker ps --filter health=unhealthy -q 2>/dev/null | wc -l)"',
        '  kv DOCKER_PRESENT 1
  kv RESTARTS_MEASURED 1
  ids=$(docker ps -aq 2>/dev/null)',
        '  if [ -n "$ids" ]; then kv RESTARTS "$(docker inspect --format "{{.Name}}:{{.RestartCount}}" $ids 2>/dev/null | sed "s#^/##" | awk -F: "\$2>0{printf \"%s(%s) \", \$1, \$2}")"; else kv RESTARTS ""; fi',
        # Sorted by ACTUAL memory, normalised to MiB first. `head -6` on docker's own
        # output orders by container id, not size -- which produced a field labelled
        # "Top memory" that listed 552.9MiB above 1.222GiB. A mislabelled field is worse
        # than no field: it sends whoever is chasing a yellow box after the wrong
        # container. (runbooks/ADD-PERIODIC-HEALTH-CHECK.md: "name what you measured".)
        '  kv TOP_MEM "$(timeout 20 docker stats --no-stream --format "{{.Name}} {{.MemUsage}}" 2>/dev/null | awk "{v=\$2; u=v; sub(/[0-9.]+/,\"\",u); sub(/[A-Za-z]+/,\"\",v); m=v+0; if(u ~ /^GiB/) m=v*1024; else if(u ~ /^KiB/) m=v/1024; else if(u ~ /^B/) m=v/1048576; printf \"%.2f %s=%s\\n\", m, \$1, \$2}" | sort -rn | head -6 | cut -d" " -f2- | tr "\n" " ")"',
        # Labelled per type. The bare figures joined by "+" were unreadable, and the
        # split matters: 11 GB of reclaimable BUILD CACHE and 11 GB of real image layers
        # call for completely different responses.
        '  kv RECLAIMABLE "$([ "$(cat "$tmpd/df.rc" 2>/dev/null)" = 0 ] && cat "$tmpd/df")"',
        'else',
        '  kv DOCKER_PRESENT 0; kv RESTARTS_MEASURED 0
  kv CONTAINERS_RUNNING ""; kv CONTAINERS_TOTAL ""; kv CONTAINERS_UNHEALTHY ""',
        '  kv RESTARTS ""; kv TOP_MEM ""; kv RECLAIMABLE ""',
        'fi',
        'kv CPU_CORES "$(nproc 2>/dev/null || echo "")"',
        'kv LOAD1 "$(awk "{print \$1}" /proc/loadavg 2>/dev/null || echo "")"',
        'kv UPTIME_DAYS "$(awk "{printf \"%d\", \$1/86400}" /proc/uptime 2>/dev/null || echo "")"',
        'kv PROBE_OK 1'
    )
    $raw = ($parts -join "`n")
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($raw))
    # timeout on the REMOTE side too: journalctl -k over 7 days, docker stats across 29
    # containers and docker system df all walk a lot of state and are individually unbounded.
    # A stall lands in the ExitCode -ne 0 path and degrades to WARN -- the correct verdict for
    # "could not measure".
    $remoteTimeoutSec = 85
    $bashRunner = if ($UseSudo) { "sudo timeout $remoteTimeoutSec bash" } else { "timeout $remoteTimeoutSec bash" }
    $cmd = "echo $b64 | base64 -d | $bashRunner"
    $res = Invoke-Ssh -ServerHost $ServerHost -Command $cmd -User $User -Key $Key -Port $Port

    # A probe that stalled part-way still measured everything printed before the stall. Keep it:
    # missing fields parse to $null and become per-dimension blind spots. Only a probe that
    # produced no memory line at all is "not measured" for the whole host.
    $probeError = ""
    if ($res.ExitCode -ne 0 -or (Parse-ResultLine -Output $res.Output -Key "PROBE_OK") -ne "1") {
        $probeError = if ($res.TimedOut) { "ssh deadline exceeded" }
                      elseif ($res.ExitCode -eq 124) { "remote probe hit its " + $remoteTimeoutSec + "s timeout" }
                      else { "remote probe exit " + $res.ExitCode }
        if ((Parse-ResultLine -Output $res.Output -Key "MEM_TOTAL_KB") -eq "") {
            return [ordered]@{
                host = $ServerHost; ok = $false
                error = $probeError + $(if ($res.Output) { ": " + (($res.Output -split "`n" | Select-Object -First 3) -join " / ") } else { ": no output" })
            }
        }
    }

    $memTotal = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "MEM_TOTAL_KB")
    $memAvail = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "MEM_AVAIL_KB")
    $swapTotal = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "SWAP_TOTAL_KB")
    $swapFree = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "SWAP_FREE_KB")

    # $null - $null evaluates to [int]0 in PowerShell, so computing this at RENDER time
    # printed "0G of ?" -- claiming a measurement that never happened, which is exactly the
    # distinction ConvertTo-NumOrNull exists to preserve. Computed once, stays $null.
    $memUsedKb = $null
    $memUsedPct = $null
    if ($null -ne $memTotal -and $null -ne $memAvail) {
        $memUsedKb = $memTotal - $memAvail
        if ($memTotal -gt 0) { $memUsedPct = [math]::Round(($memUsedKb / $memTotal) * 100, 1) }
    }
    $swapUsedPct = $null
    if ($null -ne $swapTotal -and $null -ne $swapFree -and $swapTotal -gt 0) {
        $swapUsedPct = [math]::Round((($swapTotal - $swapFree) / $swapTotal) * 100, 1)
    }

    return [ordered]@{
        host                = $ServerHost
        ok                  = $true
        error               = ""
        probe_error         = $probeError
        mem_total_kb        = $memTotal
        mem_avail_kb        = $memAvail
        mem_used_kb         = $memUsedKb
        mem_used_pct        = $memUsedPct
        swap_used_pct       = $swapUsedPct
        psi_mem_some        = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "PSI_MEMORY_SOME")
        psi_mem_full        = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "PSI_MEMORY_FULL")
        psi_io_some         = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "PSI_IO_SOME")
        psi_cpu_some        = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "PSI_CPU_SOME")
        oom_vmstat          = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "OOM_VMSTAT")
        oom_journal         = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "OOM_JOURNAL")
        oom_journal_24h     = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "OOM_JOURNAL_24H")
        oom_memcg           = (Parse-ResultLine -Output $res.Output -Key "OOM_MEMCG").Trim()
        disk_total_kb       = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "DISK_TOTAL_KB")
        disk_used_kb        = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "DISK_USED_KB")
        disk_pct            = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "DISK_PCT")
        inode_pct           = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "INODE_PCT")
        containers_running  = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "CONTAINERS_RUNNING")
        containers_total    = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "CONTAINERS_TOTAL")
        containers_unhealthy= ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "CONTAINERS_UNHEALTHY")
        restarts            = (Parse-ResultLine -Output $res.Output -Key "RESTARTS").Trim()
        restarts_measured   = ((Parse-ResultLine -Output $res.Output -Key "RESTARTS_MEASURED") -eq "1")
        docker_present      = ((Parse-ResultLine -Output $res.Output -Key "DOCKER_PRESENT") -eq "1")
        top_mem             = (Parse-ResultLine -Output $res.Output -Key "TOP_MEM").Trim()
        reclaimable         = (Parse-ResultLine -Output $res.Output -Key "RECLAIMABLE").Trim()
        cpu_cores           = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "CPU_CORES")
        load1               = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "LOAD1")
        uptime_days         = ConvertTo-NumOrNull (Parse-ResultLine -Output $res.Output -Key "UPTIME_DAYS")
    }
}

# Per-host degradation, never a global fatal: one unreachable host must not blind the
# other two.
function Invoke-HostCheck {
    param(
        [Parameter(Mandatory = $true)][hashtable]$CheckArgs,
        [Parameter(Mandatory = $true)][string]$KeyPath,
        [Parameter(Mandatory = $true)][string]$Label
    )
    # NOTE: deliberately NOT named $Args -- that collides with PowerShell's automatic
    # $args and under Set-StrictMode -Version Latest throws PropertyNotFoundStrict on
    # the degradation path only (see check-backup-health.ps1:183).
    $targetHost = $CheckArgs.ServerHost
    if (-not (Test-Path -LiteralPath $KeyPath)) {
        return [ordered]@{ host = $targetHost; ok = $false; error = "SSH private key not found: $KeyPath" }
    }
    try { return Get-HostCapacity @CheckArgs }
    catch { return [ordered]@{ host = $targetHost; ok = $false; error = ("check threw: " + $_.Exception.Message) } }
}

# -------------------------------------------------------------------------------------
# Verdict. Returns the label plus the reasons and the blind spots, because a bare colour
# with no reason is not actionable and gets ignored.
# -------------------------------------------------------------------------------------
function Get-HostVerdict {
    param($Policy, $Data)

    $reasons = New-Object System.Collections.ArrayList
    $blind   = New-Object System.Collections.ArrayList
    $level   = 0   # 0 PASS, 1 WARN, 2 FAIL

    # A host with no $HOST_POLICY entry used to reach $Policy.MemFailUsedPct and throw, killing
    # the whole run. This file exists BECAUSE more services are being consolidated onto
    # ks-aw-01, so a fourth host is a matter of when -- and adding one to $results without
    # touching $HOST_POLICY must never turn the compensating control into an exception.
    if ($null -eq $Policy) {
        [void]$blind.Add("no threshold policy defined for this host")
        return @{ level = 1; reasons = @(); blind = $blind.ToArray() }
    }

    if (-not $Data.ok) {
        [void]$blind.Add("host not measured: " + $Data.error)
        return @{ level = 1; reasons = @(); blind = $blind.ToArray() }
    }
    if ($Data.probe_error) { [void]$blind.Add("probe incomplete (" + $Data.probe_error + "); fields after the stall are missing") }

    # --- outcome: memory
    if ($null -eq $Data.mem_used_pct) { [void]$blind.Add("memory not measured") }
    elseif ($Data.mem_used_pct -ge $Policy.MemFailUsedPct) {
        $level = [math]::Max($level, 2); [void]$reasons.Add("memory " + $Data.mem_used_pct + "% used (fail >= " + $Policy.MemFailUsedPct + "%)")
    } elseif ($Data.mem_used_pct -ge $Policy.MemWarnUsedPct) {
        $level = [math]::Max($level, 1); [void]$reasons.Add("memory " + $Data.mem_used_pct + "% used (warn >= " + $Policy.MemWarnUsedPct + "%)")
    }

    # --- mechanism: PSI. Moves before MemAvailable does, and stays flat when high usage
    # is harmless page cache.
    if ($null -eq $Data.psi_mem_full) { [void]$blind.Add("PSI memory not readable") }
    elseif ($Data.psi_mem_full -gt $PSI_MEM_FULL_WARN) {
        $level = [math]::Max($level, 2); [void]$reasons.Add("memory stall (PSI full avg60 " + $Data.psi_mem_full + "%) -- tasks are BLOCKED on memory")
    } elseif ($null -ne $Data.psi_mem_some -and $Data.psi_mem_some -gt $PSI_MEM_SOME_WARN) {
        $level = [math]::Max($level, 1); [void]$reasons.Add("memory pressure (PSI some avg60 " + $Data.psi_mem_some + "%)")
    }

    # --- mechanism: OOM. FAIL = kills in the last 24h (happening now). Kills only earlier in
    # the 7-day journal window = WARN with attribution: a fixed incident stays visible for a
    # week but does not hold the host red. vmstat counts since boot and cannot be dated, so it
    # alone never raises FAIL -- with max(vmstat, journal) the 2026-10-24 lobster-wordpress
    # incident (fixed 77cd04ded) would have kept ks-aw-01 FAIL until the next reboot, and an
    # always-red detector is an ignored one.
    # Outer @() is load-bearing: a Where-Object that filters everything out yields $null,
    # not an empty array, and $null.Count THROWS under Set-StrictMode -Version Latest.
    $oomVals = @(@($Data.oom_vmstat, $Data.oom_journal) | Where-Object { $null -ne $_ })
    $byCt = $(if ($Data.oom_memcg) { "; by container (7d): " + $Data.oom_memcg } else { "" })
    if ($oomVals.Count -eq 0) { [void]$blind.Add("OOM counters not readable from either source") }
    elseif ($null -eq $Data.oom_journal -or $null -eq $Data.oom_journal_24h) {
        [void]$blind.Add("OOM journal not readable -- kills cannot be dated")
        if ($Data.oom_vmstat -gt 0) {
            $level = [math]::Max($level, 1); [void]$reasons.Add("OOM kills since boot (vmstat): " + $Data.oom_vmstat + " -- undated, journal blind")
        }
    }
    elseif ($Data.oom_journal_24h -gt 0) {
        $level = [math]::Max($level, 2)
        [void]$reasons.Add("OOM kills in the last 24h: " + $Data.oom_journal_24h + " (7d=" + $Data.oom_journal + ", vmstat since boot=" + $Data.oom_vmstat + ")" + $byCt)
    }
    elseif ($Data.oom_journal -gt 0) {
        $level = [math]::Max($level, 1)
        [void]$reasons.Add("OOM kills in the last 7d, none in 24h: " + $Data.oom_journal + " (vmstat since boot=" + $Data.oom_vmstat + ")" + $byCt + " -- check WORKLOG that the incident is closed")
    }
    # Booted inside the 7-day window, so the journal should hold every kill vmstat counted. More in
    # vmstat = journal history lost (vacuumed/rotated): those kills are undated, so WARN, not PASS.
    if ($null -ne $Data.oom_journal -and $null -ne $Data.oom_vmstat -and $null -ne $Data.uptime_days -and
        $Data.uptime_days -lt 7 -and $Data.oom_vmstat -gt $Data.oom_journal) {
        $level = [math]::Max($level, 1)
        [void]$blind.Add("journal holds " + $Data.oom_journal + " OOM kills but vmstat counted " + $Data.oom_vmstat + " since a boot " + $Data.uptime_days + "d ago -- journal history incomplete, the rest are undated")
    }

    # --- mechanism: CPU. PSI is the primary signal; load average is only corroborating
    # context because on Linux it also counts uninterruptible-IO tasks, so a high load with
    # flat PSI usually means disk, not CPU.
    if ($null -eq $Data.psi_cpu_some) { [void]$blind.Add("PSI cpu not readable") }
    elseif ($Data.psi_cpu_some -gt $PSI_CPU_SOME_FAIL) {
        $level = [math]::Max($level, 2); [void]$reasons.Add("CPU starvation (PSI cpu some avg60 " + $Data.psi_cpu_some + "%)")
    } elseif ($Data.psi_cpu_some -gt $PSI_CPU_SOME_WARN) {
        $level = [math]::Max($level, 1); [void]$reasons.Add("CPU pressure (PSI cpu some avg60 " + $Data.psi_cpu_some + "%)")
    }
    # Load average is CORROBORATING ONLY -- it cannot raise a verdict by itself.
    #
    # This is not threshold-tuning to buy silence. Measured on SG 2026-08-27 while the
    # load-only rule was firing at 1.94/core: CPU 87% idle, iowait 0.1%, R(runnable)=1 and
    # D(uninterruptible)=0 across five samples over ten seconds, no container above 0.55%
    # -- but 31 new processes per SECOND (netdata plugins + container healthchecks). Linux
    # load average counts D-state tasks and is inflated by fork churn, so on that box it
    # was measuring process turnover and reporting it as a CPU capacity shortage. A metric
    # that does not measure the thing it is named after is removed, not re-tuned; the
    # mechanism probe (PSI) stays authoritative and already declined to fire.
    #
    # It still warns when BOTH agree, because high load corroborated by real CPU stall is
    # a genuine signal. And load stays visible in the report either way -- demoted from
    # verdict-bearing, not hidden.
    if ($null -ne $Data.load1 -and $null -ne $Data.cpu_cores -and $Data.cpu_cores -gt 0) {
        $perCore = [math]::Round($Data.load1 / $Data.cpu_cores, 2)
        if ($perCore -gt $LOAD_PER_CORE_WARN -and $null -ne $Data.psi_cpu_some -and $Data.psi_cpu_some -gt $PSI_CPU_SOME_WARN) {
            $level = [math]::Max($level, 1)
            [void]$reasons.Add("load " + $Data.load1 + " on " + $Data.cpu_cores + " cores (" + $perCore + " per core) WITH PSI cpu " + $Data.psi_cpu_some + "% -- corroborated CPU shortage")
        }
    }

    if ($null -ne $Data.swap_used_pct -and $Data.swap_used_pct -gt $SWAP_USED_WARN_PCT) {
        $level = [math]::Max($level, 1); [void]$reasons.Add("swap " + $Data.swap_used_pct + "% used")
    }

    # --- outcome + mechanism: disk. The reclaimable figure is what separates "70% of
    # real data" from "70% of docker build cache", which need opposite responses.
    if ($null -eq $Data.disk_pct) { [void]$blind.Add("disk not measured") }
    elseif ($Data.disk_pct -ge $Policy.DiskFailPct) {
        $level = [math]::Max($level, 2); [void]$reasons.Add("disk " + $Data.disk_pct + "% used (fail >= " + $Policy.DiskFailPct + "%)" + $(if ($Data.reclaimable) { "; reclaimable: " + $Data.reclaimable } else { "" }))
    } elseif ($Data.disk_pct -ge $Policy.DiskWarnPct) {
        $level = [math]::Max($level, 1); [void]$reasons.Add("disk " + $Data.disk_pct + "% used (warn >= " + $Policy.DiskWarnPct + "%)" + $(if ($Data.reclaimable) { "; reclaimable: " + $Data.reclaimable } else { "" }))
    }
    # An unmeasured inode probe is a BLIND SPOT, not a pass. INODE_PCT comes from a different
    # command than DISK_PCT (df -i with a positional column parse), so it fails independently
    # -- btrfs/zfs print "-" for IUse%, which parses to $null.
    if ($null -eq $Data.inode_pct) { [void]$blind.Add("inode usage not measured") }
    elseif ($Data.inode_pct -ge $Policy.DiskWarnPct) {
        $level = [math]::Max($level, 1); [void]$reasons.Add("inodes " + $Data.inode_pct + "% used")
    }

    # --- service-side evidence of pressure
    if ($null -eq $Data.containers_unhealthy) { [void]$blind.Add("docker not queryable") }
    elseif ($Data.containers_unhealthy -gt 0) {
        $level = [math]::Max($level, 1); [void]$reasons.Add($Data.containers_unhealthy + " container(s) unhealthy")
    }
    # "" means BOTH "nothing restarted" and "docker inspect returned nothing" (permission
    # denied, container removed mid-flight). Those must not share a verdict.
    if (-not $Data.restarts_measured) { [void]$blind.Add("container restart counts not measured") }
    # Context fields, but a timed-out probe still has to show: empty with containers running = not measured.
    if ($Data.docker_present -and $null -ne $Data.containers_running -and $Data.containers_running -gt 0) {
        if (-not $Data.reclaimable) { [void]$blind.Add("docker reclaimable not measured (docker system df timed out or failed)") }
        if (-not $Data.top_mem)     { [void]$blind.Add("container memory ranking not measured (docker stats timed out or failed)") }
    }
    if ($Data.restarts) {
        $high = @()
        foreach ($m in [regex]::Matches($Data.restarts, '([A-Za-z0-9_.-]+)\((\d+)\)')) {
            if ([int]$m.Groups[2].Value -ge $RESTART_WARN_COUNT) { $high += $m.Groups[1].Value + "(" + $m.Groups[2].Value + ")" }
        }
        if ($high.Count -gt 0) {
            $level = [math]::Max($level, 1); [void]$reasons.Add("repeated restarts: " + ($high -join " "))
        }
    }

    # A blind spot can never read as PASS.
    if ($blind.Count -gt 0) { $level = [math]::Max($level, 1) }
    return @{ level = $level; reasons = $reasons.ToArray(); blind = $blind.ToArray() }
}

# =====================================================================================
$root = Resolve-Root -InputRoot $WorkRoot
$statusDir = Join-Path $root "agency-os\reports\status"
$null = New-Item -ItemType Directory -Force -Path $statusDir
$stamp = Get-Date
$latestPath = Join-Path $statusDir "capacity-LATEST.md"
$jsonPath   = Join-Path $statusDir "capacity-LATEST.json"

# Previous run, for growth trend. Guarded: a missing or corrupt file must degrade to
# "no trend", never throw and never block the report.
$prev = $null
try {
    if (Test-Path -LiteralPath $jsonPath) {
        $prev = Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
} catch { $prev = $null }

$fatal = $false; $fatalReason = ""
$results = [ordered]@{}

if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
    $fatal = $true; $fatalReason = "ssh.exe not found on PATH"
} else {
    $results["ks-aw-01"] = Invoke-HostCheck -KeyPath $KsAw01PrivateKey -Label "ks-aw-01" -CheckArgs @{
        ServerHost = $KsAw01Host; User = $KsAw01SshUser; Key = $KsAw01PrivateKey
        Port = $KsAw01SshPort; UseSudo = $true
    }
    # 2026-08-28 consolidation, 2026-08-30 deletion: SG/EU were stopped, then the
    # machines themselves were deleted at the old provider console. Probing them would be a
    # permanent WARN (SSH to a host that no longer exists) - and a permanent warning
    # is an ignored detector. ks-aw-01 (above) is now the ONLY production machine and
    # carries deliberately strict 60% thresholds so whole-host pressure is surfaced early.
}

$verdicts = [ordered]@{}
$worst = 0
foreach ($name in $results.Keys) {
    $policy = $HOST_POLICY[$name]
    $v = Get-HostVerdict -Policy $policy -Data $results[$name]
    $verdicts[$name] = $v
    if ($v.level -gt $worst) { $worst = $v.level }
}
if ($fatal) { $worst = 2 }
$overall = switch ($worst) { 0 { "PASS" } 1 { "WARN" } 2 { "FAIL" } default { "UNKNOWN" } }

# Emoji ONLY at output stage, via ConvertFromUtf32 -- a literal here crashes the PS5.1
# parser on a Big5 console. See agency-os/docs/operations/AUDIT_REGISTRY.md CP950.
$ICON = @{
    0 = [char]::ConvertFromUtf32(0x1F7E2)
    1 = [char]::ConvertFromUtf32(0x1F7E1)
    2 = [char]::ConvertFromUtf32(0x1F534)
}

function Format-Gib { param($Kb) if ($null -eq $Kb) { return "?" } return ([math]::Round($Kb / 1048576.0, 1)).ToString() + "G" }

# The BODY is built first and the header composed afterwards, so a render failure can still
# produce a report. The previous shape appended the header (including "Overall: PASS")
# up front, then threw mid-render before WriteAllText -- leaving YESTERDAY'S file on disk
# while AGENTS.md instructs the agent to read it and name that verdict at AO-RESUME. A
# monitor whose failure mode is "the last green report stays" has inverted its own purpose.
$renderError = ""
$body = New-Object System.Text.StringBuilder
try {
if ($fatal) {
    [void]$body.AppendLine("## Runtime")
    [void]$body.AppendLine("- Status: **FAIL** -- " + $fatalReason)
    [void]$body.AppendLine("")
} else {
    [void]$body.AppendLine("| host | verdict | mem used | disk | swap | PSI mem some/full | containers |")
    [void]$body.AppendLine("|---|---|---|---|---|---|---|")
    foreach ($name in $results.Keys) {
        $d = $results[$name]; $v = $verdicts[$name]
        if (-not $d.ok) {
            [void]$body.AppendLine("| " + $name + " | " + $ICON[$v.level] + " WARN | (not measured) | | | | |")
            continue
        }
        $memCell = "" + $d.mem_used_pct + "% of " + (Format-Gib $d.mem_total_kb)
        $diskCell = "" + $d.disk_pct + "% of " + (Format-Gib $d.disk_total_kb)
        $psiCell = "" + $d.psi_mem_some + " / " + $d.psi_mem_full
        $cCell = "" + $d.containers_running + "/" + $d.containers_total
        [void]$body.AppendLine("| " + $name + " | " + $ICON[$v.level] + " | " + $memCell + " | " + $diskCell + " | " + $d.swap_used_pct + "% | " + $psiCell + " | " + $cCell + " |")
    }
    [void]$body.AppendLine("")

    foreach ($name in $results.Keys) {
        $d = $results[$name]; $v = $verdicts[$name]
        [void]$body.AppendLine("## " + $name + " (" + $d.host + ") " + $ICON[$v.level])
        if (-not $d.ok) {
            [void]$body.AppendLine("- **Not measured**: " + $d.error)
            [void]$body.AppendLine("- Treated as WARN, never PASS: an unmeasured host is not a healthy one.")
            [void]$body.AppendLine("")
            continue
        }
        [void]$body.AppendLine("- Memory: " + $d.mem_used_pct + "% used (" + (Format-Gib $d.mem_used_kb) + " of " + (Format-Gib $d.mem_total_kb) + "), swap " + $d.swap_used_pct + "%")
        [void]$body.AppendLine("- PSI memory avg60: some " + $d.psi_mem_some + "%, full " + $d.psi_mem_full + "%  | io some " + $d.psi_io_some + "%")
        [void]$body.AppendLine("- OOM kills: vmstat(since boot) " + $d.oom_vmstat + ", journal 24h " + $d.oom_journal_24h + " / 7d " + $d.oom_journal + $(if ($d.oom_memcg) { " -- by container: " + $d.oom_memcg } else { "" }))
        [void]$body.AppendLine("- Disk /: " + $d.disk_pct + "% (" + (Format-Gib $d.disk_used_kb) + " of " + (Format-Gib $d.disk_total_kb) + "), inodes " + $d.inode_pct + "%")
        if ($d.reclaimable) { [void]$body.AppendLine("- Docker reclaimable: " + $d.reclaimable) }
        [void]$body.AppendLine("- Containers: " + $d.containers_running + " running / " + $d.containers_total + " total, unhealthy " + $d.containers_unhealthy)
        if ($d.restarts) { [void]$body.AppendLine("- Restart counts: " + $d.restarts) }
        if ($d.top_mem)  { [void]$body.AppendLine("- Top memory: " + $d.top_mem) }
        $perCoreTxt = ""
        $loadNote = ""
        if ($null -ne $d.load1 -and $null -ne $d.cpu_cores -and $d.cpu_cores -gt 0) {
            $pc = [math]::Round($d.load1 / $d.cpu_cores, 2)
            $perCoreTxt = " (" + $pc + " per core)"
            # Explain a high load that did NOT raise the verdict, so the reader does not
            # conclude the check missed something. An unexplained scary number next to a
            # green light is how a check loses the reader's trust.
            if ($pc -gt $LOAD_PER_CORE_WARN -and $null -ne $d.psi_cpu_some -and $d.psi_cpu_some -le $PSI_CPU_SOME_WARN) {
                $loadNote = "`n  - _Load is high but PSI cpu is not: the run queue is churn (short-lived processes), not CPU starvation. Load average counts D-state and fork turnover; PSI measures actual stall. Not counted as a finding._"
            }
        }
        [void]$body.AppendLine("- CPU: " + $d.cpu_cores + " cores, load1 " + $d.load1 + $perCoreTxt + ", PSI cpu some " + $d.psi_cpu_some + "%, up " + $d.uptime_days + "d" + $loadNote)

        # Growth trend against the previous run, when there is one to compare against.
        if ($null -ne $prev -and $prev.PSObject.Properties.Name -contains "hosts") {
            $ph = $prev.hosts.PSObject.Properties | Where-Object { $_.Name -eq $name } | Select-Object -First 1
            # EXISTENCE, not truthiness. A host that was unreachable on the previous run is
            # serialised as {host, ok, error} only -- no disk_used_kb -- and under
            # Set-StrictMode -Version Latest a dot-access to a missing property THROWS. This
            # line sat OUTSIDE the try below, so the first time any host was unreachable the
            # whole check died before writing its report, and stayed dead every run after,
            # because the poisoned JSON was never overwritten. Confirmed by reproduction
            # 2026-08-27: PropertyNotFoundException on disk_used_kb.
            $phHas = ($null -ne $ph) -and ($null -ne $ph.Value) -and
                     ($ph.Value.PSObject.Properties.Name -contains 'disk_used_kb')
            $prevHasStamp = ($prev.PSObject.Properties.Name -contains 'generatedAt') -and $prev.generatedAt
            if ($phHas -and $ph.Value.disk_used_kb -and $d.disk_used_kb -and $prevHasStamp) {
                try {
                    $elapsedDays = ($stamp.ToUniversalTime() - [datetime]::Parse($prev.generatedAt).ToUniversalTime()).TotalDays
                    if ($elapsedDays -gt 0.02) {
                        $deltaGib = ($d.disk_used_kb - $ph.Value.disk_used_kb) / 1048576.0
                        $perDay = $deltaGib / $elapsedDays
                        $trend = "- Disk trend: " + $([math]::Round($perDay, 2)) + " GiB/day since last run"
                        if ($perDay -gt 0.01 -and $d.disk_total_kb) {
                            $policy = $HOST_POLICY[$name]
                            # Scale from the CURRENT reading, not from total size: df's
                            # percentage is used/(used+avail) and excludes reserved blocks, so
                            # projecting against total overstated SG's headroom by ~36%.
                            $warnKb = if ($d.disk_pct -gt 0) { $d.disk_used_kb * ($policy.DiskWarnPct / $d.disk_pct) } else { $null }
                            if ($d.disk_used_kb -lt $warnKb) {
                                $daysLeft = [math]::Round((($warnKb - $d.disk_used_kb) / 1048576.0) / $perDay, 0)
                                $trend += " -- reaches the " + $policy.DiskWarnPct + "% warn line in about " + $daysLeft + " days at this rate"
                            }
                        }
                        [void]$body.AppendLine($trend)
                    }
                } catch { }
            }
        }

        if ($v.reasons.Count -gt 0) {
            [void]$body.AppendLine("")
            [void]$body.AppendLine("**Findings:**")
            foreach ($r in $v.reasons) { [void]$body.AppendLine("- " + $r) }
        }
        if ($v.blind.Count -gt 0) {
            [void]$body.AppendLine("")
            [void]$body.AppendLine("**Blind spots** (forces WARN -- an unmeasured dimension is not a passing one):")
            foreach ($b in $v.blind) { [void]$body.AppendLine("- " + $b) }
        }
        [void]$body.AppendLine("")
    }
}

}
catch {
    # A render failure must NOT be able to suppress the report. Anything that throws in the
    # body -- a previous run's degraded host entry lacking disk_used_kb, an unexpected shape
    # from a probe -- is captured, forced to FAIL, and printed IN the report instead of
    # silently leaving the previous file in place.
    $renderError = $_.Exception.Message
    $worst   = 2
    $overall = "FAIL"
}

$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("# Capacity health report")
[void]$md.AppendLine("")
[void]$md.AppendLine("- Generated: " + $stamp.ToString("yyyy-MM-dd HH:mm:ss K") + "  (UTC: " + $stamp.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss") + ")")
[void]$md.AppendLine("- Overall: **" + $overall + "** " + $ICON[$worst])
[void]$md.AppendLine("")
if ($renderError) {
    [void]$md.AppendLine("## !! THIS REPORT IS INCOMPLETE")
    [void]$md.AppendLine("")
    [void]$md.AppendLine("Rendering threw before finishing: ``" + $renderError + "``")
    [void]$md.AppendLine("")
    [void]$md.AppendLine("Treat every verdict below as UNVERIFIED. The check ran but could not")
    [void]$md.AppendLine("render its findings, so absence of a warning here means nothing.")
    [void]$md.AppendLine("")
}
[void]$md.AppendLine("> ks-aw-01 runs the strictest thresholds on purpose: it is the sole consolidation host")
[void]$md.AppendLine("> for all production services. Its 128 GB RAM meets the planned floor; these thresholds")
[void]$md.AppendLine("> preserve early warning for whole-host pressure rather than compensating for a spec gap.")
[void]$md.AppendLine("")
[void]$md.Append($body.ToString())

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($latestPath, $md.ToString(), $utf8NoBom)

# measured = hosts whose probe answered (ok); unreachable/timeout/ssh-missing = 0.
$measured = @($results.Values | Where-Object { $_.ok }).Count
$payload = [ordered]@{
    generatedAt = $stamp.ToUniversalTime().ToString("o")
    fatal       = $fatal
    fatalReason = $fatalReason
    policy      = $HOST_POLICY
    hosts       = $results
    verdicts    = $verdicts
    # snake_case to match the header docstring and every sibling check (smoke, staging-orphans).
    # A consumer written against the documented name would read $null from "blindSpots", which
    # is falsy, which reads as "no blind spots" -- the failure this field exists to prevent.
    # Host attribution is kept: a bare reason string cannot be acted on.
    blind_spots = @($verdicts.Keys | ForEach-Object { $h = $_; $verdicts[$h].blind | Where-Object { $_ } | ForEach-Object { [ordered]@{ host = $h; reason = $_ } } })
    reportPath  = "agency-os/reports/status/capacity-LATEST.md"
}
$artifact = Write-DetectorArtifact -Path $jsonPath -Overall $overall -Measured $measured -Fields $payload

if ($Json) {
    $artifact | ConvertTo-Json -Depth 8
} else {
    Write-Host "== Capacity health (AO-RESUME companion, warn-only) ==" -ForegroundColor Cyan
    Write-Host ("Overall: " + $overall)
    Write-Host ("Report: " + $payload.reportPath)
    if ($fatal) { Write-Host ("Reason: " + $fatalReason) -ForegroundColor Yellow }
    else {
        foreach ($name in $results.Keys) {
            $d = $results[$name]; $v = $verdicts[$name]
            if (-not $d.ok) { Write-Host ("- " + $name + ": WARN (" + $d.error + ")") -ForegroundColor Yellow; continue }
            $line = "- " + $name + ": mem " + $d.mem_used_pct + "%, disk " + $d.disk_pct + "%, swap " + $d.swap_used_pct + "%, psi " + $d.psi_mem_some + "/" + $d.psi_mem_full + ", " + $d.containers_running + " containers"
            if ($v.level -eq 0) { Write-Host $line }
            else {
                Write-Host $line -ForegroundColor $(if ($v.level -eq 2) { "Red" } else { "Yellow" })
                foreach ($r in $v.reasons) { Write-Host ("    ! " + $r) -ForegroundColor $(if ($v.level -eq 2) { "Red" } else { "Yellow" }) }
                foreach ($b in $v.blind)   { Write-Host ("    ? " + $b) -ForegroundColor Yellow }
            }
        }
    }
}

if ($overall -eq "PASS") { exit 0 }
if ($overall -eq "WARN") { exit 1 }
exit 2
