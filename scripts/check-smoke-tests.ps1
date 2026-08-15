#requires -Version 5.1
<#
.SYNOPSIS
  Application-layer smoke tests — runs at every AO-RESUME (warn-only).
  Called by ao-resume.ps1, same pattern as check-backup-health / check-cloudflare-security.

.OUTPUTS
  agency-os/reports/status/smoke-LATEST.json

.NOTES
  Checks (all gracefully skipped on error — never breaks AO-RESUME):
    1. n8n MCP connectivity  (scripts/n8n-mcp-smoke.ps1)
    2. Repair Center health  (GET /api/ops/repairs/health)
    3. Client sites health   (GET /api/ops/clients)
    4. n8n workflow failures (GET n8n/api/v1/executions?status=error — last 24h)
    5. Client outbound mail  (SSH soulful -> wp_fsmpt_email_logs failures, last 7d)
  ops-console-smoke skipped here — requires TenantId which varies by tenant.
  Run /smoke-test manually for full DoD including ops-console.
#>
param(
    [string]$WorkRoot   = "",
    [string]$AppBaseUrl = "https://app.aware-wave.com"
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
    $mailHost = $env:HOSTINGER_SOULFUL_SSH_HOST; if (-not $mailHost) { $mailHost = "191.101.230.176" }
    $mailPort = $env:HOSTINGER_SOULFUL_SSH_PORT; if (-not $mailPort) { $mailPort = "65002" }
    $mailUser = $env:HOSTINGER_SOULFUL_SSH_USER; if (-not $mailUser) { $mailUser = "u942075013" }
    $mailKey  = Join-Path $env:USERPROFILE ".ssh\hostinger_soulful"

    if (-not (Test-Path -LiteralPath $mailKey)) {
        $results["client_mail"] = "skip:no_ssh_key"
    } elseif (-not (Get-Command Invoke-WithUtf8Console -ErrorAction SilentlyContinue)) {
        # No unwrapped fallback on purpose: a bare `& ssh` capture is exactly the
        # CP950 trap class that audit-cp950-traps.ps1 exists to catch.
        $results["client_mail"] = "skip:no_enc_helper"
    } else {
        # PowerShell strips quotes when handing arguments to native ssh, which tore the
        # SQL apart on the remote side ("syntax error near unexpected token `('").
        # Base64 the whole remote script so nothing needs quoting in transit -- same
        # pattern the repo already uses for the CJK/cron encoding trap.
        $sql       = "SELECT COUNT(*) FROM wp_fsmpt_email_logs WHERE status='failed' AND created_at > (UTC_TIMESTAMP() - INTERVAL 7 DAY);"
        $remoteCmd = "cd domains/soulfulexpression.org/public_html && wp db query " + [char]34 + $sql + [char]34 + " --skip-column-names"
        $b64       = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteCmd))
        $sshArgs   = @("-i", $mailKey, "-p", $mailPort, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
                       "-o", "StrictHostKeyChecking=accept-new", "$mailUser@$mailHost",
                       "echo $b64 | base64 -d | bash")
        $raw = Invoke-WithUtf8Console { & ssh @sshArgs 2>&1 }

        $failCount = $null
        foreach ($line in @($raw)) {
            if ("$line".Trim() -match '^\d+$') { $failCount = [int]"$line".Trim(); break }
        }

        if ($null -eq $failCount) {
            $results["client_mail"] = "skip:unparsed"
        } elseif ($failCount -eq 0) {
            $results["client_mail"] = "ok:no_failures_7d"
        } else {
            $results["client_mail"] = "warn:soulful_${failCount}_failed_7d"
        }
    }
} catch {
    $results["client_mail"] = "skip:exception"
}

# --- Write LATEST JSON ---
$stamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
$payload = @{
    generated = $stamp
    checks    = $results
}
$json = $payload | ConvertTo-Json -Depth 5
Set-Content -Path (Join-Path $reportDir "smoke-LATEST.json") -Value $json -Encoding UTF8

# --- Summary line for console ---
$checks    = @("n8n_mcp","repair_center","client_sites","n8n_failures","client_mail")
$hasWarn   = $checks | Where-Object { $results[$_] -like "warn:*" -or $results[$_] -like "fail:*" }
$allSkip   = ($checks | Where-Object { $results[$_] -notlike "skip:*" }).Count -eq 0
$overall   = if ($hasWarn) { "WARN" } elseif ($allSkip) { "SKIP" } else { "PASS" }
$colour    = if ($overall -eq "PASS") { "Green" } elseif ($overall -eq "SKIP") { "DarkGray" } else { "Yellow" }

Write-Host ("== Smoke: {0} | n8n_mcp={1} | repair={2} | clients={3} | n8n_fail={4} | mail={5} ==" -f `
    $overall, $results["n8n_mcp"], $results["repair_center"], $results["client_sites"], $results["n8n_failures"], $results["client_mail"]) -ForegroundColor $colour
exit 0
