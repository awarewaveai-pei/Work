param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string[]]$Targets,
    [switch]$SkipTargetExistCheck,
    [string]$WorkspaceRoot = "",
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\register-new-governance-doc.ps1.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\register-new-governance-doc.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "register-new-governance-doc wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
