<#
.SYNOPSIS
  Start @modelcontextprotocol/server-filesystem with stable local roots.

.DESCRIPTION
  Launching the filesystem MCP through `cmd /c npx ...` can cause fragile
  stdio behavior on Windows clients. This wrapper resolves the current
  workspace root and user home, then execs `npx` directly.
#>
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$userHome = $env:USERPROFILE
if ([string]::IsNullOrWhiteSpace($userHome)) {
    throw "USERPROFILE is not set."
}

$npx = Get-Command npx -ErrorAction Stop
& $npx.Source @("-y", "@modelcontextprotocol/server-filesystem", $userHome, $workspaceRoot)
exit $LASTEXITCODE
