param(
    [string]$WorkspaceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AgencyRoot {
    param([string]$InputRoot)
    if ($InputRoot -and (Test-Path -LiteralPath $InputRoot)) {
        return (Resolve-Path -LiteralPath $InputRoot).Path
    }
    # Monorepo: scripts/ lives next to agency-os/; default folder must be agency-os (not repo root).
    $monorepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    $agencyNested = Join-Path $monorepoRoot "agency-os"
    $sopProbe = Join-Path $agencyNested "tenants\NEW_TENANT_ONBOARDING_SOP.md"
    if (Test-Path -LiteralPath $sopProbe) {
        return $agencyNested
    }
    return $monorepoRoot
}

function Assert-PathExists {
    param([string]$PathValue, [string]$Label)
    if (-not (Test-Path -LiteralPath $PathValue)) {
        throw ("Missing required {0}: {1}" -f $Label, $PathValue)
    }
}

$agencyRoot = Resolve-AgencyRoot -InputRoot $WorkspaceRoot
$workRoot = Split-Path -Parent $agencyRoot
$lobsterRoot = Join-Path $workRoot "lobster-factory"

Assert-PathExists -PathValue (Join-Path $agencyRoot "tenants\NEW_TENANT_ONBOARDING_SOP.md") -Label "onboarding SOP"
Assert-PathExists -PathValue (Join-Path $agencyRoot "docs\operations\ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md") -Label "onboarding/A10-2 traceability spec"
Assert-PathExists -PathValue (Join-Path $lobsterRoot "docs\e2e\OPERABLE_E2E_PLAYBOOK.md") -Label "A10-2 playbook"
Assert-PathExists -PathValue (Join-Path $lobsterRoot "scripts\validate-artifacts-governance.mjs") -Label "A9 governance validator"

Push-Location $lobsterRoot
try {
    Write-Host "Running Lobster bootstrap validate..." -ForegroundColor Cyan
    node ".\scripts\bootstrap-validate.mjs"
    if ($LASTEXITCODE -ne 0) { throw "bootstrap-validate failed with exit code $LASTEXITCODE" }

    Write-Host "Running artifacts governance validate..." -ForegroundColor Cyan
    node ".\scripts\validate-artifacts-governance.mjs"
    if ($LASTEXITCODE -ne 0) { throw "validate-artifacts-governance failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

Write-Host "Onboarding/A10-2 preflight PASSED" -ForegroundColor Green
Write-Host ("agencyRoot={0}" -f $agencyRoot)
Write-Host ("lobsterRoot={0}" -f $lobsterRoot)
