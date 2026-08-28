param(
    [ValidateSet("init", "set", "set-prompt", "get", "list", "remove", "run", "import-mcp", "import-user-env", "sync-copilot-mcp-env", "sync-mcp-user-env", "sync-cursor-mcp-user-env")]
    [string]$Action = "list",
    [string]$Name = "",
    [string]$Value = "",
    [string]$Note = "",
    [string[]]$Names = @(),
    [string]$Command = "",
    [string]$StorePath = "",
    [string]$McpPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Single-owner design: real implementation lives in monorepo root scripts\secrets-vault.ps1.
$ownerScript = Join-Path $PSScriptRoot "..\..\scripts\secrets-vault.ps1"
if (-not (Test-Path -LiteralPath $ownerScript)) {
    Write-Error "secrets-vault wrapper: owner script missing at $ownerScript"
    exit 1
}
$ownerScript = (Resolve-Path -LiteralPath $ownerScript).Path

& $ownerScript @PSBoundParameters
exit $LASTEXITCODE
