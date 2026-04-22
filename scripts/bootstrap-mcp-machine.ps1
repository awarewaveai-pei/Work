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
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
if ([string]::IsNullOrWhiteSpace($EnvScriptPath)) {
    $EnvScriptPath = Join-Path $WorkspaceRoot "mcp\user-env.ps1"
}

$syncScriptPath = Join-Path $WorkspaceRoot "scripts\sync-mcp-config.ps1"
if (-not (Test-Path -LiteralPath $syncScriptPath)) {
    throw "Sync script not found: $syncScriptPath"
}

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

Write-Host ""
Write-Host "Bootstrap finished." -ForegroundColor Green
Write-Host "Use these clients after opening a new terminal if you changed persistent env vars:" -ForegroundColor Gray
Write-Host "  - Codex" -ForegroundColor Gray
Write-Host "  - copilot" -ForegroundColor Gray
Write-Host "  - gemini" -ForegroundColor Gray
