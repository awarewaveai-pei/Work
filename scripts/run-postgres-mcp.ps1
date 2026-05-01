<#
.SYNOPSIS
  Start repo Postgres MCP (full SQL: SELECT / DDL / DML) with DSN from the environment.

.DESCRIPTION
  Upstream @modelcontextprotocol/server-postgres runs every statement in READ ONLY and
  cannot apply migrations. This script starts mcp-local-wrappers/postgres-full-access-mcp.mjs
  instead (same DSN env vars).

  Optional: POSTGRES_MCP_READ_ONLY=true restores read-only behavior.

  Example DSN (after SSH tunnel): postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/postgres
#>
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Find-MonorepoRootWithPostgresMcp {
    $dir = $PSScriptRoot
    while ($dir) {
        $scriptPath = Join-Path $dir "mcp-local-wrappers\postgres-full-access-mcp.mjs"
        if (Test-Path $scriptPath) {
            return $dir
        }
        $parent = Split-Path $dir -Parent
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    throw "Could not find mcp-local-wrappers/postgres-full-access-mcp.mjs (walk up from $PSScriptRoot)."
}

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

$repoRoot = Find-MonorepoRootWithPostgresMcp
$mcpDir = Join-Path $repoRoot "mcp-local-wrappers"
$mcpScript = Join-Path $mcpDir "postgres-full-access-mcp.mjs"

$node = Get-Command node -ErrorAction Stop
Push-Location $mcpDir
try {
    & $node.Source $mcpScript
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
