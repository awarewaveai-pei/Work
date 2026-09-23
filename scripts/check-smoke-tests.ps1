#requires -Version 5.1
<#
.SYNOPSIS
  Application-layer smoke tests — runs at every AO-RESUME (warn-only).
  Called by ao-resume.ps1, same pattern as check-backup-health / check-cloudflare-security.

.OUTPUTS
  agency-os/reports/status/smoke-LATEST.json

.NOTES
  Never breaks AO-RESUME (always exit 0), but "skip" is NOT universally benign:
  a check listed in $criticalChecks is the sole detector of a silent-failure class,
  so its skip degrades the run to WARN instead of being swallowed (see summary block).

  Checks:
    1. n8n MCP connectivity  (scripts/n8n-mcp-smoke.ps1)
    2. Repair Center health  (GET /api/ops/repairs/health)
    3. Client sites health   (GET /api/ops/clients)
    4. n8n workflow failures (GET n8n/api/v1/executions?status=error — last 24h)
    5. Client outbound mail  (SSH soulful -> wp_fsmpt_email_logs; failures last 7d
       AND days since last successful send) — CRITICAL
    6. Local Docker Desktop launch guard (laptop only; 'Docker Desktop Runtime
       Preflight' task enabled and no HKCU Run bypass,
       runbooks/DOCKER-DESKTOP-LOCAL-RECOVERY.md) — CRITICAL where the task exists
  ops-console-smoke skipped here — requires TenantId which varies by tenant.
  Run /smoke-test manually for full DoD including ops-console.
#>
param(
    [string]$WorkRoot   = "",
    [string]$AppBaseUrl = "https://app.aware-wave.com",
    # Days without a successful outbound send before Check 5 warns.
    #
    # MUST stay below TWO ceilings, or the check is worse than useless:
    #   1. FluentSMTP prunes its own log table on a daily cron — soulful's
    #      fluentmail-settings has "log_saved_interval_days":"14" (verified 2026-08-17).
    #      Past 14 quiet days every 'sent' row is deleted, so quiet_days can never exceed
    #      ~14; any limit at or above that makes this branch unreachable dead code.
    #   2. The incident being defended against ran 13 days (2026-08-03 -> 08-16). A limit
    #      longer than the outage it exists to catch defeats the purpose.
    # 10 leaves headroom under both. Raise only if the plugin's retention is raised first.
    #
    # NOTE: this is not tuned to observed traffic — it cannot be. Retention caps the log at
    # 14 days, so no healthy-cadence baseline longer than that is obtainable. Revisit once
    # several quiet months have shown whether 10 produces noise.
    [int]$MailQuietDayLimit = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

function Resolve-Root {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    if ($PSScriptRoot) { return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
    return (Get-Location).Path
}

$root      = Resolve-Root -InputRoot $WorkRoot
$reportDir = Join-Path $root "agency-os\reports\status"
$null      = New-Item -ItemType Directory -Force -Path $reportDir

# Load machine-local env (GRAFANA_BASIC_PASSWORD etc.)
$userEnv = Join-Path $root "mcp\user-env.ps1"
if (Test-Path -LiteralPath $userEnv) {
    try { . $userEnv } catch {}
}

# Console-encoding helpers (Invoke-WithUtf8Console) for the ssh capture in Check 5.
$encHelpers = Join-Path $PSScriptRoot "_console-encoding-helpers.ps1"
if (Test-Path -LiteralPath $encHelpers) { . $encHelpers }

# scripts/lib/smoke-status-digest.ps1 (WORKLOG 2026-09-23): reads the ten sibling
# warn-only status reports AO-RESUME's own SSOT never surfaced (CI health and the
# nightly system-guard gate had ZERO prior wiring; the other eight had only ad-hoc
# prose mentions). $statusDigest.blockers is the single array ao-resume.md §6 reads.
$digestLib = Join-Path $PSScriptRoot "lib\smoke-status-digest.ps1"
$statusDigest = $null
if (Test-Path -LiteralPath $digestLib) {
    try { . $digestLib; $statusDigest = Get-StatusDigest -WorkRoot $root } catch { $statusDigest = $null }
}

$results = @{}

# Checks that ran but produced NO measurement this time. Kept separate from $results
# because the verdict string alone cannot express it: "warn:ssh_exit255" and
# "skip:no_ssh_key" are both "we learned nothing", while "warn:soulful_2_failed_7d" is a
# real observation. Blind-spot reporting keys off this, not off string prefixes.
$noEvidence = @{}

# --- Check 1: n8n MCP connectivity ---
$n8nScript = Join-Path $root "scripts\n8n-mcp-smoke.ps1"
if (Test-Path -LiteralPath $n8nScript) {
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $n8nScript -WorkspaceRoot $root 2>&1 | Out-Null
        $results["n8n_mcp"] = if ($LASTEXITCODE -eq 0) { "ok" } else { "fail:exit$LASTEXITCODE" }
    } catch {
        $results["n8n_mcp"] = "skip:exception"
    }
} else {
    $results["n8n_mcp"] = "skip:script_missing"
}

# --- Check 2: Repair Center health ---
$repairUrl = "$AppBaseUrl/api/ops/repairs/health"
$repairStatus = "skip"
try {
    $authHeader = @{}
    $opsUser = [System.Environment]::GetEnvironmentVariable("OPS_BASIC_USER", "User")
    if (-not $opsUser) { $opsUser = $env:OPS_BASIC_USER }
    $opsPw   = [System.Environment]::GetEnvironmentVariable("OPS_BASIC_PASSWORD", "User")
    if (-not $opsPw)   { $opsPw   = $env:OPS_BASIC_PASSWORD }
    if ($opsUser -and $opsPw) {
        $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${opsUser}:${opsPw}"))
        $authHeader = @{ Authorization = "Basic $b64" }
    }
    $resp = Invoke-RestMethod -Uri $repairUrl -Headers $authHeader -TimeoutSec 10 -ErrorAction Stop
    $repairStatus = if ($resp.ok -eq $true) { "ok" } else { "warn:ok_false" }
    $results["repair_center"] = $repairStatus
    $results["repair_detail"]  = @{
        ok          = $resp.ok
        system_mode = $resp.system_mode
        table_ok    = $resp.table_ok
    }
} catch {
    $code = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    $results["repair_center"] = if ($code) { "skip:http$code" } else { "skip:unreachable" }
}

# --- Check 3: Client sites health ---
# Uses /api/ops/summary (PUBLIC_API_PATHS, no session needed) instead of /api/ops/clients:
# that route sits behind the Supabase-session middleware (401 for server-to-server callers)
# and its payload carries no health field anyway — summary reads the same organizations table.
$clientsUrl = "$AppBaseUrl/api/ops/summary"
try {
    $resp = Invoke-RestMethod -Uri $clientsUrl -TimeoutSec 10 -ErrorAction Stop
    $tenants = @($resp.tenants)
    if ($tenants.Count -eq 0) {
        $results["client_sites"] = "skip:no_clients"
    } else {
        # PSObject.Properties guard: StrictMode throws on absent members, which the outer
        # catch would mislabel as skip:unreachable. summary emits status "active" | "risk".
        $inactive = @($tenants | Where-Object {
            ($_.PSObject.Properties.Name -contains "status") -and $_.status -and $_.status -ne "active"
        })
        if ($inactive.Count -eq 0) {
            $results["client_sites"] = "ok:$($tenants.Count)_active"
        } else {
            $names = ($inactive | ForEach-Object {
                if ($_.slug) { $_.slug } elseif ($_.name) { $_.name } else { "unknown" }
            }) -join ","
            $results["client_sites"] = "warn:inactive=$names"
        }
    }
} catch {
    $code = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    $results["client_sites"] = if ($code) { "skip:http$code" } else { "skip:unreachable" }
}

# --- Check 4: n8n recent workflow failures (last 24h) ---
try {
    $n8nApiKey  = [System.Environment]::GetEnvironmentVariable("N8N_API_KEY", "User")
    if (-not $n8nApiKey) { $n8nApiKey = $env:N8N_API_KEY }
    $n8nBaseUrl = [System.Environment]::GetEnvironmentVariable("N8N_API_BASE_URL", "User")
    if (-not $n8nBaseUrl) { $n8nBaseUrl = $env:N8N_API_BASE_URL }
    if (-not $n8nBaseUrl) { $n8nBaseUrl = "https://n8n.aware-wave.com" }
    # N8N_API_BASE_URL may or may not already include /api/v1 (differs per machine) —
    # normalize to the bare host so the path below never doubles (root cause of skip:exception 404).
    $n8nBaseUrl = ($n8nBaseUrl.TrimEnd("/") -replace "/api/v1$", "")

    if ($n8nApiKey) {
        $since = (Get-Date).ToUniversalTime().AddHours(-24).ToString("yyyy-MM-ddTHH:mm:ssZ")
        $execUrl = "$n8nBaseUrl/api/v1/executions?status=error&limit=10"
        $n8nHeaders = @{ "X-N8N-API-KEY" = $n8nApiKey }
        $execResp = Invoke-RestMethod -Uri $execUrl -Headers $n8nHeaders -TimeoutSec 10 -ErrorAction Stop
        $recent = @($execResp.data | Where-Object {
            $_.startedAt -and ([DateTime]$_.startedAt).ToUniversalTime() -gt ([DateTime]$since)
        })
        if ($recent.Count -eq 0) {
            $results["n8n_failures"] = "ok:none_24h"
        } else {
            $wfNames = ($recent | ForEach-Object {
                if ($_.workflowData -and $_.workflowData.name) { $_.workflowData.name } else { "id:$($_.id)" }
            } | Select-Object -Unique) -join ","
            $results["n8n_failures"] = "warn:$($recent.Count)_errors=$wfNames"
        }
    } else {
        $results["n8n_failures"] = "skip:no_api_key"
    }
} catch {
    $results["n8n_failures"] = "skip:exception"
}

# --- Check 5: Client outbound mail (soulful) ---
# Why this exists: FluentSMTP pointed at pop.hostinger.com:587 (a port that refuses
# connections), so every wp_mail() failed silently from 2026-08-03 to 2026-08-16 and
# nobody noticed. FluentSMTP's own failure notice is useless here because it is itself
# delivered through wp_mail — the alert dies with the channel it watches. So the check
# has to come from outside the site.
try {
    # WHERE the soulful database lives is a profile, not literals scattered through the
    # command. The 2026-11-12 migration does not merely change an IP: on Hostinger the
    # site is files on shared hosting reached with `cd <path> && wp db query`, whereas on
    # ks-aw-01 it is a container reached with `docker exec soulful-db mariadb`. A check
    # that hard-codes either SHAPE breaks on cutover day and then reports a permanent
    # warning — and a warning that always fires is a detector nobody reads, which is the
    # very failure mode this check was written to prevent.
    #
    # Cutover therefore flips ONE value (SOULFUL_DB_PROFILE=ks-aw-01) rather than editing
    # this script under time pressure. Everything below the profile — base64 transport,
    # row parsing, the no-evidence-is-not-a-skip verdicts — is shared and untouched.
    # M4: User scope FIRST, matching every other env read in this file (:97-100, :152-155).
    # This script is spawned by ao-resume.ps1 as a child process, and a session-scoped
    # $env: set in some other shell never reaches it -- so "unset" here used to silently
    # mean "hostinger", which after cutover is not a typo but the DEFAULT, quietly
    # measuring the decommissioned host (freeze blocks HTTP, not SSH; WP-CLI bypasses
    # maintenance mode). The date tripwire makes "unset after the deadline" land in the
    # exhaustive switch's default branch -> warn:unknown_profile + blind spot, instead of
    # a green verdict from a dead machine.
    $profileName = [Environment]::GetEnvironmentVariable("SOULFUL_DB_PROFILE", "User")
    if (-not $profileName) { $profileName = $env:SOULFUL_DB_PROFILE }
    if (-not $profileName) {
        $profileName = if ((Get-Date) -gt [datetime]"2026-11-12") { "unset_after_hostinger_deadline" } else { "hostinger" }
    }

    # The SQL is profile-independent: both back ends return a bare tab-separated row.
    $sql = "SELECT (SELECT COUNT(*) FROM wp_fsmpt_email_logs WHERE status='failed' AND created_at > (UTC_TIMESTAMP() - INTERVAL 7 DAY)) AS failed7d, IFNULL(DATEDIFF(UTC_TIMESTAMP(), (SELECT MAX(created_at) FROM wp_fsmpt_email_logs WHERE status='sent')), -1) AS quiet_days;"

    switch ($profileName) {
        "ks-aw-01" {
            $mailHost = $env:SOULFUL_SSH_HOST; if (-not $mailHost) { $mailHost = "145.239.195.47" }
            $mailPort = $env:SOULFUL_SSH_PORT; if (-not $mailPort) { $mailPort = "58122" }
            $mailUser = $env:SOULFUL_SSH_USER; if (-not $mailUser) { $mailUser = "ubuntu" }
            $mailKey  = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
            # Two things this deliberately does NOT do, both of which the first version did
            # and both of which cutover-sync.sh was already engineered to avoid -- two files
            # in one change set behaving oppositely is how a rule quietly stops applying:
            #
            #  1. NO `. /root/soulful/.env` AS ROOT. Sourcing executes the file, so a value
            #     containing $(...) or backticks runs as root on ks-aw-01, triggered by a
            #     routine AO-RESUME. The two keys are read with a plain read loop instead,
            #     which cannot execute anything.
            #  2. NO PASSWORD IN ARGV. `-p"$PASS"` is visible to every user on the box via
            #     `ps aux` for the lifetime of the query. The credential is staged into a
            #     defaults file INSIDE the container over stdin, exactly as
            #     cutover-sync.sh setup_db_auth does, and removed afterwards.
            #
            # A heredoc, not `sudo bash -c '...'`: the SQL contains single quotes
            # (status='failed'), which close the wrapper's own quoting and make the remote
            # shell fail with a syntax error. That first attempt returned ssh_exit1 and was
            # caught by testing the post-cutover profile TODAY rather than on cutover day.
            # <<'INNER' is quoted so the outer shell leaves the body alone.
            $nl = "`n"
            $q  = [char]34
            $remoteCmd = "sudo bash -s <<'INNER'" + $nl +
                         "set -u" + $nl +
                         "ENVF=/root/soulful/.env" + $nl +
                         "[ -r " + $q + "`$ENVF" + $q + " ] || { echo 'env unreadable' >&2; exit 1; }" + $nl +
                         # read, do not source: no expansion, no command substitution
                         "DBPASS=`$(sed -n 's/^SOULFUL_DB_ROOT_PASSWORD=//p' " + $q + "`$ENVF" + $q + " | tr -d '
' | tail -1)" + $nl +
                         "DBNAME=`$(sed -n 's/^SOULFUL_DB_NAME=//p' " + $q + "`$ENVF" + $q + " | tr -d '
' | tail -1)" + $nl +
                         "[ -n " + $q + "`$DBPASS" + $q + " ] || { echo 'no db password' >&2; exit 1; }" + $nl +
                         "[ -n " + $q + "`$DBNAME" + $q + " ] || DBNAME=soulful" + $nl +
                         "CNF=/tmp/.soulful-smoke.cnf" + $nl +
                         # CLEANUP IS A TRAP, NOT A LINE. Ordering-dependent cleanup does not
                         # survive an early exit, and it did not survive this transport either.
                         "trap 'docker exec soulful-db sh -c " + $q + "rm -f `$CNF" + $q + " >/dev/null 2>&1 || true' EXIT" + $nl +
                         "printf '[client]
user=root
password=%s
' " + $q + "`$DBPASS" + $q +
                           " | docker exec -i soulful-db sh -c 'umask 077; cat > '" + $q + "`$CNF" + $q + $nl +
                         # NO -i HERE. The inner script's stdin IS the heredoc, and bash reads a
                         # piped script incrementally, so `docker exec -i` starts a stdin pump and
                         # SWALLOWS THE REST OF THE SCRIPT. Verified on this host 2026-08-27: the
                         # cleanup line never ran and /tmp/.soulful-smoke.cnf -- containing the
                         # MariaDB root password in cleartext -- was left inside soulful-db after
                         # every run. That is the exact credential-hygiene defect the comment above
                         # says this block fixed, reintroduced by the transport rather than the
                         # logic. `< /dev/null` is belt-and-braces for the same class.
                         "docker exec soulful-db mariadb --defaults-extra-file=" + $q + "`$CNF" + $q +
                           " -N " + $q + "`$DBNAME" + $q + " -e " + $q + $sql + $q + " < /dev/null" + $nl +
                         "INNER"
        }
        "hostinger" {
            $mailHost = $env:HOSTINGER_SOULFUL_SSH_HOST; if (-not $mailHost) { $mailHost = "191.101.230.176" }
            $mailPort = $env:HOSTINGER_SOULFUL_SSH_PORT; if (-not $mailPort) { $mailPort = "65002" }
            $mailUser = $env:HOSTINGER_SOULFUL_SSH_USER; if (-not $mailUser) { $mailUser = "u942075013" }
            $mailKey  = Join-Path $env:USERPROFILE ".ssh\hostinger_soulful"
            $remoteCmd = "cd domains/soulfulexpression.org/public_html && wp db query " + [char]34 + $sql + [char]34 + " --skip-column-names"
        }
        default {
            # The switch is EXHAUSTIVE on purpose; "hostinger" is named above rather than
            # being the fallback. Previously any unrecognised value — a typo like
            # "ks-aw01" or "ks_aw_01", or the variable not reaching a hook-spawned child
            # process — silently selected Hostinger. That is not a harmless default after
            # cutover: the freeze blocks HTTP but NOT ssh, and WP-CLI bypasses maintenance
            # mode entirely, so `wp db query` on the abandoned host keeps returning real
            # rows from a dead site's mail log. failed7d=0, quiet_days small, verdict
            # green — the sole critical check reporting healthy while measuring a
            # decommissioned machine. That is precisely the 2026-08-03 silent-mail failure
            # this check was built to prevent, re-created by a fallback.
            $results["client_mail"]    = "warn:unknown_profile:" + $profileName
            $noEvidence["client_mail"] = $true
            $mailKey   = $null
            $remoteCmd = $null
        }
    }

    if ($null -eq $remoteCmd) {
        # Unknown profile: the verdict and the blind-spot flag were already recorded in the
        # switch's default branch. Nothing to probe, and Test-Path would throw on a $null
        # LiteralPath rather than degrading, so this must be checked BEFORE the key test.
    } elseif (-not (Test-Path -LiteralPath $mailKey)) {
        $results["client_mail"]    = "skip:no_ssh_key"
        $noEvidence["client_mail"] = $true
    } elseif (-not (Get-Command Invoke-WithUtf8Console -ErrorAction SilentlyContinue)) {
        # No unwrapped fallback on purpose: a bare `& ssh` capture is exactly the
        # CP950 trap class that audit-cp950-traps.ps1 exists to catch.
        $results["client_mail"]    = "skip:no_enc_helper"
        $noEvidence["client_mail"] = $true
    } else {
        # PowerShell strips quotes when handing arguments to native ssh, which tore the
        # SQL apart on the remote side ("syntax error near unexpected token `('").
        # Base64 the whole remote script so nothing needs quoting in transit -- same
        # pattern the repo already uses for the CJK/cron encoding trap.
        # Two signals in ONE round-trip. Failure count alone cannot tell "healthy" apart
        # from "already broken, just not exercised yet": a dead SMTP host that nobody has
        # tried to send through logs zero failed rows and would read as ok. quiet_days
        # (age of the newest successful send) supplies the missing liveness evidence.
        # quiet_days = -1 means the table holds no successful send at all.
        # $sql and $remoteCmd were built by the profile switch above.
        $b64       = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteCmd))
        $sshArgs   = @("-i", $mailKey, "-p", $mailPort, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
                       "-o", "StrictHostKeyChecking=accept-new", "$mailUser@$mailHost",
                       "echo $b64 | base64 -d | bash")
        $raw      = Invoke-WithUtf8Console { & ssh @sshArgs 2>&1 }
        $sshExit  = $LASTEXITCODE   # capture immediately: any later command overwrites it

        # Strictly anchored: ssh writes advisory banners to stderr (e.g. the post-quantum
        # key-exchange warning) which 2>&1 folds into $raw. Only a bare "<int>\t<int>" row
        # is accepted as the result.
        $failCount = $null
        $quietDays = $null
        foreach ($line in @($raw)) {
            if ("$line".Trim() -match '^(\d+)\s+(-?\d+)$') {
                $failCount = [int]$matches[1]
                $quietDays = [int]$matches[2]
                break
            }
        }

        # A transport/query failure means this detector produced NO evidence. It must not
        # read as a benign skip — that is exactly how the 2026-08-03 outage stayed hidden.
        if ($sshExit -ne 0) {
            $results["client_mail"]    = "warn:ssh_exit$sshExit"
            $noEvidence["client_mail"] = $true
        } elseif ($null -eq $failCount) {
            $results["client_mail"]    = "warn:unparsed"
            $noEvidence["client_mail"] = $true
        } elseif ($failCount -gt 0) {
            $results["client_mail"] = "warn:soulful_${failCount}_failed_7d"
        } elseif ($quietDays -lt 0) {
            # No 'sent' row survives in the table. With retention at 14 days this means
            # "nothing sent successfully within the log window", NOT "never sent" — the
            # evidence aged out rather than never existing. Word it as what we can know.
            $results["client_mail"] = "warn:no_send_within_log_window"
        } elseif ($quietDays -gt $MailQuietDayLimit) {
            $results["client_mail"] = "warn:no_send_${quietDays}d"
        } else {
            $results["client_mail"] = "ok:no_failures_7d_last_send_${quietDays}d"
        }
    }
} catch {
    # The detector itself threw — same reasoning as above, this is a blind spot, not a skip.
    $results["client_mail"]    = "warn:exception"
    $noEvidence["client_mail"] = $true
}

# --- Check 6: local Docker Desktop launch guard (laptop only) ---
# runbooks/DOCKER-DESKTOP-LOCAL-RECOVERY.md: no background task relaunches Docker
# (2026-09-07: a "resume from sleep" trigger was tried and found to never actually
# fire - Kernel-Power EventID 107 fires on SLEEP ENTRY here, not on resume - so the
# guard is launch-time only). Holds iff the logon Preflight task is enabled, it is
# not stuck failing, no HKCU Run value launches Docker directly, and the per-user
# shortcuts point at the guard. Machines without the task: "skip:no_task" is a true
# skip, not a blind spot.
try {
    $pfTask = Get-ScheduledTask -TaskName "Docker Desktop Runtime Preflight" -ErrorAction SilentlyContinue
    if ($null -eq $pfTask) {
        $results["docker_watchdog"] = "skip:no_task"
    } else {
        $pfInfo  = Get-ScheduledTaskInfo -TaskName "Docker Desktop Runtime Preflight" -ErrorAction SilentlyContinue
        $run     = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue
        $bypass  = [bool]($run -and ($run.PSObject.Properties.Name -contains "Docker Desktop"))
        $wscriptExe = Join-Path $env:SystemRoot "System32\wscript.exe"
        $guardArgs  = '//B //Nologo "' + (Join-Path $root "scripts\docker-desktop-runtime-hidden-launch.vbs") + '" "' + (Join-Path $root "scripts\docker-desktop-runtime-preflight.ps1") + '" -StartDesktop'
        $shPaths = @(
            (Join-Path ([Environment]::GetFolderPath("Desktop")) "Docker Desktop.lnk")
            (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Docker Desktop.lnk")
        )
        $unguardedShortcut = $false
        try {
            $wsh = New-Object -ComObject WScript.Shell
            foreach ($lnk in $shPaths) {
                if (-not (Test-Path -LiteralPath $lnk)) { continue }
                $s = $wsh.CreateShortcut($lnk)
                if (-not (($s.TargetPath -ieq $wscriptExe) -and ($s.Arguments -eq $guardArgs))) { $unguardedShortcut = $true }
            }
        } catch { $unguardedShortcut = $true }
        if ($pfTask.State -eq "Disabled") {
            $results["docker_watchdog"]    = "warn:preflight_task_disabled"
            $noEvidence["docker_watchdog"] = $true
        } elseif ($null -ne $pfInfo -and $pfInfo.LastTaskResult -ne 0 -and $pfInfo.LastTaskResult -ne 267011) {
            # 267011 = 0x41303 (task has not yet run, e.g. right after registration).
            $results["docker_watchdog"]    = "warn:last_result_$($pfInfo.LastTaskResult)"
            $noEvidence["docker_watchdog"] = $true
        } elseif ($bypass) {
            $results["docker_watchdog"] = "warn:run_key_bypasses_guard"
        } elseif ($unguardedShortcut) {
            $results["docker_watchdog"] = "warn:shortcut_unguarded"
        } else {
            $results["docker_watchdog"] = "ok:guarded"
        }
    }
} catch {
    $results["docker_watchdog"]    = "warn:exception"
    $noEvidence["docker_watchdog"] = $true
}

# --- Check 7: Claude -> Codex parity ---
# The only detector for "Codex runs with every governance hook silently off"
# (untrusted/stale hook trust, frozen bridge sync). ao-resume.ps1 used to print a
# WARN for this and reset the exit code; 18 days of a crashed sync went unseen.
try {
    $parityScript = Join-Path $root "mcp\codex-userlevel\scripts\check-claude-codex-parity.ps1"
    if (-not (Test-Path -LiteralPath (Join-Path $env:USERPROFILE ".codex")) -or -not (Test-Path -LiteralPath $parityScript)) {
        $results["codex_parity"] = "skip:no_codex"
    } else {
        $parityOut = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $parityScript -WorkRoot $root 2>&1 | ForEach-Object { "$_" })
        if ($LASTEXITCODE -eq 0) {
            $results["codex_parity"] = "ok:parity"
        } else {
            $firstFail = @($parityOut | Where-Object { $_ -match '^\s*-\s' } | Select-Object -First 1)
            $reason = if ($firstFail.Count) { ($firstFail[0] -replace '^\s*-\s*', '' -replace '\s+', '_') } else { 'see_check-claude-codex-parity.ps1' }
            $results["codex_parity"] = "warn:" + $reason.Substring(0, [Math]::Min(140, $reason.Length))
        }
    }
} catch {
    $results["codex_parity"]    = "warn:exception"
    $noEvidence["codex_parity"] = $true
}

# --- Check 8: deploy hold ---
# lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD blocks every lobster-phase1 deploy
# (sg-deploy.sh step 1.85; auto-deploy-next-admin.sh then skips silently, so a held drift stops
# alerting every 4h). That silence is only safe if the hold itself shows up somewhere the operator
# already reads -- this check is that place, via AO-RESUME section 1.
#
# Read from origin/main, NOT from the working copy: prod reads `git show origin/main:<path>`, so a
# hold that exists only as an uncommitted local file is NOT in force even though the file is right
# there on disk (Codex review, 2026-09-23). A detector that reads a different source than the
# enforcer reports "held" while prod deploys -- the exact "偵測器說謊" class AGENTS.md warns about.
# So: origin/main is the verdict, and a local-only copy is its own loud warn, never an ok.
# A hold older than $holdStaleDays has stopped being a deliberate pause and become a forgotten one.
$holdStaleDays = 14
try {
    $holdRel   = "lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD"
    $holdLocal = Test-Path -LiteralPath (Join-Path $root ($holdRel -replace '/', '\'))
    # No network: origin/main is whatever the last fetch left, same ref sg-deploy.sh resolves on the
    # server after its own fetch. git writes "fatal:" to stderr for a missing path; 2>$null + the
    # exit code keep that out of the captured text.
    $holdText  = (& git -C $root show "origin/main:$holdRel" 2>$null | Out-String)
    $holdOnMain = ($LASTEXITCODE -eq 0 -and $holdText.Trim().Length -gt 0)
    if (-not $holdOnMain) {
        if ($holdLocal) {
            # Dangerous middle state: looks held locally, prod sees no hold and will deploy.
            $results["deploy_hold"]    = "warn:hold_local_only_not_on_origin_main"
            $noEvidence["deploy_hold"] = $true
        } else {
            $results["deploy_hold"] = "ok:none"
        }
    } else {
        $reasonLine  = @([regex]::Matches($holdText, '(?m)^reason=(.+)$') | ForEach-Object { $_.Groups[1].Value.Trim() } | Select-Object -First 1)
        $reason      = if ($reasonLine.Count -gt 0) { $reasonLine[0] } else { "unspecified" }
        $reason      = ($reason -replace '\s+', '_')
        if ($reason.Length -gt 90) { $reason = $reason.Substring(0, 90) }
        $createdLine = @([regex]::Matches($holdText, '(?m)^created_utc=(.+)$') | ForEach-Object { $_.Groups[1].Value.Trim() } | Select-Object -First 1)
        $ageDays = $null
        if ($createdLine.Count -gt 0) {
            $parsed = [datetime]::MinValue
            if ([datetime]::TryParse($createdLine[0], [ref]$parsed)) {
                $ageDays = [int][Math]::Floor(((Get-Date).ToUniversalTime() - $parsed.ToUniversalTime()).TotalDays)
            }
        }
        if ($null -eq $ageDays) {
            $results["deploy_hold"] = "warn:hold_no_valid_created_utc:" + $reason
        } elseif ($ageDays -gt $holdStaleDays) {
            $results["deploy_hold"] = "warn:hold_stale_" + $ageDays + "d:" + $reason
        } else {
            $results["deploy_hold"] = "ok:hold_" + $ageDays + "d:" + $reason
        }
    }
} catch {
    $results["deploy_hold"]    = "warn:exception"
    $noEvidence["deploy_hold"] = $true
}

# --- Check 9 / 10: CI health + nightly system-guard gate (via smoke-status-digest.ps1) ---
# These two had NO prior AO-RESUME wiring at all (see the module's own header comment for
# the WORKLOG incident that found this). BLIND here means the digest library itself could
# not run, which must not read as PASS.
if ($null -eq $statusDigest) {
    $results["ci_health"]      = "warn:digest_unavailable"
    $noEvidence["ci_health"]   = $true
    $results["nightly_health"] = "warn:digest_unavailable"
    $noEvidence["nightly_health"] = $true
} else {
    foreach ($pair in @(@{ Key = "ci_health"; Label = "CI" }, @{ Key = "nightly_health"; Label = "Nightly health" })) {
        $entry = $statusDigest.entries[$pair.Key]
        switch ($entry.verdict) {
            "PASS" { $results[$pair.Key] = "ok" }
            "SKIP" { $results[$pair.Key] = "skip:na" }
            "BLIND" {
                $reason = if ($entry.blockers.Count -gt 0) { ($entry.blockers[0] -replace '\s+', '_') } else { "no_evidence" }
                $results[$pair.Key] = "warn:blind_" + $reason.Substring(0, [Math]::Min(100, $reason.Length))
                $noEvidence[$pair.Key] = $true
            }
            default {
                # WARN or FAIL: not a blind spot (a real verdict came back), but still a
                # detector this class treats as critical (its own runbook rationale: a gate
                # nobody watches is not a gate).
                $reason = if ($entry.blockers.Count -gt 0) { ($entry.blockers[0] -replace '\s+', '_') } else { $entry.verdict }
                $results[$pair.Key] = "warn:" + $entry.verdict.ToLowerInvariant() + "_" + $reason.Substring(0, [Math]::Min(100, $reason.Length))
            }
        }
    }
}

# --- Verdict ---
# Computed BEFORE the JSON write so the report carries the conclusion. Without it every
# reader (Claude in AO-RESUME §1, a human skimming the file) has to re-derive the verdict
# by hand, and each re-derivation is a chance to repeat the swallow-the-skip bug below.
$checks    = @("n8n_mcp","repair_center","client_sites","n8n_failures","client_mail","docker_watchdog","codex_parity","deploy_hold","ci_health","nightly_health")

# Checks that are the ONLY detector of a silent-failure class. For these, "skip" means
# monitoring has stopped, so reporting PASS would repeat the mistake that caused the
# 2026-08-03 mail outage: FluentSMTP's own failure notice travelled through wp_mail, so
# the alarm died with the channel it was watching. A detector that goes quiet must be
# louder than one that reports nothing wrong. ci_health/nightly_health join this list for
# the same reason (WORKLOG 2026-09-23): each is the only thing watching its class of gate.
$criticalChecks = @("client_mail","docker_watchdog","codex_parity","ci_health","nightly_health")

$hasWarn    = @($checks | Where-Object { $results[$_] -like "warn:*" -or $results[$_] -like "fail:*" })
# Keyed on "produced no measurement", not on the verdict prefix: warn:ssh_exit255 and
# skip:no_ssh_key are equally blind, and matching "skip:*" alone would report an empty
# blind_spots list while the detector had in fact learned nothing.
$blindSpots = @($criticalChecks | Where-Object { $noEvidence.ContainsKey($_) -and $noEvidence[$_] })
$allSkip    = @($checks | Where-Object { $results[$_] -notlike "skip:*" }).Count -eq 0

# blockers[]: the flat, ready-to-print list ao-resume.md §6 reads verbatim. Sourced from ALL
# TEN status-digest entries (not just the two new $checks keys above) -- the other eight
# (backup/auto-reboot/clickhouse/capacity/site-watch/staging-orphans/routine-freshness/
# cf-security) already have their own $results-less verdict computed elsewhere, but had no
# shared surfacing mechanism before this. Any non-empty blockers[] forces WARN so §0's
# traffic light can never disagree with what §6 is about to print.
$blockers = @()
if ($statusDigest) { $blockers = @($statusDigest.blockers) }
$overall    = if ($hasWarn.Count -gt 0 -or $blindSpots.Count -gt 0 -or $blockers.Count -gt 0) { "WARN" } elseif ($allSkip) { "SKIP" } else { "PASS" }
$colour     = if ($overall -eq "PASS") { "Green" } elseif ($overall -eq "SKIP") { "DarkGray" } else { "Yellow" }

# --- Write LATEST JSON ---
$stamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
$payload = @{
    generated   = $stamp
    overall     = $overall
    blind_spots = @($blindSpots)   # critical detectors that produced no evidence this run
    blockers    = $blockers        # ready-to-print lines from all 10 sibling status reports
    checks      = $results
}
$json = $payload | ConvertTo-Json -Depth 5
Set-Content -Path (Join-Path $reportDir "smoke-LATEST.json") -Value $json -Encoding UTF8

# --- Summary line for console ---
# Surface WHICH detector went blind — "WARN" with no reason sends the reader hunting.
$blindNote = ""
if ($blindSpots.Count -gt 0) {
    $blindNote = " | BLIND: " + (($blindSpots | ForEach-Object { "$_=$($results[$_])" }) -join ",")
}
if ($blockers.Count -gt 0) {
    $blindNote += " | BLOCKERS: " + $blockers.Count
}

# Rendered from $checks, not a hand-maintained positional list: the old {0}..{7} format string
# silently omitted any check added to $checks after it was written.
$summaryPairs = (($checks | ForEach-Object { "{0}={1}" -f $_, $results[$_] }) -join " | ")
Write-Host ("== Smoke: {0} | {1}{2} ==" -f $overall, $summaryPairs, $blindNote) -ForegroundColor $colour
exit 0
