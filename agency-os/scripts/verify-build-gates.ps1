param(
    [string]$WorkRoot = "",
    [switch]$LobsterOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\verify-build-gates.ps1.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\verify-build-gates.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "verify-build-gates wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
