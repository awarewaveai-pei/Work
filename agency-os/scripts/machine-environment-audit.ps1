param(
    [string]$WorkRoot = "",
    [switch]$FetchOrigin,
    [switch]$RunVerifyGates,
    [switch]$Strict
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\machine-environment-audit.ps1.
$ownerScript = Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\machine-environment-audit.ps1")
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "machine-environment-audit wrapper: owner script missing at $ownerScript"
    exit 1
}

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
