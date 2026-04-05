param(
    [string]$ProjectRef = "proj_rqykzzwujizcxdzgnedn",
    [string]$TokenName = "TRIGGER_ACCESS_TOKEN"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$vaultScript = "D:\Work\scripts\secrets-vault.ps1"
if (-not (Test-Path -LiteralPath $vaultScript)) {
    throw "Missing secrets vault script: $vaultScript"
}

$command = "npx -y trigger.dev@latest mcp --project-ref `"$ProjectRef`""

& powershell -ExecutionPolicy Bypass -File $vaultScript `
    -Action run `
    -Names @($TokenName) `
    -Command $command

exit $LASTEXITCODE
