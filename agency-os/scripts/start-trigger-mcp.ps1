param(
    [string]$ProjectRef = "",
    [string]$TokenName = "TRIGGER_ACCESS_TOKEN"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    $ProjectRef = $env:TRIGGER_PROJECT_REF
}
if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    throw "Missing Trigger project ref: pass -ProjectRef to start-trigger-mcp.ps1 or set environment variable TRIGGER_PROJECT_REF."
}

$vaultScript = Join-Path $PSScriptRoot "secrets-vault.ps1"
if (-not (Test-Path -LiteralPath $vaultScript)) {
    throw "Missing secrets vault script: $vaultScript"
}

$command = "npx -y trigger.dev@latest mcp --project-ref `"$ProjectRef`""

& powershell -ExecutionPolicy Bypass -File $vaultScript `
    -Action run `
    -Names @($TokenName) `
    -Command $command

exit $LASTEXITCODE
