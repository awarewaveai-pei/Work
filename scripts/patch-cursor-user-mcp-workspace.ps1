<#
.SYNOPSIS
  Replace ${workspaceFolder} / ${userHome} in %USERPROFILE%\.cursor\mcp.json with real paths.

.DESCRIPTION
  Cursor resolves ${workspaceFolder} relative to a project .cursor/mcp.json. When all MCP
  config lives in the user-level file, those placeholders often stay literal and break
  work-global, trigger, LLM wrappers, etc.

  Run from monorepo root after opening the correct folder in Explorer:
    powershell -ExecutionPolicy Bypass -File .\scripts\patch-cursor-user-mcp-workspace.ps1

  Or pass an explicit root:
    powershell -ExecutionPolicy Bypass -File .\scripts\patch-cursor-user-mcp-workspace.ps1 -WorkspaceRoot "D:\Work"
#>
param(
    [string]$WorkspaceRoot = "",
    [string]$UserMcpPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
if ([string]::IsNullOrWhiteSpace($UserMcpPath)) {
    $UserMcpPath = Join-Path $env:USERPROFILE ".cursor\mcp.json"
}
if (-not (Test-Path -LiteralPath $UserMcpPath)) {
    throw "User MCP file not found: $UserMcpPath"
}

$homeNorm = $env:USERPROFILE.TrimEnd('\')
$wsNorm = $WorkspaceRoot.TrimEnd('\')

function Escape-JsonPathFragment([string]$PathFragment) {
    return $PathFragment.Replace('\', '\\')
}

$raw = Get-Content -LiteralPath $UserMcpPath -Raw -Encoding UTF8
$wsEsc = Escape-JsonPathFragment $wsNorm
$homeEsc = Escape-JsonPathFragment $homeNorm
$raw2 = $raw.Replace('${workspaceFolder}', $wsEsc).Replace('${userHome}', $homeEsc)
if ($raw2 -ceq $raw) {
    Write-Host "No ${workspaceFolder} or ${userHome} placeholders found; no changes." -ForegroundColor Yellow
    exit 0
}
# UTF8 without BOM so Node/strict JSON parsers accept the file
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($UserMcpPath, $raw2, $utf8NoBom)
Write-Host "Patched user MCP: $UserMcpPath" -ForegroundColor Green
Write-Host "  workspace -> $wsNorm" -ForegroundColor Gray
Write-Host "  userHome  -> $homeNorm" -ForegroundColor Gray
