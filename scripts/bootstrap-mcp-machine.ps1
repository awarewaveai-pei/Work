<#
.SYNOPSIS
  Bootstrap MCP on a new machine from this repo.

.DESCRIPTION
  Loads a machine-local environment bootstrap script if present, then runs the
  shared MCP sync so Codex, Copilot CLI, Gemini CLI, and workspace-level MCP
  clients all receive consistent configuration.

  Expected local secret file:
    .\mcp\user-env.ps1

  That file is intentionally gitignored. Create it by copying:
    .\mcp\user-env.template.ps1
#>
param(
    [string]$WorkspaceRoot = "",
    [string]$EnvScriptPath = "",
    [switch]$SkipEnvLoad,
    [switch]$StrictEnv
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}
if ([string]::IsNullOrWhiteSpace($EnvScriptPath)) {
    $EnvScriptPath = Join-Path $WorkspaceRoot "mcp\user-env.ps1"
}

$syncScriptPath = Join-Path $WorkspaceRoot "scripts\sync-mcp-config.ps1"
if (-not (Test-Path -LiteralPath $syncScriptPath)) {
    throw "Sync script not found: $syncScriptPath"
}

# --- Ensure .claude is a junction to $env:USERPROFILE\.claude ---
# Why: .claude/commands/, .claude/agents/*.md, .claude/skills/ are git-tracked but live under
# ~/.claude/ at runtime. A junction makes git see and update those files in place. Without it,
# git pull writes to D:\Work\.claude\ as a real folder and Claude Code keeps reading ~/.claude\,
# causing silent drift between commands/agents/skills committed in git vs. what actually runs.
$claudeRepoPath = Join-Path $WorkspaceRoot ".claude"
$claudeUserPath = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path -LiteralPath $claudeUserPath)) {
    Write-Host "WARN: $claudeUserPath does not exist; Claude Code may not be installed. Skipping junction setup." -ForegroundColor Yellow
} else {
    $needsJunction = $false
    if (-not (Test-Path -LiteralPath $claudeRepoPath)) {
        $needsJunction = $true
    } else {
        $item = Get-Item -LiteralPath $claudeRepoPath -Force
        $isLink = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
        if (-not $isLink) {
            Write-Host "WARN: $claudeRepoPath exists as a real directory, not a junction." -ForegroundColor Yellow
            Write-Host "  Cross-machine sync of commands/agents/skills will NOT work until this is fixed." -ForegroundColor Yellow
            Write-Host "  Manual fix: backup contents, then 'rmdir $claudeRepoPath' and re-run bootstrap." -ForegroundColor Yellow
        } else {
            Write-Host "Junction already exists: $claudeRepoPath -> $($item.Target)" -ForegroundColor Gray
        }
    }
    if ($needsJunction) {
        Write-Host "Creating junction: $claudeRepoPath -> $claudeUserPath" -ForegroundColor Green
        try {
            New-Item -ItemType Junction -Path $claudeRepoPath -Target $claudeUserPath -Force | Out-Null
            Write-Host "  Junction created." -ForegroundColor Green
        } catch {
            # Critic 2026-05-22: silent continue is dangerous -- subsequent sync-mcp-config.ps1
            # would write into a non-junction path, baking in drift. Match this script's
            # existing throw-on-failure pattern (lines 98/108/118 below).
            Write-Host "  ERROR: junction creation failed: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "  Fix: in an admin shell, run: mklink /J `"$claudeRepoPath`" `"$claudeUserPath`"" -ForegroundColor Yellow
            Write-Host "  Then re-run bootstrap-mcp-machine.ps1" -ForegroundColor Yellow
            throw "Junction setup failed; refusing to continue and bake in drift."
        }
    }
}

# --- Git-native hooks (scripts/githooks): every committer passes them, not only Claude's Bash tool ---
git -C $WorkspaceRoot config core.hooksPath scripts/githooks
if ($LASTEXITCODE -ne 0) { throw "git config core.hooksPath failed; the mass-deletion pre-commit guard would be off." }
Write-Host "Git hooks: core.hooksPath = scripts/githooks" -ForegroundColor Gray

if (-not $SkipEnvLoad) {
    if (Test-Path -LiteralPath $EnvScriptPath) {
        Write-Host "Loading machine-local MCP environment: $EnvScriptPath" -ForegroundColor Green
        . $EnvScriptPath
    } else {
        Write-Host "Machine-local env script not found: $EnvScriptPath" -ForegroundColor Yellow
        Write-Host "Create it from mcp\\user-env.template.ps1 if this is a new machine." -ForegroundColor Yellow
    }
}

$syncParams = @{
    WorkspaceRoot = $WorkspaceRoot
}
if ($StrictEnv) {
    $syncParams["StrictEnv"] = $true
}

Write-Host "Running shared MCP sync..." -ForegroundColor Green
& $syncScriptPath @syncParams

$ensurePrompts = Join-Path $WorkspaceRoot "scripts\ensure-agent-bootstrap-prompts.ps1"
if (Test-Path -LiteralPath $ensurePrompts) {
    Write-Host "Ensuring agent bootstrap prompts (gitignored)..." -ForegroundColor Green
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ensurePrompts -WorkRoot $WorkspaceRoot
    if ($LASTEXITCODE -ne 0) {
        throw "ensure-agent-bootstrap-prompts.ps1 failed (exit $LASTEXITCODE)"
    }
}

$syncClaudeUserlevel = Join-Path $WorkspaceRoot "scripts\sync-claude-userlevel.ps1"
if (Test-Path -LiteralPath $syncClaudeUserlevel) {
    Write-Host "Aligning Claude Code user-level files (hooks/, settings.json, mcp.json)..." -ForegroundColor Green
    # On bootstrap we use install mode so hooks/settings/mcp all align to SSOT.
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncClaudeUserlevel -Mode install
    if ($LASTEXITCODE -ne 0) {
        throw "sync-claude-userlevel.ps1 failed (exit $LASTEXITCODE)"
    }
}

$syncCodexUserlevel = Join-Path $WorkspaceRoot "mcp\codex-userlevel\scripts\sync-claude-to-codex.ps1"
if (Test-Path -LiteralPath $syncCodexUserlevel) {
    Write-Host "Aligning Codex user-level Claude compatibility wrappers..." -ForegroundColor Green
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncCodexUserlevel -WorkRoot $WorkspaceRoot -Mode linked
    if ($LASTEXITCODE -ne 0) {
        throw "sync-claude-to-codex.ps1 failed (exit $LASTEXITCODE)"
    }

    $checkCodexParity = Join-Path $WorkspaceRoot "mcp\codex-userlevel\scripts\check-claude-codex-parity.ps1"
    if (Test-Path -LiteralPath $checkCodexParity) {
        Write-Host "Verifying Claude/Codex bridge parity (names and structure only)..." -ForegroundColor Green
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checkCodexParity -WorkRoot $WorkspaceRoot
        if ($LASTEXITCODE -ne 0) {
            throw "check-claude-codex-parity.ps1 failed (exit $LASTEXITCODE). On a fresh machine the hook-trust check fails until you open Codex in $WorkspaceRoot, run /hooks and trust the AwareWave hooks; then rerun the parity check."
        }
    }
}

Write-Host ""
Write-Host "Bootstrap finished." -ForegroundColor Green
Write-Host "Use these clients after opening a new terminal if you changed persistent env vars:" -ForegroundColor Gray
Write-Host "  - Codex" -ForegroundColor Gray
Write-Host "  - copilot" -ForegroundColor Gray
Write-Host "  - gemini" -ForegroundColor Gray
Write-Host "  - Claude Code (restart to reload settings.json/hooks)" -ForegroundColor Gray
