param(
    [string]$AgencyOsRoot = "",
    [string]$SshHost = "204.168.175.41",
    [string]$SshUser = "root",
    [string]$PrivateKeyPath = "$env:USERPROFILE\.ssh\hetzner_trigger",
    [string]$ContainerName = "supabase-studio",
    [double]$WarnPercent = 85.0,
    [double]$FailPercent = 92.0,
    [switch]$FailOnThreshold,
    [switch]$FailOnError
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\check-supabase-memory-monthly.ps1.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\check-supabase-memory-monthly.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "check-supabase-memory-monthly wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
