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
    $profileName = $env:SOULFUL_DB_PROFILE; if (-not $profileName) { $profileName = "hostinger" }

    # The SQL is profile-independent: both back ends return a bare tab-separated row.
    $sql = "SELECT (SELECT COUNT(*) FROM wp_fsmpt_email_logs WHERE status='failed' AND created_at > (UTC_TIMESTAMP() - INTERVAL 7 DAY)) AS failed7d, IFNULL(DATEDIFF(UTC_TIMESTAMP(), (SELECT MAX(created_at) FROM wp_fsmpt_email_logs WHERE status='sent')), -1) AS quiet_days;"

    switch ($profileName) {
        "ks-aw-01" {
            $mailHost = $env:SOULFUL_SSH_HOST; if (-not $mailHost) { $mailHost = "149.202.64.114" }
            $mailPort = $env:SOULFUL_SSH_PORT; if (-not $mailPort) { $mailPort = "58122" }
            $mailUser = $env:SOULFUL_SSH_USER; if (-not $mailUser) { $mailUser = "ubuntu" }
            $mailKey  = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
            # Credentials are read from the host's own env file rather than passed in, so
            # the DB password never appears in an argument list or in this repo.
            #
            # A heredoc, not `sudo bash -c '...'`: the SQL contains single quotes
            # (status='failed'), which close the wrapper's own quoting and make the remote
            # shell fail with a syntax error. That first attempt returned ssh_exit1 and was
            # caught by testing the post-cutover profile TODAY rather than on cutover day.
            # <<'INNER' is quoted so the outer shell leaves the body alone and the inner
            # sudo bash expands $SOULFUL_* itself.
            $nl = "`n"
            $remoteCmd = "sudo bash -s <<'INNER'" + $nl +
                         "set -a; . /root/soulful/.env; set +a" + $nl +
                         "docker exec soulful-db mariadb -N -u root -p" + [char]34 + "`$SOULFUL_DB_ROOT_PASSWORD" + [char]34 +
                         " " + [char]34 + "`$SOULFUL_DB_NAME" + [char]34 +
                         " -e " + [char]34 + $sql + [char]34 + $nl +
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

# --- Verdict ---
# Computed BEFORE the JSON write so the report carries the conclusion. Without it every
# reader (Claude in AO-RESUME §1, a human skimming the file) has to re-derive the verdict
# by hand, and each re-derivation is a chance to repeat the swallow-the-skip bug below.
$checks    = @("n8n_mcp","repair_center","client_sites","n8n_failures","client_mail")

# Checks that are the ONLY detector of a silent-failure class. For these, "skip" means
# monitoring has stopped, so reporting PASS would repeat the mistake that caused the
# 2026-08-03 mail outage: FluentSMTP's own failure notice travelled through wp_mail, so
# the alarm died with the channel it was watching. A detector that goes quiet must be
# louder than one that reports nothing wrong.
$criticalChecks = @("client_mail")

$hasWarn    = @($checks | Where-Object { $results[$_] -like "warn:*" -or $results[$_] -like "fail:*" })
# Keyed on "produced no measurement", not on the verdict prefix: warn:ssh_exit255 and
# skip:no_ssh_key are equally blind, and matching "skip:*" alone would report an empty
# blind_spots list while the detector had in fact learned nothing.
$blindSpots = @($criticalChecks | Where-Object { $noEvidence.ContainsKey($_) -and $noEvidence[$_] })
$allSkip    = @($checks | Where-Object { $results[$_] -notlike "skip:*" }).Count -eq 0
$overall    = if ($hasWarn.Count -gt 0 -or $blindSpots.Count -gt 0) { "WARN" } elseif ($allSkip) { "SKIP" } else { "PASS" }
$colour     = if ($overall -eq "PASS") { "Green" } elseif ($overall -eq "SKIP") { "DarkGray" } else { "Yellow" }

# --- Write LATEST JSON ---
$stamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
$payload = @{
    generated   = $stamp
    overall     = $overall
    blind_spots = @($blindSpots)   # critical detectors that produced no evidence this run
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

Write-Host ("== Smoke: {0} | n8n_mcp={1} | repair={2} | clients={3} | n8n_fail={4} | mail={5}{6} ==" -f `
    $overall, $results["n8n_mcp"], $results["repair_center"], $results["client_sites"], $results["n8n_failures"], $results["client_mail"], $blindNote) -ForegroundColor $colour
exit 0
