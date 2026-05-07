param(
    [string]$WorkRoot = "",
    [switch]$LobsterOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
}

$bootstrap = Join-Path $WorkRoot "lobster-factory\scripts\bootstrap-validate.mjs"
if (-not (Test-Path $bootstrap)) {
    Write-Error "verify-build-gates: missing $bootstrap"
    exit 1
}

Write-Host "== Lobster Factory: bootstrap-validate ==" -ForegroundColor Cyan
$hadWr = Test-Path env:LOBSTER_WORK_ROOT
$prevWr = $env:LOBSTER_WORK_ROOT
$env:LOBSTER_WORK_ROOT = $WorkRoot
try {
    & node $bootstrap
    if ($LASTEXITCODE -ne 0) {
        Write-Error "verify-build-gates: bootstrap-validate failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
} finally {
    if ($hadWr) { $env:LOBSTER_WORK_ROOT = $prevWr }
    else { Remove-Item Env:\LOBSTER_WORK_ROOT -ErrorAction SilentlyContinue }
}

if ($LobsterOnly) {
    Write-Host "verify-build-gates: LobsterOnly -> skipped agency-os health check" -ForegroundColor Yellow
    Write-Host "verify-build-gates: ALL PASSED (lobster only)" -ForegroundColor Green
    exit 0
}

# Keep monorepo root .cursor/rules 00 + 30 + 40 (path-transformed) + 50-operator + 63–66 identical to agency-os canonical (SSOT).
$syncEnt = Join-Path $WorkRoot "scripts\sync-enterprise-cursor-rules-to-monorepo-root.ps1"
if (Test-Path -LiteralPath $syncEnt) {
    Write-Host "== Monorepo: sync Cursor rules (00 + 30 + 40 + 50-operator + 63-66) to repo root ==" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -NoProfile -File $syncEnt -MonorepoRoot $WorkRoot -Quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Error "verify-build-gates: sync-enterprise-cursor-rules-to-monorepo-root failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

$agencyRoot = Join-Path $WorkRoot "agency-os"
$healthScript = Join-Path $WorkRoot "scripts\system-health-check.ps1"
if (-not (Test-Path -LiteralPath $healthScript)) {
    Write-Error "verify-build-gates: missing monorepo health script at $healthScript (use -LobsterOnly to skip)"
    exit 1
}

$adrIdx = Join-Path $agencyRoot "scripts\verify-adr-index.ps1"
if (Test-Path -LiteralPath $adrIdx) {
    Write-Host "== Agency OS: verify-adr-index ==" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -NoProfile -File $adrIdx
    if ($LASTEXITCODE -ne 0) {
        Write-Error "verify-build-gates: verify-adr-index failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

Write-Host "== Observability baseline: Sentry contract ==" -ForegroundColor Cyan
$sentryPolicy = Join-Path $agencyRoot "docs\operations\SENTRY_ALERT_POLICY.md"
if (-not (Test-Path -LiteralPath $sentryPolicy)) {
    Write-Error "verify-build-gates: missing Sentry alert policy at $sentryPolicy"
    exit 1
}

$phase1EnvExample = Join-Path $WorkRoot "lobster-factory\infra\hetzner-phase1-core\.env.example"
if (-not (Test-Path -LiteralPath $phase1EnvExample)) {
    Write-Error "verify-build-gates: missing phase1 .env.example at $phase1EnvExample"
    exit 1
}

$envRaw = Get-Content -LiteralPath $phase1EnvExample -Raw
$requiredSentryKeys = @(
    "SENTRY_DSN_NODE_API",
    "SENTRY_DSN_TRIGGER_WORKFLOWS",
    "SENTRY_DSN_N8N_BACKEND",
    "SENTRY_DSN_NEXT_ADMIN",
    "SENTRY_DSN_WORDPRESS"
)
foreach ($key in $requiredSentryKeys) {
    if ($envRaw -notmatch ("(?m)^" + [regex]::Escape($key) + "=")) {
        Write-Error "verify-build-gates: missing required Sentry key in .env.example: $key"
        exit 1
    }
}

Write-Host "== Agency OS: system-health-check ==" -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -NoProfile -File $healthScript -WorkspaceRoot $agencyRoot
if ($LASTEXITCODE -ne 0) {
    Write-Error "verify-build-gates: system-health-check failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
}

# Shared AI Governance gate
$govScript = Join-Path $WorkRoot "scripts\verify-shared-ai-governance.ps1"
if (Test-Path -LiteralPath $govScript) {
    Write-Host "== Shared AI Governance: Verify SSOT and Sync ==" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -NoProfile -File $govScript -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "verify-build-gates: verify-shared-ai-governance failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

Write-Host "== AO-RESUME contract: auto-checkpoint must pin WorkRoot ==" -ForegroundColor Cyan
$aoResumeScript = Join-Path $WorkRoot "scripts\ao-resume.ps1"
if (-not (Test-Path -LiteralPath $aoResumeScript)) {
    Write-Error "verify-build-gates: missing ao-resume script at $aoResumeScript"
    exit 1
}
$aoResumeRaw = Get-Content -LiteralPath $aoResumeScript -Raw -Encoding UTF8
$autoCheckpointCallPattern = '(?m)^\s*&\s*powershell\.exe\s+-NoProfile\s+-ExecutionPolicy\s+Bypass\s+-File\s+\$checkpointScript\s+-Message\s+\$checkpointMsg\s+-WorkRoot\s+\$Root(?:\s*\|\s*Out-Host)?\s*$'
if ($aoResumeRaw -notmatch $autoCheckpointCallPattern) {
    Write-Error "verify-build-gates: ao-resume auto-checkpoint call must pass -WorkRoot `$Root (contract guard)."
    exit 1
}

# --- Claude Code user-level SSOT contract (mechanical, not doc-only) ---
Write-Host "== Claude user-level SSOT contract: required files exist ==" -ForegroundColor Cyan
$claudeUserlevelDir = Join-Path $WorkRoot "mcp\claude-userlevel"
$requiredClaudeUserlevelFiles = @(
    "manifest.json",
    "settings.template.json",
    "mcp.template.json",
    "README.md",
    "hooks\hooks.json",
    "hooks\ao-resume-on-prompt.ps1",
    "hooks\branch-protection.js"
)
foreach ($rel in $requiredClaudeUserlevelFiles) {
    $abs = Join-Path $claudeUserlevelDir $rel
    if (-not (Test-Path -LiteralPath $abs)) {
        Write-Error "verify-build-gates: missing Claude user-level SSOT file: $abs"
        exit 1
    }
}
$claudeSyncScript = Join-Path $WorkRoot "scripts\sync-claude-userlevel.ps1"
if (-not (Test-Path -LiteralPath $claudeSyncScript)) {
    Write-Error "verify-build-gates: missing sync-claude-userlevel.ps1 (Claude user-level enforcement engine)"
    exit 1
}
# bootstrap-mcp-machine.ps1 must wire the sync (so new machines auto-align)
$bootstrapRaw = Get-Content -LiteralPath (Join-Path $WorkRoot "scripts\bootstrap-mcp-machine.ps1") -Raw -Encoding UTF8
if ($bootstrapRaw -notmatch 'sync-claude-userlevel\.ps1') {
    Write-Error "verify-build-gates: bootstrap-mcp-machine.ps1 must invoke sync-claude-userlevel.ps1 -Mode install (contract guard)."
    exit 1
}
# ao-resume.ps1 must invoke the verify-mode warn-only check (anchored on contract marker)
if ($aoResumeRaw -notmatch '#\s*CONTRACT:\s*invoke\s+sync-claude-userlevel\.ps1\s+-Mode\s+verify') {
    Write-Error "verify-build-gates: ao-resume.ps1 must invoke sync-claude-userlevel.ps1 -Mode verify (warn-only drift detector). Missing contract marker."
    exit 1
}
if ($aoResumeRaw -notmatch '-Mode verify') {
    Write-Error "verify-build-gates: ao-resume.ps1 missing actual '-Mode verify' invocation."
    exit 1
}

Write-Host "verify-build-gates: ALL PASSED" -ForegroundColor Green
