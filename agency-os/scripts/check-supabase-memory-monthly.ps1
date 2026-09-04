param(
    [string]$AgencyOsRoot = "",
    [string]$SshHost = "145.239.195.47",
    [string]$SshUser = "ubuntu",
    [string]$PrivateKeyPath = "$env:USERPROFILE\.ssh\id_ed25519",
    [string]$ContainerName = "supabase-studio",
    [double]$WarnPercent = 85.0,
    [double]$FailPercent = 92.0,
    [switch]$FailOnThreshold,
    [switch]$FailOnError
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\check-supabase-memory-monthly.ps1.
# Defaults above mirror the owner (only explicitly bound params are forwarded, so they are documentation,
# not behaviour); 2026-09-04: were still the retired EU host 204.168.175.41 after the 2026-08-31 consolidation.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\check-supabase-memory-monthly.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "check-supabase-memory-monthly wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
