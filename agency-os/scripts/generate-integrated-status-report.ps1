param(
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\generate-integrated-status-report.ps1.
$ownerScript = Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\generate-integrated-status-report.ps1")
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "generate-integrated-status-report wrapper: owner script missing at $ownerScript"
    exit 1
}

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
