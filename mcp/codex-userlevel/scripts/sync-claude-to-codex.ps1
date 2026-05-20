param(
  [string]$ClaudeHome = "",
  [string]$CodexHome = "$env:USERPROFILE\.codex",
  [string]$WorkRoot = "",
  [ValidateSet("linked", "copy")]
  [string]$Mode = "linked"
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Value
  )

  [System.IO.File]::WriteAllText($Path, $Value, $script:Utf8NoBom)
}

function Resolve-ExistingPath {
  param([string]$Path)
  return (Resolve-Path -LiteralPath $Path).Path
}

function Assert-ChildPath {
  param(
    [string]$Path,
    [string]$Root
  )

  $resolvedRoot = Resolve-ExistingPath $Root
  $resolvedPath = Resolve-ExistingPath $Path
  if (-not $resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify path outside root. Path=$resolvedPath Root=$resolvedRoot"
  }
}

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Backup-And-ReplaceDirectory {
  param(
    [string]$Path,
    [string]$BackupRoot,
    [string]$CodexRoot
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Assert-ChildPath -Path $Path -Root $CodexRoot
  Ensure-Directory $BackupRoot

  $leaf = Split-Path -Leaf $Path
  $backupPath = Join-Path $BackupRoot $leaf
  Copy-Item -LiteralPath $Path -Destination $backupPath -Recurse -Force
  Remove-Item -LiteralPath $Path -Recurse -Force
}

function Escape-TableCell {
  param([AllowNull()][string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  return ($Value -replace "`r?`n", " " -replace "\|", "\|" -replace "\s+", " ").Trim()
}

function Get-MarkdownFrontmatter {
  param([string]$Path)

  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
  $match = [regex]::Match($content, "(?s)^---\s*(.*?)\s*---")
  $result = [ordered]@{}
  if (-not $match.Success) {
    return $result
  }

  foreach ($line in ($match.Groups[1].Value -split "`r?`n")) {
    if ($line -match "^\s*([A-Za-z0-9_-]+):\s*(.*)\s*$") {
      $key = $matches[1]
      $value = $matches[2].Trim()
      $value = $value.Trim('"')
      $result[$key] = $value
    }
  }

  return $result
}

function Set-SkillFrontmatter {
  param(
    [string]$SkillPath,
    [string]$Name,
    [string]$Description
  )

  $skillMd = Join-Path $SkillPath "SKILL.md"
  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $skillMd
  $body = [regex]::Replace($content, "(?s)^---.*?---\s*", "")
  $descriptionLines = @()
  foreach ($line in ($Description -split "`r?`n")) {
    $descriptionLines += "  $line"
  }

  $frontmatter = @(
    "---"
    "name: $Name"
    "description: >-"
    $descriptionLines
    "---"
    ""
  ) -join "`n"

  Write-Utf8NoBom -Path $skillMd -Value ($frontmatter + $body)
}

function Write-AgentIndex {
  param(
    [string]$SourceDir,
    [string]$DestDir,
    [bool]$UseSourceLinks = $false
  )

  $rows = @(
    "# Claude Agent Index"
    ""
    "These are migrated Claude Code agent prompts. Codex cannot register them as native agent_type values; load the matching file and use it as role guidance in the current Codex agent unless the user explicitly asks for Codex sub-agents."
    ""
    "| Agent | Model | Tools | Description |"
    "|---|---|---|---|"
  )

  Get-ChildItem -File -LiteralPath $SourceDir -Filter "*.md" |
    Where-Object { $_.Name -notmatch "^README" } |
    Sort-Object Name |
    ForEach-Object {
      $fm = Get-MarkdownFrontmatter $_.FullName
      $name = if ($fm.name) { $fm.name } else { $_.BaseName }
      $model = if ($fm.model) { $fm.model } else { "" }
      $tools = if ($fm.tools) { $fm.tools } else { "" }
      $description = if ($fm.description) { $fm.description } else { "" }
      $target = if ($UseSourceLinks) { $_.FullName } else { "./$($_.Name)" }
      $rows += "| [$name]($target) | $(Escape-TableCell $model) | $(Escape-TableCell $tools) | $(Escape-TableCell $description) |"
    }

  Write-Utf8NoBom -Path (Join-Path $DestDir "index.md") -Value ($rows -join "`n")
}

function Copy-FilesByFilter {
  param(
    [string]$SourceDir,
    [string]$Filter,
    [string]$DestinationDir
  )

  if (-not (Test-Path -LiteralPath $SourceDir)) {
    return
  }

  Get-ChildItem -File -LiteralPath $SourceDir -Filter $Filter |
    ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $DestinationDir -Force
    }
}

function Write-CommandIndex {
  param(
    [string]$SourceDir,
    [string]$DestDir,
    [bool]$UseSourceLinks = $false
  )

  $rows = @(
    "# Claude Command Index"
    ""
    "These are migrated Claude slash-command runbooks. For a user request like `/review`, read the matching Markdown file and execute the steps with Codex tools and permission rules."
    ""
    "| Command | Summary |"
    "|---|---|"
  )

  Get-ChildItem -File -LiteralPath $SourceDir -Filter "*.md" |
    Sort-Object Name |
    ForEach-Object {
      $summary = Get-Content -Encoding UTF8 -LiteralPath $_.FullName -TotalCount 12 |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -First 1
      $target = if ($UseSourceLinks) { $_.FullName } else { "./$($_.Name)" }
      $rows += "| [/$($_.BaseName)]($target) | $(Escape-TableCell $summary) |"
    }

  Write-Utf8NoBom -Path (Join-Path $DestDir "index.md") -Value ($rows -join "`n")
}

function Write-HookIndex {
  param(
    [string]$ClaudeSettingsPath,
    [string]$DestDir
  )

  $rows = @(
    "# Claude Hook Index"
    ""
    "Codex does not run Claude Code hooks automatically. Treat these as manual preflight/postflight checks or source material for future Codex/CI automation."
    ""
    "| Event | Matcher | Type | Command |"
    "|---|---|---|---|"
  )

  $settings = Get-Content -Raw -Encoding UTF8 -LiteralPath $ClaudeSettingsPath | ConvertFrom-Json
  foreach ($eventProp in $settings.hooks.PSObject.Properties) {
    foreach ($entry in @($eventProp.Value)) {
      foreach ($hook in @($entry.hooks)) {
        $command = $hook.command -replace "(?i)(token|key|password|secret)=\S+", '$1=<redacted>'
        $rows += "| $(Escape-TableCell $eventProp.Name) | $(Escape-TableCell $entry.matcher) | $(Escape-TableCell $hook.type) | $(Escape-TableCell $command) |"
      }
    }
  }

  Write-Utf8NoBom -Path (Join-Path $DestDir "index.md") -Value ($rows -join "`n")
}

function Write-McpIndex {
  param(
    [string]$ClaudeMcpPath,
    [string]$CodexConfigPath,
    [string]$DestDir
  )

  $codexServerNames = @()
  if (Test-Path -LiteralPath $CodexConfigPath) {
    $codexServerNames = Select-String -Path $CodexConfigPath -Pattern "^\[mcp_servers\.([^\]]+)\]" |
      ForEach-Object { $_.Matches[0].Groups[1].Value } |
      Sort-Object -Unique
  }

  $rows = @(
    "# MCP Migration Index"
    ""
    "This index intentionally contains only MCP server names, transport shape, and env key names. It must not contain token values."
    ""
    "| Server | Present in Codex | Type | Command or host | Env keys |"
    "|---|---:|---|---|---|"
  )

  $mcp = Get-Content -Raw -Encoding UTF8 -LiteralPath $ClaudeMcpPath | ConvertFrom-Json
  foreach ($prop in ($mcp.mcpServers.PSObject.Properties | Sort-Object Name)) {
    $server = $prop.Value
    $type = if ($server.url) { "url" } elseif ($server.command) { "command" } else { "unknown" }
    $target = ""
    if ($server.url) {
      try {
        $target = ([Uri]$server.url).Host
      } catch {
        $target = "<invalid-url>"
      }
    } elseif ($server.command) {
      $target = $server.command
    }

    $envKeys = @()
    if ($server.env) {
      $envKeys = $server.env.PSObject.Properties.Name | Sort-Object
    }

    $present = if ($codexServerNames -contains $prop.Name) { "yes" } else { "no" }
    $rows += "| $(Escape-TableCell $prop.Name) | $present | $(Escape-TableCell $type) | $(Escape-TableCell $target) | $(Escape-TableCell ($envKeys -join ', ')) |"
  }

  Write-Utf8NoBom -Path (Join-Path $DestDir "index.md") -Value ($rows -join "`n")
}

function Write-RunbookIndex {
  param(
    [string]$WorkRoot,
    [string]$DestDir
  )

  $patterns = @("*RUNBOOK*.md", "*PLAYBOOK*.md")
  $roots = @(
    (Join-Path $WorkRoot "runbooks"),
    (Join-Path $WorkRoot "agency-os\docs\operations"),
    (Join-Path $WorkRoot "lobster-factory\docs"),
    (Join-Path $WorkRoot "lobster-factory\docs\operations")
  )

  $files = New-Object System.Collections.Generic.List[string]
  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) {
      continue
    }

    if ((Split-Path -Leaf $root) -eq "runbooks") {
      Get-ChildItem -File -LiteralPath $root -Filter "*.md" | ForEach-Object { $files.Add($_.FullName) }
    }

    foreach ($pattern in $patterns) {
      Get-ChildItem -Recurse -File -LiteralPath $root -Filter $pattern | ForEach-Object { $files.Add($_.FullName) }
    }
  }

  $rows = @(
    "# Runbook Index"
    ""
    "Use this index to locate repo runbooks. Read only the runbook relevant to the current operation before acting."
    ""
    "| Runbook | Path |"
    "|---|---|"
  )

  $files |
    Sort-Object -Unique |
    ForEach-Object {
      $rows += "| $(Escape-TableCell (Split-Path -Leaf $_)) | `$_` |"
    }

  Write-Utf8NoBom -Path (Join-Path $DestDir "index.md") -Value ($rows -join "`n")
}

function Write-PluginIndex {
  param(
    [string]$PluginMarketplacesDir,
    [string]$DestDir
  )

  $rows = @(
    "# Claude Plugin Index"
    ""
    "Claude plugins are not installed as native Codex plugins by this migration. Use this index to find plugin source prompts, commands, and skills if a user asks for a migrated Claude plugin workflow."
    ""
    "| Plugin | Agents | Commands | Skills | Source |"
    "|---|---:|---:|---:|---|"
  )

  if (Test-Path -LiteralPath $PluginMarketplacesDir) {
    Get-ChildItem -Directory -Recurse -LiteralPath $PluginMarketplacesDir |
      Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "README.md") } |
      Sort-Object FullName |
      ForEach-Object {
        $agentCount = 0
        $commandCount = 0
        $skillCount = 0
        $agentsDir = Join-Path $_.FullName "agents"
        $commandsDir = Join-Path $_.FullName "commands"
        $skillsDir = Join-Path $_.FullName "skills"
        if (Test-Path -LiteralPath $agentsDir) {
          $agentCount = @(Get-ChildItem -File -LiteralPath $agentsDir -Filter "*.md").Count
        }
        if (Test-Path -LiteralPath $commandsDir) {
          $commandCount = @(Get-ChildItem -File -LiteralPath $commandsDir -Filter "*.md").Count
        }
        if (Test-Path -LiteralPath $skillsDir) {
          $skillCount = @(Get-ChildItem -Recurse -File -LiteralPath $skillsDir -Filter "SKILL.md").Count
        }
        if (($agentCount + $commandCount + $skillCount) -gt 0) {
          $rows += "| $(Escape-TableCell $_.Name) | $agentCount | $commandCount | $skillCount | `"$($_.FullName)`" |"
        }
      }
  }

  Write-Utf8NoBom -Path (Join-Path $DestDir "index.md") -Value ($rows -join "`n")
}

function Write-ClaudeCompatSkill {
  param(
    [string]$SkillPath,
    [string]$SourceClaudeHome
  )

  $content = @'
---
name: claude-compat
description: Use when the user asks Codex to behave like the migrated Claude Code setup, invokes Claude slash commands such as /review, /ao-resume, /wp-maintenance, asks for named Claude agents such as planner, critic, debugger, frontend-designer, devops-engineer, db-expert, or wants migrated Claude agents, commands, runbooks, hooks, plugins, or MCP workflow parity.
---

# Claude Compatibility Layer

Use this skill as a compatibility layer over the migrated Claude Code assets from `__CLAUDE_HOME__`.

## Dispatch

1. Classify the request as agent, command, runbook, hook, plugin, MCP, or project instruction.
2. Read the relevant index first:
   - Agents: `references/agents/index.md`
   - Commands: `references/commands/index.md`
   - Hooks: `references/hooks/index.md`
   - MCP: `references/mcp/index.md`
   - Plugins: `references/plugins/index.md`
   - Runbooks: `references/runbooks/index.md`
3. Load only the source file needed for the current request.
4. Execute with Codex rules, tools, sandbox permissions, and current developer instructions.

## Agents

Claude agents are migrated as prompt references, not native Codex `agent_type` values. When a user asks for a named Claude agent, read `references/agents/<agent>.md` and use it as role guidance in the current Codex agent.

If the user explicitly asks for sub-agents or parallel agent work, map Claude read-only agents to Codex `explorer` where appropriate and implementation agents to Codex `worker`. Keep delegated work concrete and bounded.

## Commands

For a slash command such as `/review`, read `references/commands/review.md` and follow its steps using Codex tools. If the command asks for a Claude subagent, emulate the role locally unless the user explicitly asked for subagents.

## Hooks

Claude hooks are copied for reference but do not execute automatically in Codex. Treat them as manual checks or as source material for future CI/git-hook automation. Do not assume a hook has protected the workspace unless you actually ran the equivalent check.

## MCP

The MCP migration index contains names and env key names only. Do not print token values from `config.toml`, `.mcp.json`, `mcp.json`, or `.credentials.json`. If a migrated MCP server is not exposed in the current Codex tool list, use `tool_search` first.

## Runbooks

Runbooks remain in the repo. Use `references/runbooks/index.md` to locate the right file, then read the target runbook directly from `D:\Work`.
'@

  $content = $content.Replace("__CLAUDE_HOME__", $SourceClaudeHome)
  Write-Utf8NoBom -Path (Join-Path $SkillPath "SKILL.md") -Value $content
}

function Write-WrapperSkill {
  param(
    [string]$SkillPath,
    [string]$Name,
    [string]$Description,
    [string]$SourcePath,
    [switch]$IsArchive
  )

  Ensure-Directory $SkillPath
  $sourceInstruction = if ($IsArchive) {
    "The source is a Claude ``.skill`` archive at ``$SourcePath``. When this wrapper triggers, inspect it with ``tar -tf`` and read files with ``tar -xOf``, starting with the packaged ``SKILL.md``; then follow the source workflow."
  } else {
    "The source skill lives at ``$SourcePath``. When this wrapper triggers, read that ``SKILL.md`` and follow the source workflow directly."
  }

  $content = @"
---
name: $Name
description: >-
  $Description
---

# $Name

This is a Codex wrapper for a Claude skill. It intentionally keeps the operational content in one source location instead of duplicating the Claude skill into Codex.

$sourceInstruction

Use Codex tools, permissions, and current developer instructions while applying the source workflow. Do not edit the Claude source unless the user explicitly asks to update the shared skill.
"@

  Write-Utf8NoBom -Path (Join-Path $SkillPath "SKILL.md") -Value $content
}

function Get-CodexSkillDescription {
  param(
    [string]$Name,
    [string]$SourceSkillMd
  )

  $overrides = @{
    "feature-plan" = "Plan a new feature by analyzing requirements, decomposing technical work, assessing impact, and updating planning docs. Use when the user asks for feature design, a new feature plan, implementation breakdown, scope sizing, or plan.md/docs updates before coding."
    "strategy-review" = "Run a multi-angle strategic decision review for tool selection, client engagement, business strategy, vendor selection, integration decisions, pre-mortems, red-blue debate, and should-we questions that need tradeoff analysis and a tracked decision record."
    "ai-decision-intelligence" = "Run structured decision intelligence for tool selection, architecture review, implementation planning, rollout planning, build-vs-buy, migration strategy, business strategy, and other choices with real tradeoffs. Use for compare X vs Y, help me decide, best stack, risk register, and ranked recommendation requests."
  }

  if ($overrides.ContainsKey($Name)) {
    return $overrides[$Name]
  }

  $description = ""
  if (Test-Path -LiteralPath $SourceSkillMd) {
    $fm = Get-MarkdownFrontmatter $SourceSkillMd
    if ($fm.description) {
      $description = $fm.description
    }
  }

  if ([string]::IsNullOrWhiteSpace($description)) {
    $description = "Use the migrated Claude $Name workflow from the shared Claude source directory."
  }

  $description = ($description -replace "[<>]", "" -replace "\s+", " ").Trim()
  if ($description.Length -gt 950) {
    $description = $description.Substring(0, 950).Trim()
  }

  return $description
}

if ([string]::IsNullOrWhiteSpace($WorkRoot)) {
  if ($env:MONOREPO_ROOT -and (Test-Path -LiteralPath $env:MONOREPO_ROOT)) {
    $WorkRoot = (Resolve-Path -LiteralPath $env:MONOREPO_ROOT).Path
  } elseif (Test-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..\.git")) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..")).Path
  } elseif (Test-Path -LiteralPath "D:\Work") {
    $WorkRoot = "D:\Work"
  } else {
    throw "Cannot resolve WorkRoot. Pass -WorkRoot <repo path>."
  }
}

if ([string]::IsNullOrWhiteSpace($ClaudeHome)) {
  $repoClaudeHome = Join-Path $WorkRoot ".claude"
  if (Test-Path -LiteralPath $repoClaudeHome) {
    $ClaudeHome = $repoClaudeHome
  } else {
    $ClaudeHome = "$env:USERPROFILE\.claude"
  }
}

if (-not (Test-Path -LiteralPath $ClaudeHome)) {
  throw "Claude home not found: $ClaudeHome"
}
if (-not (Test-Path -LiteralPath $CodexHome)) {
  throw "Codex home not found: $CodexHome"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $CodexHome "backups\claude-migration-$timestamp"
$skillRoot = Join-Path $CodexHome "skills"
$compatSkill = Join-Path $skillRoot "claude-compat"

Ensure-Directory $skillRoot
Ensure-Directory $backupRoot

$claudeSkills = Join-Path $ClaudeHome "skills"
$installedSkills = New-Object System.Collections.Generic.List[string]

if ($Mode -eq "copy") {
  Get-ChildItem -Directory -LiteralPath $claudeSkills |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md") } |
    Sort-Object Name |
    ForEach-Object {
      $destination = Join-Path $skillRoot $_.Name
      Backup-And-ReplaceDirectory -Path $destination -BackupRoot $backupRoot -CodexRoot $CodexHome
      Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force
      $installedSkills.Add($_.Name)
    }

  $featurePlan = Join-Path $skillRoot "feature-plan"
  if (Test-Path -LiteralPath $featurePlan) {
    Set-SkillFrontmatter -SkillPath $featurePlan -Name "feature-plan" -Description (Get-CodexSkillDescription -Name "feature-plan" -SourceSkillMd (Join-Path $claudeSkills "feature-plan\SKILL.md"))
  }

  $strategyReview = Join-Path $skillRoot "strategy-review"
  if (Test-Path -LiteralPath $strategyReview) {
    Set-SkillFrontmatter -SkillPath $strategyReview -Name "strategy-review" -Description (Get-CodexSkillDescription -Name "strategy-review" -SourceSkillMd (Join-Path $claudeSkills "strategy-review\SKILL.md"))
  }

  Get-ChildItem -File -LiteralPath $claudeSkills -Filter "*.skill" |
    Sort-Object Name |
    ForEach-Object {
      $topLevel = (& tar -tf $_.FullName | Select-Object -First 1) -replace "/.*$", ""
      if ([string]::IsNullOrWhiteSpace($topLevel)) {
        throw "Unable to determine top-level folder for archive: $($_.FullName)"
      }
      $destination = Join-Path $skillRoot $topLevel
      Backup-And-ReplaceDirectory -Path $destination -BackupRoot $backupRoot -CodexRoot $CodexHome
      & tar -xf $_.FullName -C $skillRoot
      $installedSkills.Add($topLevel)
    }

  $decisionSkill = Join-Path $skillRoot "ai-decision-intelligence"
  if (Test-Path -LiteralPath $decisionSkill) {
    Set-SkillFrontmatter -SkillPath $decisionSkill -Name "ai-decision-intelligence" -Description (Get-CodexSkillDescription -Name "ai-decision-intelligence" -SourceSkillMd "")
  }
} else {
  Get-ChildItem -Directory -LiteralPath $claudeSkills |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md") } |
    Sort-Object Name |
    ForEach-Object {
      $destination = Join-Path $skillRoot $_.Name
      Backup-And-ReplaceDirectory -Path $destination -BackupRoot $backupRoot -CodexRoot $CodexHome
      $sourceSkillMd = Join-Path $_.FullName "SKILL.md"
      $description = Get-CodexSkillDescription -Name $_.Name -SourceSkillMd $sourceSkillMd
      Write-WrapperSkill -SkillPath $destination -Name $_.Name -Description $description -SourcePath $sourceSkillMd
      $installedSkills.Add($_.Name)
    }

  Get-ChildItem -File -LiteralPath $claudeSkills -Filter "*.skill" |
    Sort-Object Name |
    ForEach-Object {
      $topLevel = (& tar -tf $_.FullName | Select-Object -First 1) -replace "/.*$", ""
      if ([string]::IsNullOrWhiteSpace($topLevel)) {
        throw "Unable to determine top-level folder for archive: $($_.FullName)"
      }
      $destination = Join-Path $skillRoot $topLevel
      Backup-And-ReplaceDirectory -Path $destination -BackupRoot $backupRoot -CodexRoot $CodexHome
      $description = Get-CodexSkillDescription -Name $topLevel -SourceSkillMd ""
      Write-WrapperSkill -SkillPath $destination -Name $topLevel -Description $description -SourcePath $_.FullName -IsArchive
      $installedSkills.Add($topLevel)
    }
}

Backup-And-ReplaceDirectory -Path $compatSkill -BackupRoot $backupRoot -CodexRoot $CodexHome
$initSkill = Join-Path $CodexHome "skills\.system\skill-creator\scripts\init_skill.py"
if (Test-Path -LiteralPath $initSkill) {
  $env:PYTHONUTF8 = "1"
  & python $initSkill "claude-compat" --path $skillRoot --resources references --interface "display_name=Claude Compat" --interface "short_description=Use migrated Claude workflows." --interface "default_prompt=Use the migrated Claude compatibility layer for this request."
} else {
  Ensure-Directory $compatSkill
  Ensure-Directory (Join-Path $compatSkill "references")
}

$references = Join-Path $compatSkill "references"
$agentDest = Join-Path $references "agents"
$commandDest = Join-Path $references "commands"
$hookDest = Join-Path $references "hooks"
$mcpDest = Join-Path $references "mcp"
$runbookDest = Join-Path $references "runbooks"
$pluginDest = Join-Path $references "plugins"

Ensure-Directory $agentDest
Ensure-Directory $commandDest
Ensure-Directory $hookDest
Ensure-Directory $mcpDest
Ensure-Directory $runbookDest
Ensure-Directory $pluginDest

if ($Mode -eq "copy") {
  Copy-FilesByFilter -SourceDir (Join-Path $ClaudeHome "agents") -Filter "*.md" -DestinationDir $agentDest
  Copy-FilesByFilter -SourceDir (Join-Path $ClaudeHome "commands") -Filter "*.md" -DestinationDir $commandDest
  Copy-FilesByFilter -SourceDir (Join-Path $ClaudeHome "hooks") -Filter "*.js" -DestinationDir $hookDest
  Copy-FilesByFilter -SourceDir (Join-Path $ClaudeHome "hooks") -Filter "*.ps1" -DestinationDir $hookDest
  Copy-FilesByFilter -SourceDir (Join-Path $ClaudeHome "hooks") -Filter "*.sh" -DestinationDir $hookDest
  Copy-FilesByFilter -SourceDir (Join-Path $ClaudeHome "hooks") -Filter "README*.md" -DestinationDir $hookDest
  Copy-FilesByFilter -SourceDir (Join-Path $ClaudeHome "hooks") -Filter "hooks.json" -DestinationDir $hookDest
}

Write-ClaudeCompatSkill -SkillPath $compatSkill -SourceClaudeHome $ClaudeHome
Write-AgentIndex -SourceDir (Join-Path $ClaudeHome "agents") -DestDir $agentDest -UseSourceLinks ($Mode -eq "linked")
Write-CommandIndex -SourceDir (Join-Path $ClaudeHome "commands") -DestDir $commandDest -UseSourceLinks ($Mode -eq "linked")
Write-HookIndex -ClaudeSettingsPath (Join-Path $ClaudeHome "settings.json") -DestDir $hookDest
Write-McpIndex -ClaudeMcpPath (Join-Path $ClaudeHome "mcp.json") -CodexConfigPath (Join-Path $CodexHome "config.toml") -DestDir $mcpDest
Write-RunbookIndex -WorkRoot $WorkRoot -DestDir $runbookDest
Write-PluginIndex -PluginMarketplacesDir (Join-Path $ClaudeHome "plugins\marketplaces") -DestDir $pluginDest

$globalAgents = Join-Path $CodexHome "AGENTS.md"
$globalAgentsContent = @'
# User Codex Instructions

- Use the `claude-compat` skill when the user asks for migrated Claude agents, slash commands, hooks, runbooks, plugins, or Claude Code workflow parity.
- Claude source content lives in `D:\Work\.claude`; user Codex skills are thin wrappers/indexes, not independent copies.
- This file is the user-level Codex instruction source. Do not add Codex-only instructions or migration helpers to the repo root.
- Project-specific instructions may live in nested repo `AGENTS.md` files when a project intentionally owns them.
- The user-level MCP config may contain live secrets. Never print raw `config.toml`, `.mcp.json`, `mcp.json`, `.credentials.json`, or token-bearing env values.
- Shared MCP configuration is managed from `D:\Work\mcp\registry.template.json` and `D:\Work\scripts\sync-mcp-config.ps1`.
'@
Write-Utf8NoBom -Path $globalAgents -Value $globalAgentsContent

$validationScript = Join-Path $CodexHome "skills\.system\skill-creator\scripts\quick_validate.py"
$validationResults = New-Object System.Collections.Generic.List[string]
if (Test-Path -LiteralPath $validationScript) {
  $env:PYTHONUTF8 = "1"
  $skillsToValidate = @($installedSkills | Sort-Object -Unique) + @("claude-compat")
  foreach ($skillName in $skillsToValidate) {
    $path = Join-Path $skillRoot $skillName
    if (Test-Path -LiteralPath $path) {
      $output = & python $validationScript $path 2>&1
      if ($LASTEXITCODE -eq 0) {
        $validationResults.Add("$skillName`: ok")
      } else {
        $validationResults.Add("$skillName`: failed - $($output -join ' ')")
      }
    }
  }
}

$summary = [ordered]@{
  timestamp = $timestamp
  mode = $Mode
  claudeHome = $ClaudeHome
  codexHome = $CodexHome
  backupRoot = $backupRoot
  installedSkills = @($installedSkills | Sort-Object -Unique)
  compatibilitySkill = $compatSkill
  validation = @($validationResults)
}

$summaryPath = Join-Path $compatSkill "migration-summary.json"
Write-Utf8NoBom -Path $summaryPath -Value ($summary | ConvertTo-Json -Depth 5)

Write-Host "Installed skills:" (($installedSkills | Sort-Object -Unique) -join ", ")
Write-Host "Installed compatibility skill: claude-compat"
Write-Host "Backup root: $backupRoot"
Write-Host "Validation:"
$validationResults | ForEach-Object { Write-Host " - $_" }
