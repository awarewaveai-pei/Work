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
    [switch]$SkipClaude,
    [switch]$SkipCodex,
    [switch]$SkipCopilot,
    [switch]$SkipGemini
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
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
    "SUPABASE_SOULFULEXPRESSION_MCP_URL" = @("SUPABASE_A_MCP_URL")
    "SUPABASE_SOULFULEXPRESSION_AUTH_BEARER_TOKEN" = @("SUPABASE_A_AUTH_BEARER_TOKEN")
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
        [ValidateSet("Concrete", "JsonPlaceholder", "GeminiPlaceholder")]
        [string]$Mode
    )

    if ($null -eq $StringValue) {
        return $null
    }

    $resolved = $StringValue.Replace('${workspaceRoot}', $WorkspaceRoot).Replace('${workspaceFolder}', $WorkspaceRoot).Replace('${userHome}', $env:USERPROFILE)
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
                    return '${' + $name + '}'
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

function Convert-ServerToClaudeConfig {
    param([string]$Name, [hashtable]$Server)

    if (-not (Should-IncludeServer -Name $Name -Server $Server -Client "claude")) {
        return $null
    }

    $out = @{}
    $transport = [string]$Server["transport"]
    if ($transport -eq "http") {
        $out["type"] = "http"
        $out["url"] = Resolve-EnvValue -StringValue ([string]$Server["url"]) -Mode "Concrete"
        if ([string]::IsNullOrWhiteSpace([string]$out["url"])) {
            $script:Warnings.Add("Skip $Name for Claude because the URL resolved to an empty value.")
            return $null
        }
        if ($Server.ContainsKey("headers")) {
            $headers = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["headers"]) -Mode "Concrete"
            if (-not (Test-ResolvedMap -ServerName $Name -Map $headers -Kind "Claude")) {
                return $null
            }
            $out["headers"] = $headers
        }
    } else {
        $out["command"] = Resolve-EnvValue -StringValue ([string]$Server["command"]) -Mode "Concrete"
        $args = @()
        foreach ($arg in $Server["args"]) {
            $args += ,(Resolve-EnvValue -StringValue ([string]$arg) -Mode "Concrete")
        }
        $out["args"] = $args
        if ($Server.ContainsKey("env")) {
            $optionalKeys = Get-OptionalEnvKeys -Server $Server
            $envMap = Resolve-MapValues -Map (ConvertTo-PlainObject $Server["env"]) -Mode "Concrete"
            if (-not (Test-ResolvedMap -ServerName $Name -Map $envMap -Kind "Claude" -OptionalKeys $optionalKeys)) {
                return $null
            }
            $out["env"] = Remove-EmptyOptionalEnv -Map $envMap -OptionalKeys $optionalKeys
        }
    }
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
    $workspaceServers = @{}
    foreach ($name in ($servers.Keys | Sort-Object)) {
        $serverConfig = Convert-ServerToWorkspaceConfig -Name $name -Server (ConvertTo-PlainObject $servers[$name])
        if ($null -ne $serverConfig) {
            $workspaceServers[$name] = $serverConfig
        }
    }
    $workspaceDoc = @{ mcpServers = $workspaceServers }
    $workspacePath = Join-Path $WorkspaceRoot ".mcp.json"
    Write-Utf8NoBomFile -Path $workspacePath -Content ($workspaceDoc | ConvertTo-Json -Depth 20)
    $cursorMcpDir = Join-Path $WorkspaceRoot ".cursor"
    if (-not (Test-Path -LiteralPath $cursorMcpDir)) {
        New-Item -ItemType Directory -Path $cursorMcpDir | Out-Null
    }
    $cursorMcpPath = Join-Path $cursorMcpDir "mcp.json"
    Write-Utf8NoBomFile -Path $cursorMcpPath -Content ($workspaceDoc | ConvertTo-Json -Depth 20)
}

if (-not $SkipClaude) {
    $claudeServers = @{}
    foreach ($name in ($servers.Keys | Sort-Object)) {
        $serverConfig = Convert-ServerToClaudeConfig -Name $name -Server (ConvertTo-PlainObject $servers[$name])
        if ($null -ne $serverConfig) {
            $claudeServers[$name] = $serverConfig
        }
    }
    $claudeDoc = @{ mcpServers = $claudeServers }
    $claudePath = Join-Path $env:USERPROFILE ".claude\mcp.json"
    Write-Utf8NoBomFile -Path $claudePath -Content ($claudeDoc | ConvertTo-Json -Depth 20)
}

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

if ($StrictEnv -and $script:MissingVars.Count -gt 0) {
    throw ("Missing required environment variables: " + ((@($script:MissingVars) | Sort-Object) -join ", "))
}

Write-Host "MCP sync complete." -ForegroundColor Green
Write-Host "  workspace : $(if ($SkipWorkspaceConfig) { 'skipped' } else { Join-Path $WorkspaceRoot '.mcp.json' })" -ForegroundColor Gray
Write-Host "  cursor    : $(if ($SkipWorkspaceConfig) { 'skipped' } else { Join-Path $WorkspaceRoot '.cursor\mcp.json' })" -ForegroundColor Gray
Write-Host "  claude    : $(if ($SkipClaude) { 'skipped' } else { Join-Path $env:USERPROFILE '.claude\mcp.json' })" -ForegroundColor Gray
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
