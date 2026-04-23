param(
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner: canonical implementation lives in monorepo root scripts\system-health-check.ps1.
$ownerScript = Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\system-health-check.ps1")
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "system-health-check (agency-os wrapper): owner script missing at $ownerScript"
    exit 1
}

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
