# Seeds agency-os/.agency-state/closeout-inbox.md from the tracked template when missing.
# Run from monorepo root: powershell -ExecutionPolicy Bypass -File .\scripts\init-closeout-inbox.ps1

param(
    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

$stateDir = Join-Path $WorkRoot "agency-os\.agency-state"
$inbox = Join-Path $stateDir "closeout-inbox.md"
$template = Join-Path $WorkRoot "agency-os\docs\operations\closeout-inbox-TEMPLATE.md"

if (-not (Test-Path -LiteralPath (Join-Path $WorkRoot "agency-os"))) {
    Write-Error "init-closeout-inbox: expected agency-os under WorkRoot=$WorkRoot"
    exit 1
}

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

if (Test-Path -LiteralPath $inbox) {
    Write-Host "init-closeout-inbox: already exists: $inbox" -ForegroundColor DarkGreen
    exit 0
}

if (Test-Path -LiteralPath $template) {
    Copy-Item -LiteralPath $template -Destination $inbox -Force
    Write-Host "init-closeout-inbox: created from template: $inbox" -ForegroundColor Green
} else {
    $stub = @"
# Closeout inbox

Append-only blocks for handoff. See agency-os/docs/operations/collaborator-ai-agent-rules.md

"@
    Set-Content -LiteralPath $inbox -Value $stub -Encoding UTF8
    Write-Host "init-closeout-inbox: template missing; created stub: $inbox" -ForegroundColor Yellow
}

exit 0
