<#
.SYNOPSIS
  Repair common user-level Codex MCP config issues on Windows.

.DESCRIPTION
  Updates %USERPROFILE%\.codex\config.toml to align with the current workspace:
  - replace stale D:\Work paths with the actual workspace root
  - fix work-global filesystem roots
  - add the required "run" subcommand for the Cloudflare stdio server
  - replace the archived PostHog npm package with the official remote MCP URL
  - normalize the Copilot MCP URL
  - switch Supabase hosted MCP to OAuth login instead of bearer env auth

  This script is intentionally conservative and string-based so it can repair
  an existing file without reformatting unrelated sections.
#>
param(
    [string]$WorkspaceRoot = "",
    [string]$UserConfigPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
if ([string]::IsNullOrWhiteSpace($UserConfigPath)) {
    $UserConfigPath = Join-Path $env:USERPROFILE ".codex\config.toml"
}
if (-not (Test-Path -LiteralPath $UserConfigPath)) {
    throw "User Codex config not found: $UserConfigPath"
}

function Escape-TomlBasicString([string]$value) {
    return $value.Replace('\', '\\')
}

$workspaceEsc = Escape-TomlBasicString $WorkspaceRoot.TrimEnd('\')
$homeEsc = Escape-TomlBasicString $env:USERPROFILE.TrimEnd('\')
$triggerScriptEsc = Escape-TomlBasicString (Join-Path $WorkspaceRoot "scripts\start-trigger-mcp.ps1")

$content = Get-Content -LiteralPath $UserConfigPath -Raw -Encoding UTF8

# Replace stale workstation-specific paths.
$content = $content.Replace("D:\\Work\\scripts\\start-trigger-mcp.ps1", $triggerScriptEsc)
$content = $content.Replace("D:\\Work", $workspaceEsc)
$content = $content.Replace("D:\Work", $WorkspaceRoot.TrimEnd('\'))

# Normalize work-global filesystem roots for the current machine.
$content = [regex]::Replace(
    $content,
    '(?ms)\[mcp_servers\.work-global\]\s*command = "cmd"\s*args = \[[^\]]*\]',
    "[mcp_servers.work-global]`r`ncommand = `"cmd`"`r`nargs = [`"/c`", `"npx`", `"-y`", `"@modelcontextprotocol/server-filesystem`", `"$homeEsc`", `"$workspaceEsc`"]"
)

# The Cloudflare package expects an explicit subcommand.
$content = $content.Replace(
    'args = ["-y", "@cloudflare/mcp-server-cloudflare"]',
    'args = ["-y", "@cloudflare/mcp-server-cloudflare", "run"]'
)

# The old npm package is archived/removed; use the official remote MCP endpoint instead.
$content = [regex]::Replace(
    $content,
    '(?ms)\[mcp_servers\.posthog\]\s*command = "npx"\s*args = \[[^\]]*\]\s*env = \{ POSTHOG_API_KEY = "([^"]+)", POSTHOG_HOST = "([^"]+)" \}',
    "[mcp_servers.posthog]`r`nurl = `"https://mcp.posthog.com/mcp`"`r`nbearer_token_env_var = `"POSTHOG_API_KEY`"`r`nenabled = false"
)

# Copilot currently redirects cleanly without the trailing slash.
$content = $content.Replace(
    'url = "https://api.githubcopilot.com/mcp/"',
    'url = "https://api.githubcopilot.com/mcp"'
)

# Supabase hosted MCP uses OAuth login in Codex; a service-role JWT in
# bearer_token_env_var returns non-MCP error bodies during initialize.
$content = [regex]::Replace(
    $content,
    '(?ms)\[mcp_servers\.supabase\]\s*url = "([^"]+)"\s*bearer_token_env_var = "SUPABASE_AUTH_BEARER_TOKEN"(?:\s*enabled = (true|false))?',
    {
        param($match)
        $url = $match.Groups[1].Value
        $enabled = $match.Groups[2].Value
        if ([string]::IsNullOrWhiteSpace($enabled)) {
            "[mcp_servers.supabase]`r`nurl = `"$url`""
        } else {
            "[mcp_servers.supabase]`r`nurl = `"$url`"`r`nenabled = $enabled"
        }
    }
)

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($UserConfigPath, $content, $utf8NoBom)

Write-Host "Patched Codex MCP config: $UserConfigPath" -ForegroundColor Green
Write-Host "  workspace -> $WorkspaceRoot" -ForegroundColor Gray
Write-Host "  userHome  -> $env:USERPROFILE" -ForegroundColor Gray
Write-Host "PostHog was converted to the official remote endpoint but left disabled." -ForegroundColor Yellow
Write-Host "Enable it after exporting POSTHOG_API_KEY in your shell or machine environment." -ForegroundColor Yellow
