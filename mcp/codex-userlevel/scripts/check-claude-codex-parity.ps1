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
. (Join-Path $PSScriptRoot 'codex-bridge-lib.ps1')

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
  param(
    [string]$Path,
    [string]$CommandsPath
  )
  $names = New-Object System.Collections.Generic.List[string]
  Get-ChildItem -Directory -LiteralPath $Path |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') } |
    ForEach-Object { $names.Add($_.Name) }
  Get-ChildItem -File -LiteralPath $Path -Filter '*.skill' |
    ForEach-Object { $names.Add((Get-SkillArchiveTopFolder -Path $_.FullName)) }

  # Command wrappers, enumerated from disk. This list was the same hardcoded three entries
  # as the generator's (caveman / wp-bridge-release / zoom-out), so the CHECKER agreed with
  # the generator about a set that excluded 42 of 45 commands -- two copies of one wrong
  # assumption, which is why nothing flagged it. Both sides now read the directory, and the
  # `codex-skip: true` opt-out has to be honoured identically here or parity reports a
  # phantom gap. SSOT for the generation rule:
  # mcp/codex-userlevel/scripts/sync-claude-to-codex.ps1
  if ($CommandsPath -and (Test-Path -LiteralPath $CommandsPath)) {
    Get-ChildItem -File -LiteralPath $CommandsPath -Filter '*.md' |
      ForEach-Object {
        $fm = Get-MarkdownFrontmatter $_.FullName
        # .Contains, not dot-access: Set-StrictMode -Version Latest throws
        # PropertyNotFoundStrict on an absent OrderedDictionary key.
        $skip = $fm.Contains('codex-skip') -and $fm['codex-skip'] -eq 'true'
        if (-not $skip) {
          $names.Add("source-command-$($_.BaseName)")
        }
      }
  }
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

# Keys of [hooks.state."<key>"] tables (or inline `"<key>" = { trusted_hash = ... }`
# under [hooks.state]) that carry a trusted_hash.
function Get-TrustedHookKeys {
  param([string]$ConfigPath)
  if (-not (Test-Path -LiteralPath $ConfigPath)) { return @() }
  $keys = New-Object System.Collections.Generic.List[string]
  $current = $null
  $inStateTable = $false
  foreach ($line in (Get-Content -Encoding UTF8 -LiteralPath $ConfigPath)) {
    if ($line -match '^\s*\[hooks\.state\.(?:"([^"]+)"|''([^'']+)''|([^\]\s]+))\]\s*$') {
      $current = @($Matches[1], $Matches[2], $Matches[3]) | Where-Object { $_ } | Select-Object -First 1
      $inStateTable = $false
      continue
    }
    if ($line -match '^\s*\[') {
      $current = $null
      $inStateTable = ($line -match '^\s*\[hooks\.state\]\s*$')
      continue
    }
    if ($current -and $line -match '^\s*trusted_hash\s*=') { $keys.Add($current); $current = $null; continue }
    if ($inStateTable -and $line -match '^\s*"([^"]+)"\s*=\s*\{[^}]*trusted_hash') { $keys.Add($Matches[1]) }
  }
  return @($keys | Sort-Object -Unique)
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
    # Repo-relative, not absolute: these bridges are committed, so an embedded
    # 'D:\Work\...' breaks in any other checkout or a Linux Codex container. Asserting the
    # relative form also catches an absolute path creeping back in.
    $relSource = $source.FullName.Substring($WorkRoot.TrimEnd([char]92).Length + 1).Replace([char]92, '/')
    Assert-Parity ($content -match [regex]::Escape($relSource)) "Native agent bridge does not point to its Claude source (repo-relative): $bridgePath"
    Assert-Parity ($content -match [regex]::Escape('mcp/claude-userlevel/SUBAGENT_CHARTER.md')) "Native agent bridge does not load the shared charter: $bridgePath"
    Assert-Parity (-not ($content -match '[A-Za-z]:\\')) "Native agent bridge embeds an absolute Windows path, which will not resolve on another machine: $bridgePath"
  }
}
$generatedNative = @(Get-ChildItem -File -LiteralPath $nativeAgents -Filter '*.toml' |
  Where-Object { (Get-Content -Encoding UTF8 -LiteralPath $_.FullName -TotalCount 1) -eq '# GENERATED: Claude-first native agent bridge. Do not edit by hand.' })
Assert-Parity ($generatedNative.Count -eq $sourceAgents.Count) "Generated native agent count differs (Claude=$($sourceAgents.Count), Codex=$($generatedNative.Count))."

$skillNames = @(Get-SourceSkillNames -Path (Join-Path $ClaudeHome 'skills') -CommandsPath (Join-Path $ClaudeHome 'commands'))
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
  foreach ($m in [regex]::Matches($index, '\]\(([^)]+\.md)\)')) {
    $target = $m.Groups[1].Value
    if ([IO.Path]::IsPathRooted($target)) {
      Assert-Parity (Test-Path -LiteralPath $target) "Command index points at a deleted source: $target"
    }
  }
}

# Legacy full-copy agents under ~/.codex/agents shadow the thin bridges.
$userAgentDir = Join-Path $CodexHome 'agents'
if (Test-Path -LiteralPath $userAgentDir) {
  foreach ($source in $sourceAgents) {
    Assert-Parity (-not (Test-Path -LiteralPath (Join-Path $userAgentDir "$($source.BaseName).toml"))) "Legacy user-level agent copy shadows the bridge: $(Join-Path $userAgentDir "$($source.BaseName).toml")"
  }
}

# Hooks: user-level, generated, byte-identical to what the generator produces now.
# A repo-level .codex/hooks.json would ALSO run once trusted (double execution).
Assert-Parity (-not (Test-Path -LiteralPath $projectHooks)) "Repo-level Codex hook file must not exist (hooks are user-level; both would run): $projectHooks"
$userHooks = Join-Path $CodexHome 'hooks.json'
$expectedHooksJson = Get-CodexUserHooksJson -WorkRoot $WorkRoot
Assert-Parity (Test-Path -LiteralPath $userHooks) "Missing generated Codex user hooks: $userHooks (run sync-claude-to-codex.ps1)"
if (Test-Path -LiteralPath $userHooks) {
  # Byte comparison: -eq is case-insensitive and Get-Content strips a BOM, so a
  # file that differs only in case or encoding would read as identical.
  $actualBytes = [IO.File]::ReadAllBytes($userHooks)
  $expectedBytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($expectedHooksJson)
  $sameBytes = ($actualBytes.Length -eq $expectedBytes.Length)
  if ($sameBytes) {
    for ($i = 0; $i -lt $actualBytes.Length; $i++) {
      if ($actualBytes[$i] -ne $expectedBytes[$i]) { $sameBytes = $false; break }
    }
  }
  Assert-Parity $sameBytes "Codex user hooks drift from the generator output: $userHooks (run sync-claude-to-codex.ps1)"
}
$legacyProjectHookFiles = @(if (Test-Path -LiteralPath $legacyProjectHooks) { Get-ChildItem -LiteralPath $legacyProjectHooks -File -Recurse } else { @() })
Assert-Parity ($legacyProjectHookFiles.Count -eq 0) "Obsolete project hook runtime still contains $($legacyProjectHookFiles.Count) file(s): $legacyProjectHooks"
Assert-Parity (-not (Test-Path -LiteralPath (Join-Path $CodexHome 'hooks'))) "Obsolete global Codex hook runtime still exists: $(Join-Path $CodexHome 'hooks')"

# Trust: Codex records [hooks.state."<source>:<event>:<group>:<handler>"] trusted_hash
# only through the interactive /hooks review; untrusted hooks are skipped silently.
$expectedHandlers = 0
foreach ($ev in (Get-CodexUserHooksDocument -WorkRoot $WorkRoot).hooks.Values) { foreach ($g in $ev) { $expectedHandlers += @($g.hooks).Count } }
$trusted = @(Get-TrustedHookKeys -ConfigPath (Join-Path $CodexHome 'config.toml'))
# A trusted key from some other hook source must not make these look trusted.
$homeNeedles = @($CodexHome.ToLowerInvariant(), $CodexHome.ToLowerInvariant().Replace('\', '/'))
$attributed = @($trusted | Where-Object {
    $k = $_.ToLowerInvariant()
    ($k -like '*hooks.json*') -or ($homeNeedles | Where-Object { $k -like ('*' + $_ + '*') })
  })
if ($attributed.Count -gt 0) { $trusted = $attributed }
elseif ($trusted.Count -gt 0) {
  Write-Host "Note: no trusted hook key names the user hooks file; counting all $($trusted.Count) trusted keys (attribution unknown). The heartbeat check below is what proves execution." -ForegroundColor DarkYellow
}
Assert-Parity ($trusted.Count -ge $expectedHandlers) "Codex has $($trusted.Count)/$expectedHandlers hook handlers trusted; untrusted hooks are skipped silently. Open Codex in $WorkRoot, run /hooks, trust the AwareWave hooks (trusted keys seen: $($trusted -join '; ')). This count is a pre-check only -- the heartbeat check below is the proof that hooks actually ran."

# Proof of execution: a Codex session that started after the current hook file
# but left no heartbeat means the hooks were skipped (stale trust hash).
$heartbeatPath = Join-Path $CodexHome 'awarewave-hook-heartbeat.json'
if (Test-Path -LiteralPath $userHooks) {
  $hooksWritten = (Get-Item -LiteralPath $userHooks).LastWriteTimeUtc
  $sessionsDir = Join-Path $CodexHome 'sessions'
  $newestRollout = if (Test-Path -LiteralPath $sessionsDir) {
    Get-ChildItem -LiteralPath $sessionsDir -Recurse -File -Filter 'rollout-*.jsonl' |
      Where-Object { $_.CreationTimeUtc -gt $hooksWritten } | Sort-Object CreationTimeUtc -Descending | Select-Object -First 1
  }
  if ($newestRollout) {
    $state = $null
    if (Test-Path -LiteralPath $heartbeatPath) { try { $state = Get-Content -Raw -Encoding UTF8 -LiteralPath $heartbeatPath | ConvertFrom-Json } catch { $state = $null } }
    $floor = $newestRollout.CreationTimeUtc.AddMinutes(-1)
    function Get-BeatUtc {
        param([object]$State, [string]$Event)
        try {
            $value = if ($Event) { $State.events.$Event.last_utc } else { $State.updated_utc }
            if ($value) { return ([DateTime]::Parse($value)).ToUniversalTime() }
        } catch { }
        return $null
    }
    $anyBeat = Get-BeatUtc -State $state -Event ''
    Assert-Parity ($null -ne $anyBeat -and $anyBeat -ge $floor) "Codex session $($newestRollout.Name) ran after the hook file was written but no hook heartbeat followed: hooks were skipped (untrusted or stale trust). Run /hooks in Codex."
    # Per-event proof: SessionStart alone can stay trusted while the only BLOCKING
    # event (PreToolUse) has a stale hash, so a tool-using session must show a
    # PreToolUse beat of its own.
    $usedTools = $false
    try { $usedTools = [bool](Select-String -LiteralPath $newestRollout.FullName -Pattern '"(custom_tool_call|function_call|local_shell_call)"' -List -Quiet) } catch { $usedTools = $false }
    if ($usedTools) {
        $preBeat = Get-BeatUtc -State $state -Event 'PreToolUse'
        Assert-Parity ($null -ne $preBeat -and $preBeat -ge $floor) "Codex session $($newestRollout.Name) made tool calls but left no PreToolUse heartbeat: the blocking gate did not run (stale hook trust). Run /hooks in Codex and re-check."
    }
  } else {
    Write-Host "Note: no Codex session since the hook file was written; hook execution not yet proven by heartbeat." -ForegroundColor DarkYellow
  }
}

$globalAgentsPath = Join-Path $CodexHome 'AGENTS.md'
Assert-Parity (Test-Path -LiteralPath $globalAgentsPath) "Missing generated user-level Codex instructions: $globalAgentsPath"
if (Test-Path -LiteralPath $globalAgentsPath) {
  $globalText = Get-Content -Raw -Encoding UTF8 -LiteralPath $globalAgentsPath
  Assert-Parity ($globalText -match '/claude-review') 'User-level Codex instructions lack the reversed cross-model review rule (/claude-review).'
  $memoryIndex = Get-ClaudeMemoryIndexPath -WorkRoot $WorkRoot
  if (Test-Path -LiteralPath $memoryIndex) {
    Assert-Parity ($globalText -match [regex]::Escape($memoryIndex)) "User-level Codex instructions do not point at the operator memory index: $memoryIndex"
  }
}

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
