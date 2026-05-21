#!/usr/bin/env pwsh
# Post-push auto-deploy hook for Trigger.dev workflows.
# Lives in ~/.claude/hooks/ (synced via mcp/claude-userlevel — cross-machine SSOT).
#
# Fires via ~/.claude/settings.json PostToolUse on Bash(git push *).
# Logic:
#   1. Find the current git repo root (hook fires from project dir)
#   2. Guard: only run if scripts/lobster-trigger-deploy.ps1 exists (AwareWave monorepo only)
#   3. Check if the pushed commit(s) touched lobster-factory/packages/workflows/src/
#   4. If not → exit 0 immediately (no delay to other projects or unrelated pushes)
#   5. If yes → run lobster-trigger-deploy.ps1 (~3 min, blocks until done)

$ErrorActionPreference = "Continue"

# Diagnostic log — remove after hook confirmed working
$logFile = "$env:TEMP\post-push-trigger-deploy.log"
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"$ts hook fired pwd=$(Get-Location)" | Add-Content $logFile

# Find repo root dynamically (hook can live anywhere in ~/.claude/hooks/)
$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
"$ts repoRoot='$repoRoot' ec=$LASTEXITCODE" | Add-Content $logFile
if (-not $repoRoot -or $LASTEXITCODE -ne 0) {
    "$ts EXIT: no repo root" | Add-Content $logFile; exit 0
}

# Guard: only run in the AwareWave monorepo
$deployScript = Join-Path $repoRoot "scripts\lobster-trigger-deploy.ps1"
"$ts deployScript='$deployScript' exists=$(Test-Path $deployScript)" | Add-Content $logFile
if (-not (Test-Path $deployScript)) {
    "$ts EXIT: no deploy script" | Add-Content $logFile; exit 0
}

# Which workflow paths trigger an auto-deploy?
$watchPaths = @(
    "lobster-factory/packages/workflows/src/",
    "lobster-factory/packages/workflows/trigger.config.ts",
    "lobster-factory/packages/workflows/package.json"
)

# Get files changed in the last push (HEAD vs HEAD~1)
$changedFiles = git -C $repoRoot diff HEAD~1 HEAD --name-only 2>$null
"$ts changedFiles='$($changedFiles -join ',')' ec=$LASTEXITCODE" | Add-Content $logFile
if ($LASTEXITCODE -ne 0 -or -not $changedFiles) {
    "$ts EXIT: no changed files" | Add-Content $logFile; exit 0
}

# Check if any watched path was touched
$triggered = $false
foreach ($path in $watchPaths) {
    if ($changedFiles | Where-Object { $_ -like "$path*" -or $_ -eq $path }) {
        $triggered = $true; break
    }
}
"$ts triggered=$triggered" | Add-Content $logFile

if (-not $triggered) {
    "$ts EXIT: no watched path changed" | Add-Content $logFile; exit 0
}

Write-Host ""
Write-Host "[auto-deploy] Workflow source changed — starting Trigger.dev deploy..." -ForegroundColor Cyan
Write-Host "[auto-deploy] Changed files:"
$changedFiles | Where-Object {
    $p = $_
    $watchPaths | Where-Object { $p -like "$_*" -or $p -eq $_ }
} | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
Write-Host ""

& powershell.exe -ExecutionPolicy Bypass -File $deployScript
$ec = $LASTEXITCODE

if ($ec -eq 0) {
    Write-Host ""
    Write-Host "[auto-deploy] Deploy succeeded." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[auto-deploy] Deploy FAILED (exit $ec). Run manually:" -ForegroundColor Red
    Write-Host "  powershell -File scripts\lobster-trigger-deploy.ps1" -ForegroundColor Yellow
}

exit $ec
