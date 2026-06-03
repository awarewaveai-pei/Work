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
    if ($PSScriptRoot) { return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
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

# --- Write LATEST JSON ---
$stamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
$payload = @{
    generated = $stamp
    checks    = $results
}
$json = $payload | ConvertTo-Json -Depth 5
Set-Content -Path (Join-Path $reportDir "smoke-LATEST.json") -Value $json -Encoding UTF8

# --- Summary line for console ---
$n8nOk     = $results["n8n_mcp"] -eq "ok"
$repairOk  = $results["repair_center"] -eq "ok"
$overall   = if ($n8nOk -and $repairOk) { "PASS" } elseif ($results["repair_center"] -like "skip*" -and $results["n8n_mcp"] -like "skip*") { "SKIP" } else { "WARN" }
$colour    = if ($overall -eq "PASS") { "Green" } elseif ($overall -eq "SKIP") { "DarkGray" } else { "Yellow" }

Write-Host ("== Smoke: {0} | n8n={1} | repair={2} ==" -f $overall, $results["n8n_mcp"], $results["repair_center"]) -ForegroundColor $colour
exit 0
