param(
    [string]$ProjectRef = "",
    [string]$TokenName = "TRIGGER_ACCESS_TOKEN"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\start-trigger-mcp.ps1.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\start-trigger-mcp.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "start-trigger-mcp wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
