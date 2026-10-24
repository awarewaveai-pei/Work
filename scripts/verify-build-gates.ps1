param(
    [string]$WorkRoot = "",
    [switch]$LobsterOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
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

# Compose resource invariants (memory, no swap, pids, bounded healthchecks, Apache workers vs memory): WORKLOG 2026-10-24.
Write-Host "== Compose invariants: every prod service fails fast ==" -ForegroundColor Cyan
& python -X utf8 (Join-Path $WorkRoot "scripts\check-compose-invariants.py")
if ($LASTEXITCODE -ne 0) {
    Write-Error "verify-build-gates: check-compose-invariants FAIL (lines above name file, service, invariant)"
    exit $LASTEXITCODE
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

$adrIdx = Join-Path $PSScriptRoot "verify-adr-index.ps1"
if (Test-Path -LiteralPath $adrIdx) {
    Write-Host "== Agency OS: verify-adr-index ==" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -NoProfile -File $adrIdx
    if ($LASTEXITCODE -ne 0) {
        Write-Error "verify-build-gates: verify-adr-index failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

# Scan local config files (Claude/Cursor/MCP) for plaintext secrets.
# Tracked-file hits FAIL (block); gitignored-file hits WARN (continue).
# See: agency-os/docs/operations/mcp-secrets-hardening-runbook.md
$secretScan = Join-Path $WorkRoot "scripts\scan-local-config-for-secrets.ps1"
if (Test-Path -LiteralPath $secretScan) {
    Write-Host "== Local config: scan-for-secrets ==" -ForegroundColor Cyan
    $secretBaseline = Join-Path $WorkRoot "agency-os\config\scan-local-config-known-suppressed.json"
    $secretArgs = @("-WorkRoot", $WorkRoot, "-Quiet")
    if (Test-Path -LiteralPath $secretBaseline) {
        $secretArgs += @("-KnownSuppressedBaseline", $secretBaseline)
    }
    & powershell -ExecutionPolicy Bypass -NoProfile -File $secretScan @secretArgs
    if ($LASTEXITCODE -eq 2) {
        Write-Error "verify-build-gates: scan-local-config-for-secrets FAIL (tracked secret or baseline-miss local secret). See runbook."
        exit $LASTEXITCODE
    }
    if ($LASTEXITCODE -eq 1) {
        Write-Host "verify-build-gates: scan-local-config-for-secrets WARN (gitignored plaintext; non-blocking). See runbook." -ForegroundColor Yellow
    }
}

# Git EAP-safety gate — the regression guarantee for the recurring AO-RESUME crash class:
# a git call under $ErrorActionPreference='Stop' that captures stderr (2>&1) without an
# EAP='Continue'/lib guard throws NativeCommandError on git's normal "From <url>" stderr.
# Fixed 5x as one-off heads (git-align 2026-06-05 was the latest); this gate stops #6.
$gitEapLint = Join-Path $WorkRoot "scripts\lint-git-eap-safety.ps1"
if (Test-Path -LiteralPath $gitEapLint) {
    Write-Host "== Git EAP safety: no unguarded git stderr capture (PS5.1 NativeCommandError) ==" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -NoProfile -File $gitEapLint -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "verify-build-gates: lint-git-eap-safety FAIL — a git call under EAP=Stop captures stderr without an EAP=Continue/lib guard (the recurring AO-RESUME crash class). Route via scripts/lib/git-safe-ops.ps1 or wrap with scoped `$ErrorActionPreference='Continue'."
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

$envRaw = Get-Content -LiteralPath $phase1EnvExample -Raw -Encoding UTF8
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

# 2026-08-26: this guard was INVERTED, because the contract it enforced was deleted.
# It used to assert that ao-resume.ps1 CONTAINS an auto-checkpoint call pinned with
# -WorkRoot $Root. On 2026-08-25/26 every automatic commit call site was removed
# (8c3ac617 / c63bdc5c / 680db6c6 / 7251d14d) because auto-committing the operator dirty
# tree produced six documented harm classes and zero recovered work. The guard was not
# updated alongside them, so verify-build-gates has been failing ever since -- a gate
# demanding the presence of something the codebase deliberately no longer has.
# The useful contract now runs the other way: nothing in ao-resume.ps1 may silently
# commit. Asserting the absence also stops the habit from being reintroduced later.
Write-Host "== AO-RESUME contract: no automatic commit call sites ==" -ForegroundColor Cyan
$aoResumeScript = Join-Path $WorkRoot "scripts\ao-resume.ps1"
if (-not (Test-Path -LiteralPath $aoResumeScript)) {
    Write-Error "verify-build-gates: missing ao-resume script at $aoResumeScript"
    exit 1
}
$aoResumeRaw = Get-Content -LiteralPath $aoResumeScript -Raw -Encoding UTF8
# Strip comment lines first: the tombstones explaining the removal legitimately mention
# the old names, and a guard that trips on its own documentation is worse than no guard.
$aoResumeCode = (($aoResumeRaw -split "`r?`n") | Where-Object { $_ -notmatch '^\s*#' }) -join "`n"
if ($aoResumeCode -match '(commit-checkpoint\.ps1|\$checkpointScript)') {
    Write-Error "verify-build-gates: ao-resume.ps1 must not invoke commit-checkpoint. Automatic commits were removed 2026-08-25/26 (see agency-os/WORKLOG.md); found: $($Matches[1])"
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
    "hooks\rules\branch-protection.js"
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
# ao-resume.ps1 must invoke sync-claude-userlevel.ps1 in verify OR merge mode (anchored on contract marker)
# merge is a superset of verify (auto-fixes drift instead of just warning)
if ($aoResumeRaw -notmatch '#\s*CONTRACT:\s*invoke\s+sync-claude-userlevel\.ps1\s+-Mode\s+(verify|merge)') {
    Write-Error "verify-build-gates: ao-resume.ps1 must invoke sync-claude-userlevel.ps1 -Mode verify or -Mode merge. Missing contract marker."
    exit 1
}
if ($aoResumeRaw -notmatch '-Mode (verify|merge)') {
    Write-Error "verify-build-gates: ao-resume.ps1 missing actual '-Mode verify' or '-Mode merge' invocation."
    exit 1
}

Write-Host "verify-build-gates: ALL PASSED" -ForegroundColor Green
