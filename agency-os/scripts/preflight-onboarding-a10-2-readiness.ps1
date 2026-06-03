param(
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\preflight-onboarding-a10-2-readiness.ps1.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\preflight-onboarding-a10-2-readiness.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "preflight-onboarding-a10-2-readiness wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
