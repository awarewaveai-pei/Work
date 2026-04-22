<#
.SYNOPSIS
  Writes gitignored agent bootstrap prompt files under agency-os/.agency-state.

.DESCRIPTION
  Idempotent. Safe to run before gates or MCP sync; does not touch secrets or tracked files.
  Used by apply-shared-ai-governance, verify-shared-ai-governance (auto-heal), and bootstrap-mcp-machine.
#>
param(
    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkRoot)) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )
    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $encoding = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

$stateDir = Join-Path $WorkRoot "agency-os\.agency-state"
$promptPackPath = Join-Path $stateDir "agent-bootstrap-prompts.md"
$quickPromptPath = Join-Path $stateDir "agent-bootstrap-prompt.txt"

$generatedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$promptPack = @(
    '# Agent Bootstrap Prompts (Generated)',
    '',
    "Generated: $generatedAt",
    '',
    '## Purpose',
    '',
    'Use this prompt pack for non-Cursor agents (Codex, Claude side sessions, Copilot CLI, Gemini CLI, Perplexity workflows) so they follow the same repo rules.',
    '',
    '## Core policy references (single source of truth)',
    '',
    '- `agency-os/docs/operations/collaborator-ai-agent-rules.md`',
    '- `mcp/registry.template.json`',
    '- `scripts/sync-mcp-config.ps1`',
    '- `agency-os/docs/operations/mcp-add-server-quickstart.md`',
    '',
    '## Universal startup prompt (paste as first message/system prompt)',
    '',
    '```text',
    'You are a collaborator agent for this repository (not the closer unless explicitly assigned by the user).',
    '',
    'Rules you must follow:',
    '1) Canonical collaboration policy: agency-os/docs/operations/collaborator-ai-agent-rules.md',
    '2) MCP source of truth: mcp/registry.template.json + scripts/sync-mcp-config.ps1',
    '3) Never write plaintext keys/tokens/passwords into tracked files, WORKLOG, memory, or chat.',
    '4) After each deliverable chunk, append a block to agency-os/.agency-state/closeout-inbox.md',
    '5) Do not run scripts/ao-close.ps1 unless explicitly assigned as closer.',
    '6) Do not push main/master and never force-push.',
    '',
    'If there is any conflict, follow the canonical files above and do not invent a second process.',
    '```',
    '',
    '## Perplexity / llm plugin note',
    '',
    'Perplexity CLI (`llm + plugin`) does not read Cursor rules.',
    'It follows repo policy only when you paste the startup prompt and ensure `PERPLEXITY_API_KEY` is loaded.',
    ''
) -join [Environment]::NewLine

Write-Utf8NoBom -Path $promptPackPath -Content $promptPack

$quickPrompt = @(
    'You are a collaborator agent for this repo (not the closer unless explicitly assigned).',
    'Follow collaborator-ai-agent-rules.md and use mcp/registry.template.json + scripts/sync-mcp-config.ps1 as MCP source of truth.',
    'Never leak secrets, append progress blocks to agency-os/.agency-state/closeout-inbox.md, do not run scripts/ao-close.ps1, and never push main/master or force-push.'
) -join [Environment]::NewLine
Write-Utf8NoBom -Path $quickPromptPath -Content $quickPrompt

Write-Host "Agent bootstrap prompts ensured:" -ForegroundColor Gray
Write-Host "  $promptPackPath" -ForegroundColor Gray
Write-Host "  $quickPromptPath" -ForegroundColor Gray

exit 0
