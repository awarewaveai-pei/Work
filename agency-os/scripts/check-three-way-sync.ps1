param(
    [string]$WorkRoot = "",
    [switch]$SkipVerify,
    [switch]$StrictDirty,
    [switch]$AutoFix,
    [switch]$AllowUnexpectedDirty,
    [switch]$AllowStashBeforePull,
    [switch]$AllowAutoStashUnexpected,
    [switch]$AllowPendingStash
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$owner = Join-Path $repoRoot "scripts\check-three-way-sync.ps1"
if (-not (Test-Path -LiteralPath $owner)) {
    Write-Error "check-three-way-sync wrapper: owner missing at $owner"
    exit 1
}

$bp = @{}
foreach ($k in $PSBoundParameters.Keys) {
    $bp[$k] = $PSBoundParameters[$k]
}
if (-not $bp.ContainsKey('WorkRoot') -or [string]::IsNullOrWhiteSpace([string]$bp['WorkRoot'])) {
    $bp['WorkRoot'] = $repoRoot
} else {
    $bp['WorkRoot'] = (Resolve-Path $bp['WorkRoot']).Path
}

& $owner @bp
exit $LASTEXITCODE
