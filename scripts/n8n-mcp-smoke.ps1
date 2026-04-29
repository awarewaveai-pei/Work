<#
.SYNOPSIS
  Loads optional .\mcp\user-env.ps1 then runs JSON-RPC smoke against N8N_MCP_URL.

.DESCRIPTION
  Same probe Cursor uses for HTTP MCP: initialize + tools/list.
  Exit codes match scripts/n8n-mcp-smoke.mjs (0 ok, 1 general fail, 3 HTTP 404).
#>
param(
    [string]$WorkspaceRoot = "",
    [string]$EnvScriptPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
if ([string]::IsNullOrWhiteSpace($EnvScriptPath)) {
    $EnvScriptPath = Join-Path $WorkspaceRoot "mcp\user-env.ps1"
}

if (Test-Path -LiteralPath $EnvScriptPath) {
    Write-Host "Loading machine-local MCP environment: $EnvScriptPath" -ForegroundColor Green
    . $EnvScriptPath
}
else {
    Write-Host "Optional env script not found (using current process env): $EnvScriptPath" -ForegroundColor DarkYellow
}

$scriptPath = Join-Path $PSScriptRoot "n8n-mcp-smoke.mjs"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Smoke script not found: $scriptPath"
}

& node $scriptPath
exit $LASTEXITCODE
