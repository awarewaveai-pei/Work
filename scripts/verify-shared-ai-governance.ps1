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
    $ensurePrompts = Join-Path $WorkRoot "scripts\ensure-agent-bootstrap-prompts.ps1"
    if (-not (Test-Path -LiteralPath $ensurePrompts)) {
        Write-Error "CRITICAL: Agent bootstrap prompts missing and ensure script not found at $ensurePrompts"
        exit 1
    }
    Write-Host "  [INFO] Agent bootstrap prompts missing; writing defaults (gitignored)..." -ForegroundColor Yellow
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ensurePrompts -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "CRITICAL: ensure-agent-bootstrap-prompts.ps1 failed (exit $LASTEXITCODE)."
        exit $LASTEXITCODE
    }
}
if (-not (Test-Path -LiteralPath $promptPackPath) -or -not (Test-Path -LiteralPath $quickPromptPath)) {
    Write-Error "CRITICAL: Agent bootstrap prompts still missing after ensure step."
    exit 1
}
Write-Host "  [OK] Agent bootstrap prompts found." -ForegroundColor Gray

# 4. Check for un-synced changes (Registry vs .mcp.json)
function Read-JsonFileOrFail {
    param(
        [Parameter(Mandatory = $true)][string]$LiteralPath,
        [Parameter(Mandatory = $true)][string]$Label
    )
    try {
        $raw = Get-Content -LiteralPath $LiteralPath -Raw -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($raw)) {
            Write-Error "CRITICAL: $Label is empty: $LiteralPath"
            exit 1
        }
        return ($raw | ConvertFrom-Json -ErrorAction Stop)
    } catch {
        Write-Error "CRITICAL: Invalid JSON in $Label at $LiteralPath : $($_.Exception.Message)"
        exit 1
    }
}

function Get-ServerNamesFromObjectOrFail {
    param(
        [Parameter(Mandatory = $true)]$Root,
        [Parameter(Mandatory = $true)][string]$PropertyName,
        [Parameter(Mandatory = $true)][string]$FileLabel,
        [Parameter(Mandatory = $true)][string]$LiteralPath
    )
    $bag = $Root.$PropertyName
    if ($null -eq $bag) {
        Write-Error "CRITICAL: $FileLabel missing top-level JSON property '$PropertyName' (null). Path: $LiteralPath"
        exit 1
    }
    if ($bag -isnot [System.Management.Automation.PSCustomObject]) {
        Write-Error "CRITICAL: $FileLabel property '$PropertyName' must be a JSON object. Path: $LiteralPath"
        exit 1
    }
    $names = @($bag.PSObject.Properties | ForEach-Object { $_.Name } | Where-Object { $_ -ne $null -and $_ -ne '' })
    return @($names | Sort-Object -Unique)
}

$registryJson = Read-JsonFileOrFail -LiteralPath $registryPath -Label "MCP registry template"
$mcpJson = Read-JsonFileOrFail -LiteralPath $currentMcpPath -Label "workspace .mcp.json"

$registryServers = @(Get-ServerNamesFromObjectOrFail -Root $registryJson -PropertyName "servers" -FileLabel "registry.template.json" -LiteralPath $registryPath)
$mcpServers = @(Get-ServerNamesFromObjectOrFail -Root $mcpJson -PropertyName "mcpServers" -FileLabel ".mcp.json" -LiteralPath $currentMcpPath)

$diff = Compare-Object -ReferenceObject $registryServers -DifferenceObject $mcpServers
if ($null -ne $diff) {
    $diffText = ($diff | ForEach-Object { $_.InputObject.ToString() + ' (' + $_.SideIndicator + ')' }) -join ', '
    Write-Error "CRITICAL: .mcp.json servers do not match registry template! Discrepancy: $diffText"
    Write-Error "Run 'npm run mcp:governance' to synchronize."
    exit 1
}
Write-Host "  [OK] .mcp.json server list matches registry template." -ForegroundColor Gray

Write-Host "Shared AI Governance verification passed." -ForegroundColor Green
exit 0
