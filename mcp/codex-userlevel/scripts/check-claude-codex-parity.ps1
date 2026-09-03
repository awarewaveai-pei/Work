<#
.SYNOPSIS
  Read-only parity verification for the Claude-first / Codex bridge.

.DESCRIPTION
  Proves the generated Codex surface points at the one human-maintained Claude
  source. It intentionally reports names and counts only: never config values,
  environment values, or MCP credentials.
#>
[CmdletBinding()]
param(
  [string]$WorkRoot = '',
  [string]$ClaudeHome = '',
  [string]$CodexHome = "$env:USERPROFILE\.codex"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($WorkRoot)) {
  $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
}
if ([string]::IsNullOrWhiteSpace($ClaudeHome)) {
  $ClaudeHome = Join-Path $WorkRoot '.claude'
}

$failures = New-Object System.Collections.Generic.List[string]
$checks = 0
function Assert-Parity {
  param([bool]$Condition, [string]$Message)
  $script:checks++
  if (-not $Condition) { $script:failures.Add($Message) }
}

function Get-SourceAgentFiles {
  param([string]$Path)
  return @(Get-ChildItem -File -LiteralPath $Path -Filter '*.md' |
    Where-Object { $_.Name -notmatch '^(README|AGENT_INDEX)' } |
    Sort-Object Name)
}

function Get-SourceSkillNames {
  param([string]$Path)
  $names = New-Object System.Collections.Generic.List[string]
  Get-ChildItem -Directory -LiteralPath $Path |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') } |
    ForEach-Object { $names.Add($_.Name) }
  Get-ChildItem -File -LiteralPath $Path -Filter '*.skill' |
    ForEach-Object {
      $top = (& tar -tf $_.FullName | Select-Object -First 1) -replace '/.*$', ''
      if ([string]::IsNullOrWhiteSpace($top)) { throw "Cannot read source archive: $($_.FullName)" }
      $names.Add($top)
    }
  @('source-command-caveman', 'source-command-wp-bridge-release', 'source-command-zoom-out') |
    ForEach-Object { $names.Add($_) }
  return @($names | Sort-Object -Unique)
}

function Get-TomlMcpServerNames {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
  $managed = [regex]::Match($content, '(?s)# >>> managed by scripts/sync-mcp-config\.ps1 >>>\s*(.*?)\s*# <<< managed by scripts/sync-mcp-config\.ps1 <<<')
  if (-not $managed.Success) { return @() }
  return @(
    [regex]::Matches($managed.Groups[1].Value, '(?m)^\[mcp_servers\.([^\]]+)\]') |
      ForEach-Object { $_.Groups[1].Value } |
      Sort-Object -Unique
  )
}

function Get-RegistryClientServerNames {
  param([object]$Registry, [string]$Client)
  return @($Registry.servers.PSObject.Properties | Where-Object {
    $server = $_.Value
    $excluded = $false
    $clientsProperty = $server.PSObject.Properties['clients']
    if ($null -ne $clientsProperty) {
      $clientProperty = $clientsProperty.Value.PSObject.Properties[$Client]
      if ($null -ne $clientProperty) {
        $excludeProperty = $clientProperty.Value.PSObject.Properties['exclude']
        if ($null -ne $excludeProperty) { $excluded = ($excludeProperty.Value -eq $true) }
      }
    }
    $server.enabled -and -not $excluded
  } | ForEach-Object { $_.Name } | Sort-Object)
}

$claudeMd = Join-Path $WorkRoot 'CLAUDE.md'
$rootAgents = Join-Path $WorkRoot 'AGENTS.md'
$repoSkills = Join-Path $WorkRoot '.agents\skills'
$nativeAgents = Join-Path $WorkRoot '.codex\agents'
$projectHooks = Join-Path $WorkRoot '.codex\hooks.json'
$legacyProjectHooks = Join-Path $WorkRoot '.codex\hooks'
$charter = Join-Path $WorkRoot 'mcp\claude-userlevel\SUBAGENT_CHARTER.md'
$canonicalHooks = Join-Path $WorkRoot 'mcp\claude-userlevel\hooks'

Assert-Parity (Test-Path -LiteralPath $claudeMd) "Missing Claude project source: $claudeMd"
Assert-Parity (Test-Path -LiteralPath $rootAgents) "Missing Codex project bridge: $rootAgents"
if (Test-Path -LiteralPath $rootAgents) {
  $bridge = Get-Content -Raw -Encoding UTF8 -LiteralPath $rootAgents
  Assert-Parity ($bridge -match 'Before any\s+task action, Codex must read it in full') 'Root AGENTS.md does not require a full CLAUDE.md read before task actions.'
  Assert-Parity ($bridge -match 'agency-os/AGENTS\.md') 'Root AGENTS.md does not require the imported agency-os instructions.'
}

Assert-Parity (Test-Path -LiteralPath $charter) "Missing shared subagent charter: $charter"
if (Test-Path -LiteralPath $charter) {
  Assert-Parity ((Get-Content -Raw -Encoding UTF8 -LiteralPath $charter) -match '30-year, LEGO-like') 'Subagent charter is missing the durable engineering standard.'
}

$sourceAgents = @(Get-SourceAgentFiles (Join-Path $ClaudeHome 'agents'))
foreach ($source in $sourceAgents) {
  $bridgePath = Join-Path $nativeAgents "$($source.BaseName).toml"
  Assert-Parity (Test-Path -LiteralPath $bridgePath) "Missing native agent bridge: $bridgePath"
  if (Test-Path -LiteralPath $bridgePath) {
    $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $bridgePath
    Assert-Parity ($content -match [regex]::Escape($source.FullName)) "Native agent bridge does not point to its Claude source: $bridgePath"
    Assert-Parity ($content -match [regex]::Escape($charter)) "Native agent bridge does not load the shared charter: $bridgePath"
  }
}
$generatedNative = @(Get-ChildItem -File -LiteralPath $nativeAgents -Filter '*.toml' |
  Where-Object { (Get-Content -Encoding UTF8 -LiteralPath $_.FullName -TotalCount 1) -eq '# GENERATED: Claude-first native agent bridge. Do not edit by hand.' })
Assert-Parity ($generatedNative.Count -eq $sourceAgents.Count) "Generated native agent count differs (Claude=$($sourceAgents.Count), Codex=$($generatedNative.Count))."

$skillNames = @(Get-SourceSkillNames (Join-Path $ClaudeHome 'skills'))
foreach ($skillName in $skillNames) {
  $wrapper = Join-Path $repoSkills (Join-Path $skillName 'SKILL.md')
  Assert-Parity (Test-Path -LiteralPath $wrapper) "Missing repo skill bridge: $wrapper"
  if (Test-Path -LiteralPath $wrapper) {
    $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $wrapper
    Assert-Parity ($content -match 'generated Codex wrapper|Codex wrapper for a Claude skill') "Skill bridge is not generated/thin: $wrapper"
  }
  foreach ($legacyPath in @((Join-Path $CodexHome (Join-Path 'skills' $skillName)), (Join-Path $env:USERPROFILE (Join-Path '.agents\skills' $skillName)))) {
    Assert-Parity (-not (Test-Path -LiteralPath $legacyPath)) "Duplicate skill runtime remains: $legacyPath"
  }
}

$commands = @(Get-ChildItem -File -LiteralPath (Join-Path $ClaudeHome 'commands') -Filter '*.md')
$commandIndex = Join-Path $CodexHome 'skills\claude-compat\references\commands\index.md'
Assert-Parity (Test-Path -LiteralPath $commandIndex) "Missing generated command index: $commandIndex"
if (Test-Path -LiteralPath $commandIndex) {
  $index = Get-Content -Raw -Encoding UTF8 -LiteralPath $commandIndex
  foreach ($command in $commands) {
    Assert-Parity ($index -match [regex]::Escape($command.FullName)) "Command index lacks direct source link for /$($command.BaseName)."
  }
}

Assert-Parity (Test-Path -LiteralPath $projectHooks) "Missing project hook bridge: $projectHooks"
if (Test-Path -LiteralPath $projectHooks) {
  $hooks = Get-Content -Raw -Encoding UTF8 -LiteralPath $projectHooks | ConvertFrom-Json
  $expectedEvents = @('PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'Stop', 'SubagentStart')
  foreach ($event in $expectedEvents) {
    Assert-Parity ($hooks.hooks.PSObject.Properties.Name -contains $event) "Project hook event missing: $event"
    $commandsForEvent = @($hooks.hooks.$event | ForEach-Object { $_.hooks } | ForEach-Object { $_.commandWindows }) -join "`n"
    Assert-Parity ($commandsForEvent -match 'mcp\\claude-userlevel\\hooks') "Project hook event does not invoke canonical hook source: $event"
  }
}
$legacyProjectHookFiles = @(if (Test-Path -LiteralPath $legacyProjectHooks) { Get-ChildItem -LiteralPath $legacyProjectHooks -File -Recurse } else { @() })
Assert-Parity ($legacyProjectHookFiles.Count -eq 0) "Obsolete project hook runtime still contains $($legacyProjectHookFiles.Count) file(s): $legacyProjectHooks"
Assert-Parity (-not (Test-Path -LiteralPath (Join-Path $CodexHome 'hooks.json'))) "Obsolete global Codex hook configuration still exists: $(Join-Path $CodexHome 'hooks.json')"
Assert-Parity (-not (Test-Path -LiteralPath (Join-Path $CodexHome 'hooks'))) "Obsolete global Codex hook runtime still exists: $(Join-Path $CodexHome 'hooks')"

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $canonicalHooks 'rules.manifest.json') | ConvertFrom-Json
Assert-Parity ($null -ne $manifest.events.SubagentStart) 'Canonical hook manifest lacks SubagentStart.'
$settingsTemplate = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $WorkRoot 'mcp\claude-userlevel\settings.template.json')
Assert-Parity ($settingsTemplate -match 'SubagentStart') 'Claude user-level settings template lacks SubagentStart.'

$registry = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $WorkRoot 'mcp\registry.template.json') | ConvertFrom-Json
$expectedWorkspaceMcp = @(Get-RegistryClientServerNames $registry 'workspace')
$expectedCodexMcp = @(Get-RegistryClientServerNames $registry 'codex')
$workspaceMcp = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $WorkRoot '.mcp.json') | ConvertFrom-Json
$workspaceMcpNames = @($workspaceMcp.mcpServers.PSObject.Properties.Name | Sort-Object)
$codexConfigPath = Join-Path $CodexHome 'config.toml'
$codexConfigText = Get-Content -Raw -Encoding UTF8 -LiteralPath $codexConfigPath
Assert-Parity ($codexConfigText -match '# >>> managed by scripts/sync-mcp-config\.ps1 >>>') 'Codex MCP managed block is missing.'
$codexMcpNames = @(Get-TomlMcpServerNames $codexConfigPath)
Assert-Parity (@(Compare-Object $expectedWorkspaceMcp $workspaceMcpNames).Count -eq 0) 'Workspace MCP names drift from the registry.'
$missingCodexMcp = @($expectedCodexMcp | Where-Object { $_ -notin $codexMcpNames })
Assert-Parity ($missingCodexMcp.Count -eq 0) 'Codex MCP managed block is missing one or more registry servers.'

if ($failures.Count) {
  Write-Host "Claude/Codex parity FAILED ($($failures.Count)/$checks checks)." -ForegroundColor Red
  $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Claude/Codex parity PASSED: $checks checks; $($sourceAgents.Count) agents, $($commands.Count) commands, $($skillNames.Count) skills, $($expectedCodexMcp.Count) Codex MCP servers." -ForegroundColor Green
