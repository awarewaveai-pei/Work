param(
    [string]$WorkRoot = "",
    [switch]$SkipVerify,
    [switch]$SkipStrictEnvironmentAudit,
    [switch]$AllowUnexpectedDirty,
    [switch]$AllowStashBeforePull,
    [switch]$AllowPendingStash,
    [switch]$SkipWorkflowsDeps,
    [switch]$SkipOpenTasksList,
    [switch]$FullMainlineParity,
    [string]$FullMainlineFeatureBranch = "fix/trigger-clickhouse-oom",
    [switch]$FullMainlinePushFeature,
    [bool]$FullMainlineMainOnly = $true,
    [switch]$FullMainlineFeature,
    [switch]$FullMainlineAllowStash,
    [switch]$FullMainlineRequireFeatureBranch
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
