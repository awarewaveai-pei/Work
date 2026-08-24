<#
.SYNOPSIS
  Generate portable MCP client configs from one repo-managed registry.

.DESCRIPTION
  Reads `mcp/registry.template.json`, resolves machine-specific paths, and
  syncs the result into:

  - .mcp.json at the repo root
  - .cursor\mcp.json (Cursor project MCP; same server set as root `.mcp.json`)
  - %USERPROFILE%\.codex\config.toml (managed MCP block only)
  - %USERPROFILE%\.copilot\mcp-config.json
  - %USERPROFILE%\.gemini\settings.json

  The registry contains no secrets. Secrets are read from machine-level
  environment variables at sync time.
#>
param(
    [string]$WorkspaceRoot = "",
    [string]$RegistryPath = "",
    [switch]$IncludeDisabled,
    [switch]$StrictEnv,
    [switch]$SkipWorkspaceConfig,
    [switch]$SkipCodex,
    [switch]$SkipCopilot,
    [switch]$SkipGemini
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}
if ([string]::IsNullOrWhiteSpace($RegistryPath)) {
    $RegistryPath = Join-Path $WorkspaceRoot "mcp\registry.template.json"
}
if (-not (Test-Path -LiteralPath $RegistryPath)) {
    throw "Registry file not found: $RegistryPath"
}

$script:MissingVars = New-Object System.Collections.Generic.HashSet[string]
$script:Warnings = New-Object System.Collections.Generic.List[string]

$script:EnvAliases = @{
    "SUPABASE_AWAREWAVE_URL" = @("SUPABASE_B_URL")
    "SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY" = @("SUPABASE_B_SERVICE_ROLE_KEY")
    "SUPABASE_AWAREWAVE_POSTGRES_DSN" = @("SUPABASE_B_POSTGRES_DSN", "SUPABASE_POSTGRES_MCP_DSN")
    "SUPABASE_SOULFULEXPRESSION_URL" = @("SUPABASE_A_URL")
    "SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY" = @("SUPABASE_A_SERVICE_ROLE_KEY")
}

function Get-EnvironmentValueWithAliases {
    param([string]$Name)

    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, "User")
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, "Machine")
    }
    if (-not [string]::IsNullOrWhiteSpace($value) -and $value -notmatch '^\s*<PASTE_[A-Z0-9_]+>\s*$') {
        return $value
    }

    if ($script:EnvAliases.ContainsKey($Name)) {
        foreach ($alias in $script:EnvAliases[$Name]) {
            $aliasValue = [Environment]::GetEnvironmentVariable($alias, "Process")
            if ([string]::IsNullOrWhiteSpace($aliasValue)) {
                $aliasValue = [Environment]::GetEnvironmentVariable($alias, "User")
            }
            if ([string]::IsNullOrWhiteSpace($aliasValue)) {
                $aliasValue = [Environment]::GetEnvironmentVariable($alias, "Machine")
            }
            if (-not [string]::IsNullOrWhiteSpace($aliasValue) -and $aliasValue -notmatch '^\s*<PASTE_[A-Z0-9_]+>\s*$') {
                $script:Warnings.Add("Resolved $Name from legacy env var $alias on this machine.")
                return $aliasValue
            }
        }
    }

    return ""
}

function ConvertTo-PlainObject {
    param([Parameter(ValueFromPipeline = $true)]$InputObject)

    if ($null -eq $InputObject) {
        return $null
    }

    if ($InputObject -is [string] -or $InputObject -is [int] -or $InputObject -is [long] -or $InputObject -is [double] -or $InputObject -is [decimal] -or $InputObject -is [bool]) {
        return $InputObject
    }

    if ($InputObject -is [System.Collections.IDictionary]) {
        $map = @{}
        foreach ($key in $InputObject.Keys) {
            $map[$key] = ConvertTo-PlainObject $InputObject[$key]
        }
        return $map
    }

    if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
        $items = @()
        foreach ($item in $InputObject) {
            $items += ,(ConvertTo-PlainObject $item)
        }
        return $items
    }

    # PSCustomObject is handled explicitly (not via the generic property walk below) so that an
    # EMPTY JSON object still comes back as @{}. The property walk only builds a map when there is
    # at least one property, so `{}` used to fall through and return the raw PSCustomObject --
    # which has no .Keys/.ContainsKey, breaking every caller that treats the result as a map.
    # Found 2026-08-25 by feeding `{"mcpServers":{}}` (the sanitized state of a user-level Cursor
    # config) to the duplicate-server detector below.
    if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
        $map = @{}
        foreach ($prop in @($InputObject.PSObject.Properties)) {
            $map[$prop.Name] = ConvertTo-PlainObject $prop.Value
        }
        return $map
    }

    $props = @($InputObject.PSObject.Properties)
    if ($props.Length -gt 0) {
        $map = @{}
        foreach ($prop in $props) {
            $map[$prop.Name] = ConvertTo-PlainObject $prop.Value
        }
        return $map
    }

    return $InputObject
}

function New-JsonDirectory {
    param([string]$Path)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

function Write-Utf8NoBomFile {
    param(
        [string]$Path,
        [string]$Content
    )

    New-JsonDirectory -Path $Path
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Resolve-EnvValue {
    param(
        [string]$StringValue,
        [ValidateSet("Concrete", "JsonPlaceholder", "ClaudeProjectPlaceholder", "GeminiPlaceholder")]
        [string]$Mode
    )

    if ($null -eq $StringValue) {
        return $null
    }

    if ($Mode -eq "JsonPlaceholder") {
        # Cursor `.cursor/mcp.json`: keep portable `${workspaceFolder}` / `${userHome}`; env must stay `${env:NAME}` per Cursor docs.
        $resolved = $StringValue.Replace('${workspaceRoot}', '${workspaceFolder}').Replace('${workspaceFolder}', '${workspaceFolder}').Replace('${userHome}', '${userHome}')
    } elseif ($Mode -eq "ClaudeProjectPlaceholder") {
        # Claude Code `.mcp.json`: use `${env:MONOREPO_ROOT}` so Claude resolves it from the environment; env stays `${env:NAME}`.
        $resolved = $StringValue.Replace('${workspaceRoot}', '${env:MONOREPO_ROOT}').Replace('${workspaceFolder}', '${env:MONOREPO_ROOT}').Replace('${userHome}', '${userHome}')
    } else {
        $resolved = $StringValue.Replace('${workspaceRoot}', $WorkspaceRoot).Replace('${workspaceFolder}', $WorkspaceRoot).Replace('${userHome}', $env:USERPROFILE)
    }
    $pattern = '\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}'
    return [regex]::Replace(
        $resolved,
        $pattern,
        {
            param($match)
            $name = $match.Groups[1].Value
            switch ($Mode) {
                "Concrete" {
                    $value = Get-EnvironmentValueWithAliases -Name $name
                    if ([string]::IsNullOrWhiteSpace($value)) {
                        $null = $script:MissingVars.Add($name)
                        return ""
                    }
                    return $value
                }
                "JsonPlaceholder" {
                    return '${env:' + $name + '}'
                }
                "ClaudeProjectPlaceholder" {
                    return '${env:' + $name + '}'
                }
                "GeminiPlaceholder" {
                    return '${' + $name + '}'
                }
            }
            return $match.Value
        }
    )
}

function Resolve-MapValues {
    param(
        [hashtable]$Map,
        [string]$Mode
    )

    $result = @{}
    foreach ($key in $Map.Keys) {
        $result[$key] = Resolve-EnvValue -StringValue ([string]$Map[$key]) -Mode $Mode
    }
    return $result
}

function Get-OptionalEnvKeys {
    param([hashtable]$Server)

    if (-not $Server.ContainsKey("optional_env")) {
        return @()
    }

    return @($Server["optional_env"] | ForEach-Object { [string]$_ })
}

function Remove-EmptyOptionalEnv {
    param(
        [hashtable]$Map,
        [string[]]$OptionalKeys
    )

    $result = @{}
    foreach ($key in $Map.Keys) {
        $isOptional = $OptionalKeys -contains $key
        $value = [string]$Map[$key]
        if ($isOptional -and [string]::IsNullOrWhiteSpace($value)) {
            continue
        }
        $result[$key] = $Map[$key]
    }
    return $result
}

function Should-IncludeServer {
    param(
        [string]$Name,
        [hashtable]$Server,
        [string]$Client
    )

    if (-not $IncludeDisabled -and $Server.ContainsKey("enabled") -and -not [bool]$Server["enabled"]) {
        return $false
    }

    if ($Server.ContainsKey("clients")) {
        $clientConfig = ConvertTo-PlainObject $Server["clients"]
        if ($clientConfig.ContainsKey($Client)) {
            $settings = ConvertTo-PlainObject $clientConfig[$Client]
            if ($settings.ContainsKey("exclude") -and [bool]$settings["exclude"]) {
                return $false
            }
        }
    }

    return $true
}

function Test-ResolvedMap {
    param(
        [string]$ServerName,
        [hashtable]$Map,
        [string]$Kind,
        [string[]]$OptionalKeys = @()
    )

    foreach ($key in $Map.Keys) {
        if ($OptionalKeys -contains $key) {
            continue
        }
        if ([string]::IsNullOrWhiteSpace([string]$Map[$key])) {
            $script:Warnings.Add("Skip $ServerName for $Kind because '$key' resolved to an empty value.")
            return $false
        }
    }
    return $true
}

function Convert-ServerToWorkspaceConfig {
    param([string]$Name, [hashtable]$Server)

    if (-not (Should-IncludeServer -Name $Name -Server $Server -Client "workspace")) {
        return $null
    }

    $out = @{}
    $transport = [string]$Server["transport"]
    if ($transport -eq "http") {
        $out["type"] = "http"
        $out["url"] = Resolve-EnvValue -StringValue ([string]$Server["url"]) -Mode "JsonPlaceholder"
        if ($Server.ContainsKey("headers")) {
            $out["headers"] = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["headers"]) -Mode "JsonPlaceholder"
        }
    } else {
        $out["command"] = Resolve-EnvValue -StringValue ([string]$Server["command"]) -Mode "JsonPlaceholder"
        $args = @()
        foreach ($arg in $Server["args"]) {
            $args += ,(Resolve-EnvValue -StringValue ([string]$arg) -Mode "JsonPlaceholder")
        }
        $out["args"] = $args
        if ($Server.ContainsKey("env")) {
            $out["env"] = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["env"]) -Mode "JsonPlaceholder"
        }
    }
    return $out
}

function Convert-ServerToClaudeProjectConfig {
    # Generates Claude Code project `.mcp.json` entries using ${env:MONOREPO_ROOT} for script paths.
    param([string]$Name, [hashtable]$Server)

    if (-not (Should-IncludeServer -Name $Name -Server $Server -Client "workspace")) {
        return $null
    }

    $out = @{}
    $transport = [string]$Server["transport"]
    if ($transport -eq "http") {
        $out["type"] = "http"
        $out["url"] = Resolve-EnvValue -StringValue ([string]$Server["url"]) -Mode "ClaudeProjectPlaceholder"
        if ($Server.ContainsKey("headers")) {
            $out["headers"] = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["headers"]) -Mode "ClaudeProjectPlaceholder"
        }
    } else {
        $out["command"] = Resolve-EnvValue -StringValue ([string]$Server["command"]) -Mode "ClaudeProjectPlaceholder"
        $args = @()
        foreach ($arg in $Server["args"]) {
            $args += ,(Resolve-EnvValue -StringValue ([string]$arg) -Mode "ClaudeProjectPlaceholder")
        }
        $out["args"] = $args
        if ($Server.ContainsKey("env")) {
            $out["env"] = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["env"]) -Mode "ClaudeProjectPlaceholder"
        }
    }
    return $out
}

function Convert-ServerToCopilotConfig {
    param([string]$Name, [hashtable]$Server)

    if (-not (Should-IncludeServer -Name $Name -Server $Server -Client "copilot")) {
        return $null
    }

    $out = @{}
    $transport = [string]$Server["transport"]
    if ($transport -eq "http") {
        $out["type"] = "http"
        $out["url"] = Resolve-EnvValue -StringValue ([string]$Server["url"]) -Mode "Concrete"
        if ([string]::IsNullOrWhiteSpace([string]$out["url"])) {
            $script:Warnings.Add("Skip $Name for Copilot because the URL resolved to an empty value.")
            return $null
        }
        if ($Server.ContainsKey("headers")) {
            $headers = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["headers"]) -Mode "Concrete"
            if (-not (Test-ResolvedMap -ServerName $Name -Map $headers -Kind "Copilot")) {
                return $null
            }
            $out["headers"] = $headers
        }
    } else {
        $out["type"] = "local"
        $out["command"] = Resolve-EnvValue -StringValue ([string]$Server["command"]) -Mode "Concrete"
        $args = @()
        foreach ($arg in $Server["args"]) {
            $args += ,(Resolve-EnvValue -StringValue ([string]$arg) -Mode "Concrete")
        }
        $out["args"] = $args
        if ($Server.ContainsKey("env")) {
            $optionalKeys = Get-OptionalEnvKeys -Server $Server
            $envMap = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["env"]) -Mode "Concrete"
            if (-not (Test-ResolvedMap -ServerName $Name -Map $envMap -Kind "Copilot" -OptionalKeys $optionalKeys)) {
                return $null
            }
            $out["env"] = Remove-EmptyOptionalEnv -Map $envMap -OptionalKeys $optionalKeys
        } else {
            $out["env"] = @{}
        }
    }
    $out["tools"] = @("*")
    return $out
}

function Convert-ServerToGeminiConfig {
    param([string]$Name, [hashtable]$Server)

    if (-not (Should-IncludeServer -Name $Name -Server $Server -Client "gemini")) {
        return $null
    }

    $out = @{}
    $transport = [string]$Server["transport"]
    if ($transport -eq "http") {
        $out["httpUrl"] = Resolve-EnvValue -StringValue ([string]$Server["url"]) -Mode "GeminiPlaceholder"
        if ($Server.ContainsKey("headers")) {
            $out["headers"] = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["headers"]) -Mode "GeminiPlaceholder"
        }
    } else {
        $out["command"] = Resolve-EnvValue -StringValue ([string]$Server["command"]) -Mode "GeminiPlaceholder"
        $args = @()
        foreach ($arg in $Server["args"]) {
            $args += ,(Resolve-EnvValue -StringValue ([string]$arg) -Mode "GeminiPlaceholder")
        }
        $out["args"] = $args
        if ($Server.ContainsKey("env")) {
            $out["env"] = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["env"]) -Mode "GeminiPlaceholder"
        }
    }
    $out["trust"] = $false
    return $out
}

function Escape-TomlString {
    param([string]$Value)
    return $Value.Replace('\', '\\').Replace('"', '\"')
}

function Convert-HashtableToTomlInlineTable {
    param([hashtable]$Map)

    $parts = @()
    foreach ($key in ($Map.Keys | Sort-Object)) {
        $escapedValue = Escape-TomlString ([string]$Map[$key])
        $parts += "$key = `"$escapedValue`""
    }
    return "{ " + ($parts -join ", ") + " }"
}

function Convert-ServerToCodexToml {
    param([string]$Name, [hashtable]$Server)

    if (-not (Should-IncludeServer -Name $Name -Server $Server -Client "codex")) {
        return $null
    }

    $transport = [string]$Server["transport"]
    $lines = @("[mcp_servers.$Name]")
    if ($transport -eq "http") {
        $url = Resolve-EnvValue -StringValue ([string]$Server["url"]) -Mode "Concrete"
        if ([string]::IsNullOrWhiteSpace($url)) {
            $script:Warnings.Add("Skip $Name for Codex because the URL resolved to an empty value.")
            return $null
        }
        $lines += "url = `"$(Escape-TomlString $url)`""
        if ($Server.ContainsKey("codex")) {
            $codexSettings = ConvertTo-PlainObject $Server["codex"]
            if ($codexSettings.ContainsKey("bearer_token_env_var")) {
                $tokenEnvVar = Escape-TomlString ([string]$codexSettings["bearer_token_env_var"])
                $lines += "bearer_token_env_var = `"$tokenEnvVar`""
            }
        }
    } else {
        $command = Resolve-EnvValue -StringValue ([string]$Server["command"]) -Mode "Concrete"
        $lines += "command = `"$(Escape-TomlString $command)`""
        $encodedArgs = @()
        foreach ($arg in $Server["args"]) {
            $resolvedArg = Resolve-EnvValue -StringValue ([string]$arg) -Mode "Concrete"
            $encodedArgs += "`"$(Escape-TomlString $resolvedArg)`""
        }
        $lines += "args = [" + ($encodedArgs -join ", ") + "]"
        if ($Server.ContainsKey("env")) {
            $optionalKeys = Get-OptionalEnvKeys -Server $Server
            $envMap = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["env"]) -Mode "Concrete"
            if (-not (Test-ResolvedMap -ServerName $Name -Map $envMap -Kind "Codex" -OptionalKeys $optionalKeys)) {
                return $null
            }
            $lines += "env = " + (Convert-HashtableToTomlInlineTable -Map (Remove-EmptyOptionalEnv -Map $envMap -OptionalKeys $optionalKeys))
        }
    }
    if ($Server.ContainsKey("enabled") -and -not [bool]$Server["enabled"]) {
        $lines += "enabled = false"
    }
    return ($lines -join "`r`n")
}

function Set-OrReplaceManagedBlock {
    param(
        [string]$OriginalContent,
        [string]$ManagedBody
    )

    $begin = "# >>> managed by scripts/sync-mcp-config.ps1 >>>"
    $end = "# <<< managed by scripts/sync-mcp-config.ps1 <<<"
    $block = $begin + "`r`n" + $ManagedBody.Trim() + "`r`n" + $end

    if ([string]::IsNullOrWhiteSpace($OriginalContent)) {
        return $block + "`r`n"
    }

    if ($OriginalContent.Contains($begin) -and $OriginalContent.Contains($end)) {
        return [regex]::Replace(
            $OriginalContent,
            [regex]::Escape($begin) + '(?s).*?' + [regex]::Escape($end),
            [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $block }
        )
    }

    return $OriginalContent.TrimEnd() + "`r`n`r`n" + $block + "`r`n"
}

function Remove-ManagedBlock {
    param([string]$Content)

    if ([string]::IsNullOrWhiteSpace($Content)) {
        return ""
    }

    $begin = "# >>> managed by scripts/sync-mcp-config.ps1 >>>"
    $end = "# <<< managed by scripts/sync-mcp-config.ps1 <<<"
    if ($Content.Contains($begin) -and $Content.Contains($end)) {
        return [regex]::Replace(
            $Content,
            [regex]::Escape($begin) + '(?s).*?' + [regex]::Escape($end),
            ""
        ).Trim()
    }

    return $Content
}

function Get-CodexMcpBlocks {
    param([string]$Content)

    $blocks = @{}
    if ([string]::IsNullOrWhiteSpace($Content)) {
        return $blocks
    }

    $matches = [regex]::Matches($Content, '(?ms)^\[mcp_servers\.([^\]]+)\]\s*.*?(?=^\[|\z)')
    foreach ($match in $matches) {
        $serverName = $match.Groups[1].Value
        $blocks[$serverName] = $match.Value.Trim()
    }
    return $blocks
}

function Remove-CodexMcpBlocks {
    param([string]$Content)

    if ([string]::IsNullOrWhiteSpace($Content)) {
        return ""
    }

    return ([regex]::Replace($Content, '(?ms)^\[mcp_servers\.[^\]]+\]\s*.*?(?=^\[|\z)', "")).Trim()
}

$registry = ConvertTo-PlainObject (Get-Content -LiteralPath $RegistryPath -Raw -Encoding UTF8 | ConvertFrom-Json)
if (-not $registry.ContainsKey("servers")) {
    throw "Registry file must contain a top-level 'servers' object."
}

$servers = ConvertTo-PlainObject $registry["servers"]

if (-not $SkipWorkspaceConfig) {
    # .mcp.json — Claude Code project MCP; uses ${env:MONOREPO_ROOT} for portable script paths
    $claudeProjectServers = @{}
    foreach ($name in ($servers.Keys | Sort-Object)) {
        $serverConfig = Convert-ServerToClaudeProjectConfig -Name $name -Server (ConvertTo-PlainObject $servers[$name])
        if ($null -ne $serverConfig) {
            $claudeProjectServers[$name] = $serverConfig
        }
    }
    $claudeProjectDoc = @{ mcpServers = $claudeProjectServers }
    $workspacePath = Join-Path $WorkspaceRoot ".mcp.json"
    Write-Utf8NoBomFile -Path $workspacePath -Content ($claudeProjectDoc | ConvertTo-Json -Depth 20)

    # Self-consistency: the .mcp.json just written references ${env:MONOREPO_ROOT} for every
    # powershell-launched server's -File path (see Convert-ServerToClaudeProjectConfig / line ~161).
    # If that USER env var is unset, Claude Code / Cursor expand it to '' -> broken
    # '\scripts\*.ps1' path -> each MCP server flashes a red "file not found" console window on
    # every host launch (root cause 2026-06-16: laptop had MONOREPO_ROOT unset; desktop had it set).
    # The script that creates the dependency must guarantee it. Idempotent; User scope (no elevation).
    $monoValue = $WorkspaceRoot.TrimEnd('\')   # match .TrimEnd('\') normalization in sync-claude-userlevel.ps1
    $monoCurrent = [Environment]::GetEnvironmentVariable('MONOREPO_ROOT', 'User')
    if ($monoCurrent -ne $monoValue) {
        [Environment]::SetEnvironmentVariable('MONOREPO_ROOT', $monoValue, 'User')
        Write-Host "[env] MONOREPO_ROOT (User) set -> $monoValue (was: '$monoCurrent'). Restart the MCP host (Claude Code / Cursor / Claude Desktop) to apply." -ForegroundColor Yellow
    } else {
        Write-Host "[env] MONOREPO_ROOT (User) ok = $monoValue" -ForegroundColor Gray
    }

    # .cursor/mcp.json — Cursor project MCP; uses ${workspaceFolder} per Cursor docs
    $workspaceServers = @{}
    foreach ($name in ($servers.Keys | Sort-Object)) {
        $serverConfig = Convert-ServerToWorkspaceConfig -Name $name -Server (ConvertTo-PlainObject $servers[$name])
        if ($null -ne $serverConfig) {
            $workspaceServers[$name] = $serverConfig
        }
    }
    $workspaceDoc = @{ mcpServers = $workspaceServers }
    $cursorMcpDir = Join-Path $WorkspaceRoot ".cursor"
    if (-not (Test-Path -LiteralPath $cursorMcpDir)) {
        New-Item -ItemType Directory -Path $cursorMcpDir | Out-Null
    }
    $cursorMcpPath = Join-Path $cursorMcpDir "mcp.json"
    Write-Utf8NoBomFile -Path $cursorMcpPath -Content ($workspaceDoc | ConvertTo-Json -Depth 20)
}

# `%USERPROFILE%\.claude\mcp.json` is deliberately NOT written by this script.
# Ownership belongs to scripts/sync-claude-userlevel.ps1, which replaces it with
# `{"mcpServers":{}}` from mcp/claude-userlevel/mcp.template.json (see the "mcp"
# entry in mcp/claude-userlevel/manifest.json): CLAUDE.md requires that file to
# stay empty, and the repo-root `.mcp.json` (project scope) is the real SSOT for
# shared MCP servers.
#
# This script used to write the full registry there -- added 2026-04-23 chasing a
# "same server list on six clients" goal, superseded by the empty-file rule. Two
# scripts owning one file meant whichever ran last won, so following CLAUDE.md's
# own instruction to run this sync silently repopulated the file CLAUDE.md says
# must be empty. Every Claude session then loaded the repo's servers a second time
# on top of project `.mcp.json` -- double-launching each one. For OAuth servers
# behind `mcp-remote` that means two proxies racing the same token lock, which is
# how 2026-08-25 ended up with 36 zombie node processes and 14 browser popups in
# two hours (see WORKLOG 2026-08-25).
#
# Removed 2026-08-25. Do not re-add: edit mcp/claude-userlevel/mcp.template.json
# and run scripts/sync-claude-userlevel.ps1 instead.

if (-not $SkipCopilot) {
    $copilotServers = @{}
    foreach ($name in ($servers.Keys | Sort-Object)) {
        $serverConfig = Convert-ServerToCopilotConfig -Name $name -Server (ConvertTo-PlainObject $servers[$name])
        if ($null -ne $serverConfig) {
            $copilotServers[$name] = $serverConfig
        }
    }
    $copilotDoc = @{ mcpServers = $copilotServers }
    $copilotPath = Join-Path $env:USERPROFILE ".copilot\mcp-config.json"
    Write-Utf8NoBomFile -Path $copilotPath -Content ($copilotDoc | ConvertTo-Json -Depth 20)
}

if (-not $SkipGemini) {
    $geminiServers = @{}
    foreach ($name in ($servers.Keys | Sort-Object)) {
        $serverConfig = Convert-ServerToGeminiConfig -Name $name -Server (ConvertTo-PlainObject $servers[$name])
        if ($null -ne $serverConfig) {
            $geminiServers[$name] = $serverConfig
        }
    }
    $geminiPath = Join-Path $env:USERPROFILE ".gemini\settings.json"
    $geminiDoc = @{}
    if (Test-Path -LiteralPath $geminiPath) {
        $existingGemini = ConvertTo-PlainObject (Get-Content -LiteralPath $geminiPath -Raw -Encoding UTF8 | ConvertFrom-Json)
        if ($null -ne $existingGemini) {
            $geminiDoc = $existingGemini
        }
    }
    $geminiDoc["mcpServers"] = $geminiServers
    Write-Utf8NoBomFile -Path $geminiPath -Content ($geminiDoc | ConvertTo-Json -Depth 20)
}

if (-not $SkipCodex) {
    $codexPath = Join-Path $env:USERPROFILE ".codex\config.toml"
    $original = ""
    if (Test-Path -LiteralPath $codexPath) {
        $original = Get-Content -LiteralPath $codexPath -Raw -Encoding UTF8
    }
    $originalWithoutManaged = Remove-ManagedBlock -Content $original
    $existingBlocks = Get-CodexMcpBlocks -Content $originalWithoutManaged
    $baseContent = Remove-CodexMcpBlocks -Content $originalWithoutManaged

    $managedSections = @()
    foreach ($name in ($servers.Keys | Sort-Object)) {
        $plainServer = ConvertTo-PlainObject $servers[$name]
        $serverBlock = Convert-ServerToCodexToml -Name $name -Server $plainServer
        if (-not [string]::IsNullOrWhiteSpace($serverBlock)) {
            $managedSections += $serverBlock
            continue
        }

        if (Should-IncludeServer -Name $name -Server $plainServer -Client "codex") {
            $script:Warnings.Add("Skipped Codex block for $name because the generated version was incomplete on this machine.")
        }
    }

    foreach ($name in ($existingBlocks.Keys | Sort-Object)) {
        if (-not $servers.ContainsKey($name)) {
            $managedSections += $existingBlocks[$name]
            $script:Warnings.Add("Preserved existing Codex block for unmanaged server '$name'.")
        }
    }

    $managedBody = $managedSections -join "`r`n`r`n"
    $updated = Set-OrReplaceManagedBlock -OriginalContent $baseContent -ManagedBody $managedBody
    Write-Utf8NoBomFile -Path $codexPath -Content $updated
}

# Cursor loads BOTH the project `.cursor/mcp.json` and the user-level
# `%USERPROFILE%\.cursor\mcp.json`. Only the first is repo-managed, so any server
# named in both launches twice per Cursor window -- the same double-launch hazard
# described above for `~/.claude/mcp.json`.
#
# That file is intentionally not written here: it is a global Cursor config
# applying to every repo on the machine, so publishing this repo's servers into it
# would leak them into unrelated projects. It cannot be silently ignored either,
# because a fix applied there by hand (e.g. pinning `mcp-remote` to a fixed
# version) is invisible to the repo and unreproducible on a new machine.
# So: detect and report, never mutate.
# Compare what Cursor actually loads from each file, not the registry: a server
# can sit in the registry yet be excluded from the project Cursor config, and such
# a server does not double-launch. Over-reporting would train the operator to
# ignore this warning, which is the failure mode it exists to prevent.
$projectCursorPath = Join-Path $WorkspaceRoot ".cursor\mcp.json"
$userCursorPath = Join-Path $env:USERPROFILE ".cursor\mcp.json"

function Get-McpServerNames {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return @()
    }
    $doc = ConvertTo-PlainObject (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
    if ($null -eq $doc -or -not $doc.ContainsKey("mcpServers")) {
        return @()
    }
    return @((ConvertTo-PlainObject $doc["mcpServers"]).Keys)
}

if (Test-Path -LiteralPath $userCursorPath) {
    try {
        $projectCursorNames = Get-McpServerNames -Path $projectCursorPath
        $userCursorNames = Get-McpServerNames -Path $userCursorPath
        $userCursorDupes = @($userCursorNames | Where-Object { $projectCursorNames -contains $_ } | Sort-Object)
        if ($userCursorDupes.Count -gt 0) {
            $script:Warnings.Add("User-level Cursor MCP ($userCursorPath) redefines $($userCursorDupes.Count) server(s) that the project config also defines: $($userCursorDupes -join ', '). Cursor loads both files, so each of these launches twice per window. Remove them there -- $projectCursorPath is the SSOT.")
        }
    } catch {
        $script:Warnings.Add("Could not compare Cursor MCP configs -- duplicate-server check skipped: $($_.Exception.Message)")
    }
}

# Claude Code keeps local/user and project-scoped MCP servers in `%USERPROFILE%\.claude.json`,
# NOT in the legacy `~/.claude\mcp.json` that sync-claude-userlevel.ps1 normalizes. See
# agency-os/docs/operations/mcp-add-server-quickstart.md and collaborator-ai-agent-rules.md.
# Stale project keys accumulate there whenever `claude` is started from an unrelated directory,
# and no sync step has ever looked at that file -- so enforcing the empty-file rule on the legacy
# path while ignoring this one would give false confidence.
# Report only: scripts/sanitize-user-mcp-config.ps1 already owns clearing these entries
# (Clear-ClaudeProjectMcpEntries). Doing it here too would recreate the two-owners bug that this
# change removed.
$claudeUserJsonPath = Join-Path $env:USERPROFILE ".claude.json"
if (Test-Path -LiteralPath $claudeUserJsonPath) {
    try {
        # Deliberately NOT ConvertFrom-Json. That cmdlet throws on this file because Claude Code
        # writes project keys that differ only by case (e.g. 'C:/WINDOWS/system32' and
        # 'C:/WINDOWS/System32') and its PSCustomObject build uses case-insensitive property names.
        # `-AsHashtable` would parse it but does not exist before PowerShell 6, and this machine
        # runs Windows PowerShell 5.1 with no pwsh on PATH. JavaScriptSerializer ships with .NET
        # Framework and builds an ordinal Dictionary, so both keys survive.
        Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop
        $jsonReader = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $jsonReader.MaxJsonLength = [int]::MaxValue
        $claudeUserDoc = $jsonReader.DeserializeObject((Get-Content -LiteralPath $claudeUserJsonPath -Raw -Encoding UTF8))
        if ($null -ne $claudeUserDoc -and $claudeUserDoc.ContainsKey("projects")) {
            $populatedProjects = @()
            $claudeProjects = $claudeUserDoc["projects"]
            foreach ($projectKey in @($claudeProjects.Keys)) {
                $project = $claudeProjects[$projectKey]
                if ($null -eq $project -or -not $project.ContainsKey("mcpServers")) { continue }
                $projectMcpNames = @($project["mcpServers"].Keys)
                if ($projectMcpNames.Count -eq 0) { continue }
                $entry = "$projectKey ($($projectMcpNames.Count): $($projectMcpNames -join ', '))"
                if (($projectKey -replace '/', '\') -eq $WorkspaceRoot.TrimEnd('\')) {
                    $entry += " <-- THIS workspace; these launch ON TOP OF .mcp.json"
                }
                $populatedProjects += $entry
            }
            if ($populatedProjects.Count -gt 0) {
                $script:Warnings.Add("$claudeUserJsonPath carries project-scoped MCP servers that no sync step manages: $($populatedProjects -join ' | '). scripts/sanitize-user-mcp-config.ps1 owns clearing them -- but note its Clear-ClaudeProjectMcpEntries uses 'ConvertFrom-Json -AsHashtable', which does not exist on Windows PowerShell 5.1, so verify it actually runs before trusting it.")
            }
        }
    } catch {
        $script:Warnings.Add("Could not read $claudeUserJsonPath -- stale project-MCP check skipped: $($_.Exception.Message)")
    }
}

if ($StrictEnv -and $script:MissingVars.Count -gt 0) {
    throw ("Missing required environment variables: " + ((@($script:MissingVars) | Sort-Object) -join ", "))
}

Write-Host "MCP sync complete." -ForegroundColor Green
Write-Host "  workspace : $(if ($SkipWorkspaceConfig) { 'skipped' } else { Join-Path $WorkspaceRoot '.mcp.json' })" -ForegroundColor Gray
Write-Host "  cursor    : $(if ($SkipWorkspaceConfig) { 'skipped' } else { Join-Path $WorkspaceRoot '.cursor\mcp.json' })" -ForegroundColor Gray
Write-Host "  claude    : not written -- owned by sync-claude-userlevel.ps1, must stay {}" -ForegroundColor Gray
Write-Host "  codex     : $(if ($SkipCodex) { 'skipped' } else { Join-Path $env:USERPROFILE '.codex\config.toml' })" -ForegroundColor Gray
Write-Host "  copilot   : $(if ($SkipCopilot) { 'skipped' } else { Join-Path $env:USERPROFILE '.copilot\mcp-config.json' })" -ForegroundColor Gray
Write-Host "  gemini    : $(if ($SkipGemini) { 'skipped' } else { Join-Path $env:USERPROFILE '.gemini\settings.json' })" -ForegroundColor Gray

if ($script:Warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "Warnings:" -ForegroundColor Yellow
    foreach ($warning in $script:Warnings) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
}

if ($script:MissingVars.Count -gt 0) {
    Write-Host ""
    Write-Host "Missing environment variables:" -ForegroundColor Yellow
    foreach ($name in (@($script:MissingVars) | Sort-Object)) {
        Write-Host "  - $name" -ForegroundColor Yellow
    }
    Write-Host "Set them on this machine and rerun the sync script." -ForegroundColor Yellow
}
