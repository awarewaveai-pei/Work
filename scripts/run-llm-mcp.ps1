param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("openai", "anthropic", "gemini", "xai")]
    [string]$Provider
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $repoRoot "mcp-local-wrappers\llm-mcp.mjs"
if (-not (Test-Path -LiteralPath $wrapper)) {
    throw "LLM MCP wrapper not found: $wrapper (expected monorepo root next to scripts/)"
}

& node $wrapper $Provider
exit $LASTEXITCODE
