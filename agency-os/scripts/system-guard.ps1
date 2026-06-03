param(
    [string]$WorkspaceRoot = "",
    [double]$MinHealthScore = 100.0,
    [ValidateSet("manual", "daily", "pre_shutdown", "startup")][string]$Mode = "manual",
    [switch]$OpenStatusFile,
    [switch]$HideUi,
    [switch]$DisableAutoRepair
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\system-guard.ps1.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\system-guard.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "system-guard wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
