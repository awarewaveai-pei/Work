<#
.SYNOPSIS
  Start @modelcontextprotocol/server-postgres with a DSN from the environment.

.DESCRIPTION
  MCP hosts typically expand placeholders like ${workspaceFolder} in args, but do not
  substitute arbitrary ${SUPABASE_POSTGRES_MCP_DSN} tokens inside argv. This script
  reads SUPABASE_POSTGRES_MCP_DSN from the process environment (set in MCP "env" or
  Windows User env) and passes the URI as the positional argument expected by the server.

  Example DSN (after SSH tunnel): postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/postgres
#>
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$dsn = $env:SUPABASE_POSTGRES_MCP_DSN
if ([string]::IsNullOrWhiteSpace($dsn)) {
    throw @"
SUPABASE_POSTGRES_MCP_DSN is not set. Define it in User environment variables or in the MCP server's env block (do not commit values). See repo root mcp.json.template -> supabase-postgres.
"@
}

$npx = Get-Command npx -ErrorAction Stop
& $npx.Source @("-y", "@modelcontextprotocol/server-postgres", $dsn)
exit $LASTEXITCODE
