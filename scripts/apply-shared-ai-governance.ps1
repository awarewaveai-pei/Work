<#
.SYNOPSIS
  One-shot shared AI governance setup for this repo.

.DESCRIPTION
  Applies the repo-managed shared governance baseline across tools:

  1) Seeds local closeout inbox (gitignored)
  2) Optionally sanitizes user-level MCP files
  3) Syncs shared MCP registry into supported client configs
  4) Generates a ready-to-paste prompt pack for non-Cursor agents

  This script does not write secrets into git-tracked files.
#>
param(
    [string]$WorkRoot = "",
    [switch]$StrictEnv,
    [switch]$SanitizeUserMcp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkRoot)) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

function Invoke-CheckedScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string[]]$Arguments = @()
    )
    if (-not (Test-Path -LiteralPath $ScriptPath)) {
        throw "Required script not found: $ScriptPath"
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Script failed ($LASTEXITCODE): $ScriptPath"
    }
}

Write-Host "== Shared AI governance: closeout inbox ==" -ForegroundColor Cyan
$initInbox = Join-Path $WorkRoot "scripts\init-closeout-inbox.ps1"
Invoke-CheckedScript -ScriptPath $initInbox -Arguments @("-WorkRoot", $WorkRoot)

if ($SanitizeUserMcp) {
    Write-Host "== Shared AI governance: sanitize user-level MCP ==" -ForegroundColor Cyan
    $sanitize = Join-Path $WorkRoot "scripts\sanitize-user-mcp-config.ps1"
    Invoke-CheckedScript -ScriptPath $sanitize -Arguments @("-WorkspaceRoot", $WorkRoot)
}

Write-Host "== Shared AI governance: sync MCP configs ==" -ForegroundColor Cyan
$sync = Join-Path $WorkRoot "scripts\sync-mcp-config.ps1"
$syncArgs = @("-WorkspaceRoot", $WorkRoot)
if ($StrictEnv) { $syncArgs += "-StrictEnv" }
Invoke-CheckedScript -ScriptPath $sync -Arguments $syncArgs

Write-Host "== Shared AI governance: agent bootstrap prompts ==" -ForegroundColor Cyan
$ensurePrompts = Join-Path $WorkRoot "scripts\ensure-agent-bootstrap-prompts.ps1"
Invoke-CheckedScript -ScriptPath $ensurePrompts -Arguments @("-WorkRoot", $WorkRoot)
$promptPackPath = Join-Path $WorkRoot "agency-os\.agency-state\agent-bootstrap-prompts.md"
$quickPromptPath = Join-Path $WorkRoot "agency-os\.agency-state\agent-bootstrap-prompt.txt"

Write-Host ""
Write-Host "Shared AI governance applied." -ForegroundColor Green
Write-Host "  Prompt pack : $promptPackPath" -ForegroundColor Gray
Write-Host "  Quick prompt: $quickPromptPath" -ForegroundColor Gray
Write-Host "  MCP outputs : .mcp.json / ~/.codex/config.toml / ~/.copilot/mcp-config.json / ~/.gemini/settings.json" -ForegroundColor Gray
