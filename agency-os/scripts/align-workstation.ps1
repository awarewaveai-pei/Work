param(
    [string]$WorkRoot = "",
    [switch]$AllowUnexpectedDirty,
    [switch]$AllowStashBeforePull,
    [switch]$AllowPendingStash,
    [switch]$SkipWorkflowsDeps,
    [switch]$SkipOpenTasksList
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ownerScript = Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\align-workstation.ps1")
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "align-workstation wrapper: owner missing at $ownerScript"
    exit 1
}

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
