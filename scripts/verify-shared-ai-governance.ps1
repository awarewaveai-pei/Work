param(
    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
}

Write-Host "== Shared AI Governance: Checking SSOT Consistency ==" -ForegroundColor Cyan

# 1. Check if canonical rules exist and aren't duplicated
$rulesPath = Join-Path $WorkRoot "agency-os\docs\operations\collaborator-ai-agent-rules.md"
if (-not (Test-Path -LiteralPath $rulesPath)) {
    Write-Error "CRITICAL: Canonical rules file missing at $rulesPath"
    exit 1
}

# Check for "forked" rules (e.g., someone copied them elsewhere in the repo)
$allRules = Get-ChildItem -Path $WorkRoot -Filter "*collaborator-ai-agent-rules.md" -Recurse | Where-Object { $_.FullName -ne $rulesPath -and $_.FullName -notmatch "node_modules" }
if ($null -ne $allRules) {
    Write-Error "CRITICAL: Detected forked/duplicated collaboration rules at:"
    foreach ($r in $allRules) { Write-Error "  - $($r.FullName)" }
    Write-Error "There should be only ONE version of truth at $rulesPath."
    exit 1
}
Write-Host "  [OK] Canonical rules found and unique." -ForegroundColor Gray

# 2. Check if MCP registry template exists
$registryPath = Join-Path $WorkRoot "mcp\registry.template.json"
if (-not (Test-Path -LiteralPath $registryPath)) {
    Write-Error "CRITICAL: MCP registry template missing at $registryPath"
    exit 1
}
Write-Host "  [OK] MCP registry template found." -ForegroundColor Gray

# 3. Verify .mcp.json consistency (Dry-run by syncing to temp)
$tempMcp = Join-Path $env:TEMP "gemini_verify_mcp_$(Get-Random).json"
$syncScript = Join-Path $WorkRoot "scripts\sync-mcp-config.ps1"

Write-Host "  Verifying .mcp.json consistency..." -ForegroundColor Gray
# We use a custom sync call that only targets the workspace file and outputs to temp
# Note: sync-mcp-config.ps1 writes to fixed paths, so we might need a temporary WorkspaceRoot or modify the script.
# For now, let's check if the generated .mcp.json matches the registry template in structure.

$currentMcpPath = Join-Path $WorkRoot ".mcp.json"
if (-not (Test-Path -LiteralPath $currentMcpPath)) {
    Write-Error "CRITICAL: .mcp.json missing from root. Run 'npm run mcp:governance' to fix."
    exit 1
}

# Instead of full re-generation (which is complex due to environment resolution), 
# we check if the file was recently updated or if it's "dirty" compared to what sync-mcp-config would do.
# A simpler way: Check if the bootstrap prompts are missing or out of sync.

$promptPackPath = Join-Path $WorkRoot "agency-os\.agency-state\agent-bootstrap-prompts.md"
$quickPromptPath = Join-Path $WorkRoot "agency-os\.agency-state\agent-bootstrap-prompt.txt"

if (-not (Test-Path -LiteralPath $promptPackPath) -or -not (Test-Path -LiteralPath $quickPromptPath)) {
    Write-Error "CRITICAL: Agent bootstrap prompts missing. Run 'npm run mcp:governance' to fix."
    exit 1
}
Write-Host "  [OK] Agent bootstrap prompts found." -ForegroundColor Gray

# 4. Check for un-synced changes (Registry vs .mcp.json)
# We look at write times as a heuristic, or we can do a deep check of server keys.
$registryJson = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
$mcpJson = Get-Content -LiteralPath $currentMcpPath -Raw | ConvertFrom-Json

$registryServers = $registryJson.servers.PSObject.Properties.Name | Sort-Object
$mcpServers = $mcpJson.mcpServers.PSObject.Properties.Name | Sort-Object

$diff = Compare-Object $registryServers $mcpServers
if ($null -ne $diff) {
    Write-Error "CRITICAL: .mcp.json servers do not match registry template! Discrepancy: $($diff | ForEach-Object { $_.InputObject + ' (' + $_.SideIndicator + ')' } -join ', ')"
    Write-Error "Run 'npm run mcp:governance' to synchronize."
    exit 1
}
Write-Host "  [OK] .mcp.json server list matches registry template." -ForegroundColor Gray

Write-Host "Shared AI Governance verification passed." -ForegroundColor Green
exit 0
