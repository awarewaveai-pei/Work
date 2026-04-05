param(
    [string]$WorkRoot = "",
    [switch]$SkipVerify,
    [switch]$AllowUnexpectedDirty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\ao-resume.ps1.
$ownerScript = Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\ao-resume.ps1")
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "ao-resume wrapper: owner script missing at $ownerScript"
    exit 1
}

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
