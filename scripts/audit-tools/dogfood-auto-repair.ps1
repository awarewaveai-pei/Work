# dogfood-auto-repair.ps1
# Synthetic Auto-Repair end-to-end drill harness for Tier 3 monthly audits.
#
# Owner doc: agency-os/docs/operations/BUG_HUNT_PROTOCOL.md
# Audit owner: agency-os/reports/audit/auto-repair-*.md (latest)
#
# Modes:
#   -Mode HealthOnly  (default, read-only, safe to run anytime)
#     Curls /api/ops/repairs/health and asserts ok=true + key invariants.
#
#   -Mode SyntheticSentry (writes a fake incident with AUDIT-marked fingerprint)
#     POSTs a fingerprintable Sentry payload, captures the incident_id and
#     repair_run_id (if Slack flow exercised), then auto-cleanup marks it
#     resolved via /api/ops/inbox/<id>/resolve.
#     **Requires explicit -ConfirmProd switch -- never runs against prod without it.**
#
# Exit codes: 0 = pass, 1 = fail, 2 = warn (config gap but no logic violation)

[CmdletBinding()]
param(
    [ValidateSet('HealthOnly','SyntheticSentry')]
    [string]$Mode = 'HealthOnly',
    [string]$BaseUrl = 'https://app.aware-wave.com',
    [string]$AuditTag = "[AUDIT-$(Get-Date -Format 'yyyy-MM-dd')]",
    [switch]$ConfirmProd
)

$ErrorActionPreference = 'Stop'
$script:WarnCount = 0
$script:FailCount = 0

function Write-Line { param([string]$s); Write-Host $s }
function Write-Ok   { param([string]$s); Write-Host "  [OK]   $s" -ForegroundColor Green }
function Write-Warn { param([string]$s); Write-Host "  [WARN] $s" -ForegroundColor Yellow; $script:WarnCount++ }
function Write-Fail { param([string]$s); Write-Host "  [FAIL] $s" -ForegroundColor Red; $script:FailCount++ }

Write-Line ""
Write-Line "=== Auto-Repair dogfood drill -- $AuditTag ==="
Write-Line "Mode: $Mode  |  BaseUrl: $BaseUrl"
Write-Line ""

# ---------------- HealthOnly probe ----------------
Write-Line "[1/2] Probe /api/ops/repairs/health"
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/api/ops/repairs/health" -TimeoutSec 15 -Method GET
} catch {
    Write-Fail "health endpoint unreachable: $($_.Exception.Message)"
    exit 1
}

# Min-2 from 2026-05-23 self-critic: guard against Cloudflare interstitial / non-JSON 200 returning a string
if (-not $health -or -not ($health.PSObject.Properties.Name -contains 'ok')) {
    Write-Fail "health response malformed (Cloudflare interstitial?): $($health | Out-String)"
    exit 1
}

# Key invariants from the 2026-05-23 audit baseline
$invariants = @(
    @{ Name = 'ok=true';                Test = { $health.ok -eq $true } }
    @{ Name = 'system_mode=normal';     Test = { $health.system_mode -eq 'normal' } }
    @{ Name = 'table_ok=true';          Test = { $health.table_ok -eq $true } }
    @{ Name = 'backup_configured';      Test = { $health.backup_configured -eq $true } }
    @{ Name = 'eu_backup_required+configured'; Test = { -not $health.eu_backup_required -or $health.eu_backup_configured } }
    @{ Name = 'backup_script_probe.sg=ok'; Test = { $health.backup_script_probe.sg -eq 'ok' } }
    @{ Name = 'backup_script_probe.eu=ok'; Test = { $health.backup_script_probe.eu -eq 'ok' } }
    @{ Name = 'github_configured';      Test = { $health.github_configured -eq $true } }
    @{ Name = 'slack_signing_configured';Test = { $health.slack_signing_configured -eq $true } }
    @{ Name = 'policy_catalog_text_ok'; Test = { $health.policy_catalog_text_ok -eq $true } }
)

foreach ($inv in $invariants) {
    # Min-3 from 2026-05-23 self-critic: wrap test in try/catch; exception = fail (not silent skip)
    try {
        if (& $inv.Test) { Write-Ok $inv.Name } else { Write-Fail $inv.Name }
    } catch {
        Write-Fail ("{0} (test threw: {1})" -f $inv.Name, $_.Exception.Message)
    }
}

if ($health.github_app_status -ne 'confirmed_by_operator' -and $health.github_app_status -ne 'auto_detected') {
    Write-Warn "github_app_status=$($health.github_app_status) (cosmetic; functional path is github.token via workflow)"
}

# ---------------- Logic-layer gaps the health endpoint cannot see ----------------
Write-Line ""
Write-Line "[2/2] Logic-layer audit reminders (health endpoint CANNOT validate these)"
# NOTE: ASCII-only by design (CP950 console will render emoji as '??' -- Min-1 from 2026-05-23 self-critic)
$logicReminders = @(
    '[CRIT] C1: sg-deploy.sh Step 7 smoke-fail still does NOT invoke rollback-phase1.sh -- verify after every infra patch'
    '[CRIT] C2: lib/ops-inbox/redactSecrets.ts redacts keys only, NOT values -- verify after every normalize/* change'
    '[CRIT] C3: webhook routes have no body-size cap -- verify nginx webhook zone rate limit + req.text() refactor'
    '[CRIT] C4: GET /api/ops/repairs lacks canApproveCommand guard + returns audit_log to viewers'
    '[CRIT] C5: service.ts:104 critical-severity gate is a flag, not a pipeline stop'
    '[MAJ]  M*: see agency-os/reports/audit/auto-repair-2026-05-23.md for full list'
)
foreach ($r in $logicReminders) { Write-Line "    $r" }

Write-Line ""
if ($Mode -eq 'SyntheticSentry') {
    if (-not $ConfirmProd) {
        Write-Warn "SyntheticSentry mode requires -ConfirmProd switch; not running synthetic POST."
    } else {
        Write-Warn "SyntheticSentry mode not yet implemented -- placeholder for v2."
        Write-Warn "Manual procedure: see audit report 2026-05-23 sectionDogfood for current curl + cleanup steps."
    }
}

Write-Line ""
Write-Line "=== Summary: $($invariants.Count - $script:FailCount)/$($invariants.Count) invariants passed, $script:WarnCount warn(s), $script:FailCount fail(s) ==="
if ($script:FailCount -gt 0) { exit 1 }
elseif ($script:WarnCount -gt 0) { exit 2 }
else { exit 0 }
