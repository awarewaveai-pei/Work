param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\run-postgres-mcp.ps1.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\run-postgres-mcp.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "run-postgres-mcp wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
