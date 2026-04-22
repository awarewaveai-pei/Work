<#
.SYNOPSIS
  Start @modelcontextprotocol/server-postgres with a DSN from the environment.

.DESCRIPTION
  MCP hosts typically expand placeholders like ${workspaceFolder} in args, but do not
  substitute arbitrary ${...} tokens inside argv. This script reads the DSN from
  environment variables (set in MCP "env" or Windows User env) and passes the URI
  as the positional argument expected by the server.

  Example DSN (after SSH tunnel): postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/postgres
#>
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$dsn = $env:SUPABASE_AWAREWAVE_POSTGRES_DSN
if ([string]::IsNullOrWhiteSpace($dsn)) {
    # Backward compatibility for older local env setups.
    $dsn = $env:SUPABASE_B_POSTGRES_DSN
}
if ([string]::IsNullOrWhiteSpace($dsn)) {
    $dsn = $env:SUPABASE_POSTGRES_MCP_DSN
}
if ([string]::IsNullOrWhiteSpace($dsn)) {
    throw @"
None of SUPABASE_AWAREWAVE_POSTGRES_DSN, SUPABASE_B_POSTGRES_DSN, or SUPABASE_POSTGRES_MCP_DSN is set.
Define SUPABASE_AWAREWAVE_POSTGRES_DSN in User environment variables or in the MCP server env block.
"@
}

$npx = Get-Command npx -ErrorAction Stop
& $npx.Source @("-y", "@modelcontextprotocol/server-postgres", $dsn)
exit $LASTEXITCODE
