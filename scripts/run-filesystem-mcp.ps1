<#
.SYNOPSIS
  Start @modelcontextprotocol/server-filesystem with stable local roots.

.DESCRIPTION
  Resolves the current workspace root and user home, then starts the server
  from the pinned install in mcp-local-wrappers.
#>
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$userHome = $env:USERPROFILE
if ([string]::IsNullOrWhiteSpace($userHome)) {
    throw "USERPROFILE is not set."
}

$entry = Join-Path $workspaceRoot "mcp-local-wrappers\node_modules\@modelcontextprotocol\server-filesystem\dist\index.js"
if (-not (Test-Path -LiteralPath $entry)) {
    throw "Missing $entry -- run 'npm ci' in mcp-local-wrappers."
}
$node = Get-Command node -ErrorAction Stop
& $node.Source @($entry, $userHome, $workspaceRoot)
exit $LASTEXITCODE
