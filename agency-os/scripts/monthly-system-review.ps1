param(
    [string]$AgencyOsRoot = "",
    [switch]$SkipWorklog,
    [switch]$ReportOnly,
    [switch]$NoAlert
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\monthly-system-review.ps1.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\monthly-system-review.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "monthly-system-review wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
