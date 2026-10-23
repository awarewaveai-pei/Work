param(
    [string]$ProjectRef = "",
    # The MCP (trigger.dev CLI) needs a Personal Access Token (tr_pat_*); TRIGGER_ACCESS_TOKEN in the vault is the
    # SDK runtime token (tr_prod_*), which the CLI refuses with NotAccessTokenError (AGENTS.md §0: not interchangeable).
    [string]$TokenName = "TRIGGER_DEPLOY_PAT"
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

# Self-hosted: set TRIGGER_API_URL (e.g. https://trigger.example.com) on this MCP server env or machine env.
# Nested `powershell -File secrets-vault.ps1` may not inherit all vars on some hosts — prefix the inner command.
$prefix = ""
if (-not [string]::IsNullOrWhiteSpace($env:TRIGGER_API_URL)) {
    $u = $env:TRIGGER_API_URL.Replace("'", "''")
    $prefix = "`$env:TRIGGER_API_URL='$u'; "
}
$command = $prefix + "`$env:TRIGGER_ACCESS_TOKEN=`$env:$TokenName; npx -y trigger.dev@latest mcp --project-ref `"$ProjectRef`""

# Resolve powershell.exe by absolute path: when launched as an MCP server the child
# process PATH may omit System32\WindowsPowerShell, so a bare `powershell` token raises
# CommandNotFoundException (root cause of 2026-06-15 "Could not attach to MCP server trigger").
$psExe = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $psExe)) {
    # pwsh 7 host: $PSHOME holds pwsh.exe, not powershell.exe. Fall back to the
    # well-known absolute Windows PowerShell 5.1 path before the PATH-dependent bare token.
    $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (-not (Test-Path -LiteralPath $psExe)) { $psExe = 'powershell' }
}

& $psExe -ExecutionPolicy Bypass -File $vaultScript `
    -Action run `
    -Names @($TokenName) `
    -Command $command

exit $LASTEXITCODE
