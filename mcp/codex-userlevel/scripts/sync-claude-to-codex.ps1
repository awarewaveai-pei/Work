param(
  [string]$ClaudeHome = "",
  [string]$CodexHome = "$env:USERPROFILE\.codex",
  [string]$WorkRoot = "",
  [ValidateSet("linked", "copy")]
  [string]$Mode = "linked"
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
. (Join-Path $PSScriptRoot 'codex-bridge-lib.ps1')

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Value
  )

  # Normalize to LF before writing. Root cause of a 40-file phantom-dirty `git status`
  # (found 2026-09-20): `.gitattributes` stores `*.ps1` as CRLF, so every here-string in
  # THIS script carries CRLF, and the generated `.md`/`.toml` inherited it -- while
  # `.gitattributes` wants those as LF. Git then reported 40+ files modified with an
  # empty `git diff`, which is both noise and a real hazard for AO-CLOSE partial staging.
  # Normalizing at the single write point fixes the whole class instead of the files we
  # happened to notice; `git add --renormalize` only cleans up until the next sync run.
  $normalized = $Value -replace "`r`n", "`n"
  [System.IO.File]::WriteAllText($Path, $normalized, $script:Utf8NoBom)
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

function Backup-And-ReplaceFile {
  param(
    [string]$Path,
    [string]$BackupRoot,
    [string]$AllowedRoot
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Assert-ChildPath -Path $Path -Root $AllowedRoot
  Ensure-Directory $BackupRoot
  Copy-Item -LiteralPath $Path -Destination (Join-Path $BackupRoot (Split-Path -Leaf $Path)) -Force
  Remove-Item -LiteralPath $Path -Force
}

function Escape-TableCell {
  param([AllowNull()][string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  return ($Value -replace "`r?`n", " " -replace "\|", "\|" -replace "\s+", " ").Trim()
}

function ConvertTo-TomlBasicString {
  param([AllowNull()][string]$Value)

  if ($null -eq $Value) { return '""' }
  $escaped = $Value.Replace('\', '\\').Replace('"', '\"')
  $escaped = $escaped -replace "`r?`n", ' '
  return '"' + $escaped + '"'
}

function Write-NativeAgentBridge {
  param(
    [string]$SourcePath,
    [string]$DestinationPath,
    [string]$WorkRoot
  )

  $frontmatter = Get-MarkdownFrontmatter $SourcePath
  $name = if ($frontmatter.name) { [string]$frontmatter.name } else { [IO.Path]::GetFileNameWithoutExtension($SourcePath) }
  $description = if ($frontmatter.description) { [string]$frontmatter.description } else { "Use the shared Claude agent '$name' through its direct source prompt." }
  # Repo-relative, not absolute: these bridges are COMMITTED, so a baked-in `D:\Work\...`
  # sends any other checkout -- notably a Linux Codex container -- at a path that does not
  # exist. The `# source:` comment already used the relative form; the instructions did not.
  $relativeSource = Get-RepoRelativePath -Path $SourcePath -WorkRoot $WorkRoot
  $charterPath = 'mcp/claude-userlevel/SUBAGENT_CHARTER.md'
  $instructions = @"
This is a generated Codex bridge for Claude agent '$name'. Before any task work,
read the complete source prompt at '$relativeSource' and the shared engineering charter
at '$charterPath' (both relative to the repo root). Follow both as developer instructions,
then perform the assigned task using Codex tools and the current parent sandbox/approval
policy. Do not maintain or infer a second copy of either source.
"@.Trim()

  $content = @(
    '# GENERATED: Claude-first native agent bridge. Do not edit by hand.'
    "# source: $relativeSource"
    "name = $(ConvertTo-TomlBasicString $name)"
    "description = $(ConvertTo-TomlBasicString $description)"
    "developer_instructions = '''"
    $instructions
    "'''"
    ''
  ) -join "`n"

  Write-Utf8NoBom -Path $DestinationPath -Value $content
}

function Sync-NativeAgentBridges {
  param(
    [string]$SourceDir,
    [string]$DestinationDir,
    [string]$WorkRoot,
    [string]$BackupRoot
  )

  Ensure-Directory $DestinationDir
  $bridgeBackupRoot = Join-Path $BackupRoot 'native-agent-bridges'
  $sourceNames = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)

  Get-ChildItem -File -LiteralPath $SourceDir -Filter '*.md' |
    Where-Object { $_.Name -notmatch '^(README|AGENT_INDEX)' } |
    Sort-Object Name |
    ForEach-Object {
      $destinationName = "$($_.BaseName).toml"
      $sourceNames.Add($destinationName) | Out-Null
      $destination = Join-Path $DestinationDir $destinationName
      Backup-And-ReplaceFile -Path $destination -BackupRoot (Join-Path $BackupRoot (Get-AgentBridgeBackupFolder -Destination $destination)) -AllowedRoot $DestinationDir
      Write-NativeAgentBridge -SourcePath $_.FullName -DestinationPath $destination -WorkRoot $WorkRoot
    }

  Get-ChildItem -File -LiteralPath $DestinationDir -Filter '*.toml' |
    Where-Object {
      $firstLine = Get-Content -LiteralPath $_.FullName -Encoding UTF8 -TotalCount 1
      $firstLine -eq '# GENERATED: Claude-first native agent bridge. Do not edit by hand.' -and -not $sourceNames.Contains($_.Name)
    } |
    ForEach-Object {
      Backup-And-ReplaceFile -Path $_.FullName -BackupRoot $bridgeBackupRoot -AllowedRoot $DestinationDir
    }

  return @($sourceNames | Sort-Object)
}

# Retention may prune backups of generated output, so a destination that is NOT
# generated (someone edited the wrapper by hand) must land in a kept legacy-* folder.
function Get-SkillBridgeBackupFolder {
  param([string]$Destination)
  $skillMd = Join-Path $Destination 'SKILL.md'
  if (Test-Path -LiteralPath $skillMd) {
    $text = Get-Content -Raw -Encoding UTF8 -LiteralPath $skillMd
    if ($text -match 'generated Codex wrapper|Codex wrapper for a Claude skill') { return 'repo-skill-bridges' }
    return 'legacy-manual-skill-edits'
  }
  return 'repo-skill-bridges'
}

function Get-AgentBridgeBackupFolder {
  param([string]$Destination)
  if (Test-Path -LiteralPath $Destination) {
    $first = Get-Content -LiteralPath $Destination -Encoding UTF8 -TotalCount 1
    if ($first -ne '# GENERATED: Claude-first native agent bridge. Do not edit by hand.') { return 'legacy-manual-agent-edits' }
  }
  return 'native-agent-bridges'
}

# Emit a path the wrapper can still resolve on another machine. The wrappers are
# COMMITTED, so an absolute `D:\Work\...` inside one breaks the moment it is read from a
# different checkout or a Linux container -- which is exactly where Codex runs. Repo-
# relative is the form every other reference in this repo already uses.
function Get-RepoRelativePath {
  param(
    [string]$Path,
    [string]$WorkRoot
  )

  $full = [IO.Path]::GetFullPath($Path)
  $root = [IO.Path]::GetFullPath($WorkRoot).TrimEnd('\', '/')
  if ($full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($root.Length + 1).Replace('\', '/')
  }
  # Outside the repo (e.g. a user-level Claude home on a machine without the junction):
  # an absolute path is the only thing that resolves, so say so rather than emit a
  # relative path that silently points at nothing.
  return $full
}

function Write-ClaudeCommandSkillWrapper {
  param(
    [string]$SkillPath,
    [string]$Name,
    [string]$CommandPath,
    [string]$CommandName,
    [string]$Description
  )

  Ensure-Directory $SkillPath
  if ([string]::IsNullOrWhiteSpace($Description)) {
    $Description = "Execute the shared Claude command /$CommandName using its direct source."
  }
  $content = @"
---
name: $Name
description: >-
  $Description
---

# $Name

This is a generated Codex wrapper for the shared Claude command ``/$CommandName``. Read
``$CommandPath`` in full, then execute it with current Codex tools, permissions, and
project instructions. The Claude command file remains the only human-maintained source.
"@
  Write-Utf8NoBom -Path (Join-Path $SkillPath 'SKILL.md') -Value $content
}

function Get-HookCommands {
  param([object]$Config)
  $commands = @()
  if ($Config -and $Config.hooks) {
    foreach ($event in $Config.hooks.PSObject.Properties) {
      foreach ($group in @($event.Value)) {
        foreach ($hook in @($group.hooks)) {
          if ($hook.type -eq 'command') {
            $commands += [string]$hook.command
            if ($hook.PSObject.Properties.Name -contains 'commandWindows') { $commands += [string]$hook.commandWindows }
          }
        }
      }
    }
  }
  return $commands
}

# ~/.codex/hooks.json is GENERATED from the canonical source (user-level, like
# Claude's ~/.claude/settings.json hooks). Rewritten only when content differs,
# because any change invalidates Codex's per-hook trust and needs /hooks review.
function Write-CodexUserHooks {
  param(
    [string]$CodexHome,
    [string]$WorkRoot,
    [string]$BackupRoot
  )

  $path = Join-Path $CodexHome 'hooks.json'
  $json = Get-CodexUserHooksJson -WorkRoot $WorkRoot
  $existing = if (Test-Path -LiteralPath $path) { Get-Content -Raw -Encoding UTF8 -LiteralPath $path } else { '' }
  if ($existing -and $existing.Trim()) {
    if ($existing -eq $json) { return 'unchanged' }
    $commands = @()
    try { $commands = Get-HookCommands (ConvertFrom-Json $existing) } catch { $commands = @('<unparseable>') }
    $foreign = @($commands | Where-Object { $_ -notmatch 'claude-userlevel[\\/]+hooks[\\/]' -and $_ -notmatch [regex]::Escape($CodexHome.TrimEnd('\') + '\hooks\') })
    if ($foreign.Count -gt 0) {
      throw "Refusing to overwrite ${path}: it contains $($foreign.Count) non-AwareWave or unparseable hook handler(s). Move them into the canonical hook source or out of this file, then re-run."
    }
    Backup-And-ReplaceFile -Path $path -BackupRoot (Join-Path $BackupRoot 'legacy-user-hooks') -AllowedRoot $CodexHome
  }
  Write-Utf8NoBom -Path $path -Value $json
  return 'written'
}

function Remove-LegacyCodexHookRuntime {
  param(
    [string]$CodexHome,
    [string]$CanonicalHookRoot,
    [string]$BackupRoot
  )

  $legacyHookRoot = Join-Path $CodexHome 'hooks'
  if (Test-Path -LiteralPath $legacyHookRoot) {
    $unexpected = @(
      Get-ChildItem -LiteralPath $legacyHookRoot -File -Recurse | Where-Object {
        $relative = $_.FullName.Substring($legacyHookRoot.Length).TrimStart('\')
        $directSource = Join-Path $CanonicalHookRoot $relative
        # Early Codex migration flattened rule files into hooks/. Canonical
        # source stores them under hooks/rules/. Treat both layouts as managed
        # only when the corresponding source exists; anything else blocks
        # deletion and is preserved for manual ownership review.
        $ruleSource = Join-Path (Join-Path $CanonicalHookRoot 'rules') $relative
        # These two names are v1 runner dependencies retired by the v2 source
        # (documented in hooks/README.md). They are safe to archive/remove only
        # because this migration has already verified the global config invokes
        # runner.js rather than either standalone entry point.
        $retiredLegacy = $relative -in @('_verify-shared.js', 'log-error.sh')
        -not ($retiredLegacy -or (Test-Path -LiteralPath $directSource) -or (Test-Path -LiteralPath $ruleSource))
      }
    )
    if ($unexpected.Count -gt 0) {
      $sample = ($unexpected | Select-Object -First 3 -ExpandProperty FullName) -join '; '
      throw "Refusing to remove $legacyHookRoot because it contains $($unexpected.Count) non-canonical file(s): $sample"
    }
    Backup-And-ReplaceDirectory -Path $legacyHookRoot -BackupRoot (Join-Path $BackupRoot 'legacy-global-hooks') -CodexRoot $CodexHome
  }
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
    'These are Claude-first agent sources. The sync also creates thin native Codex agent bridges in `.codex/agents/`; each bridge reads the matching source before it works.'
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

function Write-CommandIndex {
  param(
    [string]$SourceDir,
    [string]$DestDir,
    [bool]$UseSourceLinks = $false
  )

  $rows = @(
    "# Claude Command Index"
    ""
    'These are migrated Claude slash-command runbooks. For a user request like `/review`, read the matching Markdown file and execute the steps with Codex tools and permission rules.'
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
    'The canonical hook implementation lives under `mcp/claude-userlevel/hooks`. Claude runs its synced ~/.claude/hooks copy; Codex runs the source directly through the generated ~/.codex/hooks.json (`--host=codex`, translated by hooks/lib/codex-adapter.js). Codex skips any hook whose trust hash is stale, so a hook only protects the workspace after /hooks trust and a fresh ~/.codex/awarewave-hook-heartbeat.json entry.'
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
      $rows += "| $(Escape-TableCell (Split-Path -Leaf $_)) | ``$_`` |"
    }

  Write-Utf8NoBom -Path (Join-Path $DestDir "index.md") -Value ($rows -join "`n")
}

function Write-ProjectIndex {
  param(
    [string]$WorkRoot,
    [string]$DestDir,
    [string]$ClaudeHome
  )

  $rows = @(
    "# Claude-First Project Sources"
    ""
    "These files are the human-maintained Claude-first sources for repo-level operating rules. Codex must read them as source references instead of maintaining a separate copy."
    ""
    "| Source | Path | Use |"
    "|---|---|---|"
  )

  $claudeMd = Join-Path $WorkRoot "CLAUDE.md"
  if (Test-Path -LiteralPath $claudeMd) {
    $rows += "| CLAUDE.md | $(Escape-TableCell $claudeMd) | Legacy Claude project instructions and repo operating rules. Read when a request depends on project workflow, AO-RESUME/AO-CLOSE behavior, git discipline, MCP policy, risk gates, or Agency OS operating context. |"
  }

  $agencyAgents = Join-Path $WorkRoot "agency-os\AGENTS.md"
  if (Test-Path -LiteralPath $agencyAgents) {
    $rows += "| agency-os AGENTS | $(Escape-TableCell $agencyAgents) | Agency OS local instructions referenced from CLAUDE.md. Read for Agency OS-specific workflow and governance context. |"
  }

  if (Test-Path -LiteralPath $ClaudeHome) {
    $rows += "| Claude assets | $(Escape-TableCell $ClaudeHome) | Shared Claude agents, commands, hooks, skills, and plugin assets. Human-maintained source; Codex wrappers/indexes are generated from here. |"
  }

  Write-Utf8NoBom -Path (Join-Path $DestDir "index.md") -Value ($rows -join "`n")
}

# Lists only plugins actually INSTALLED for Claude (installed_plugins.json), not
# the marketplace catalog: listing uninstalled catalog entries told Codex that
# dozens of unavailable plugins existed.
function Write-PluginIndex {
  param(
    [string]$InstalledPluginsPath,
    [string]$DestDir
  )

  $notApplicable = @{ 'codex@openai-codex' = 'Claude-side bridge that calls Codex; inside Codex use Codex itself.' }
  $rows = @(
    "# Claude Plugin Index"
    ""
    "Installed Claude Code plugins on this machine. They are not native Codex plugins; claude.ai account connectors (Gmail, Drive, Notion, Adobe, ...) are account-level and never appear here."
    ""
    "| Plugin | Version | Codex use | Install path |"
    "|---|---|---|---|"
  )

  if (Test-Path -LiteralPath $InstalledPluginsPath) {
    $installed = Get-Content -Raw -Encoding UTF8 -LiteralPath $InstalledPluginsPath | ConvertFrom-Json
    $plugins = if ($installed.PSObject.Properties.Name -contains 'plugins') { $installed.plugins } else { $installed }
    foreach ($p in ($plugins.PSObject.Properties | Sort-Object Name)) {
      $entry = @($p.Value) | Select-Object -First 1
      $use = if ($notApplicable.ContainsKey($p.Name)) { $notApplicable[$p.Name] } else { 'Read its skills/commands under the install path when the user asks for this plugin.' }
      $rows += "| $(Escape-TableCell $p.Name) | $(Escape-TableCell ([string]$entry.version)) | $(Escape-TableCell $use) | $(Escape-TableCell ([string]$entry.installPath)) |"
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
   - Project instructions: `references/project/index.md`
   - Hooks: `references/hooks/index.md`
   - MCP: `references/mcp/index.md`
   - Plugins: `references/plugins/index.md`
   - Runbooks: `references/runbooks/index.md`
3. Load only the source file needed for the current request.
4. Execute with Codex rules, tools, sandbox permissions, and current developer instructions.

## Agents

Each Claude agent has a generated native Codex bridge in `D:\Work\.codex\agents`. The bridge reads the matching source prompt and the shared subagent charter before it works. When a user asks for a named Claude agent, look up its direct source path in `references/agents/index.md`; do not try to read a non-existent copied file under `references/agents/`.

If the user explicitly asks for sub-agents or parallel agent work, map Claude read-only agents to Codex `explorer` where appropriate and implementation agents to Codex `worker`. Keep delegated work concrete and bounded.

## Project Instructions

Claude is the human-maintained source of truth. For repo-level workflow, read `references/project/index.md`, then read the referenced `CLAUDE.md` or nested `AGENTS.md` source directly. Do not copy `CLAUDE.md` into Codex. Codex system/developer instructions and explicit user instructions still take precedence over legacy Claude wording.

## Commands

For a slash command such as `/review`, read its direct source path in `references/commands/index.md`, then follow its steps using Codex tools. If the command asks for a Claude subagent, emulate the role locally unless the user explicitly asked for subagents.

## Hooks

The canonical hook implementation is `D:\Work\mcp\claude-userlevel\hooks`. Codex runs it through the generated user-level `~/.codex/hooks.json` (`--host=codex`; `hooks/lib/codex-adapter.js` maps `apply_patch` to Edit and `spawn_agent` to Agent; Codex sends shell results with the exit code stripped (openai/codex#34289), so repeat-failure-guard cannot count failures here). Codex silently skips hooks whose trust hash is stale: if `/hooks` shows AwareWave hooks as new or changed, stop and ask the operator to trust them. A hook BLOCK (exit 2) is a real governance stop — read the message and follow it (e.g. add `# CONFIRMED-HIGH-RISK: <reason>` only after the operator approved). Do not assume a hook protected the workspace unless `~/.codex/awarewave-hook-heartbeat.json` shows the event ran this session.

## Claude tool to Codex equivalent

Claude command/agent/skill sources name Claude tools. Translate, do not skip the step:

| Claude source says | Do this in Codex |
|---|---|
| `Agent` / `subagent_type: X` | `spawn_agent` with `agent_type: X` (native bridge in `D:\Work\.codex\agents`) |
| `Skill` / `/skill-name` | read the matching `SKILL.md` (repo `.agents/skills` wrapper points at the Claude source) |
| `Bash` | shell command (hooks see it as Bash) |
| `Read` / `Grep` / `Glob` | `Get-Content` / `rg` / `Get-ChildItem` via shell |
| `Edit` / `Write` | `apply_patch` (hooks see it as Edit) |
| `WebFetch` / `WebSearch` | Codex web search |
| `TodoWrite` / task tools | `update_plan` |
| `AskUserQuestion` | ask one question in chat |
| `mcp__<server>__<tool>` | the same registry-managed MCP server in Codex (`references/mcp/index.md`) |
| `Artifact`, claude.ai connectors | not available in Codex; write a file in the repo instead |

## Cross-model review

The oracle must be the OTHER model. When Codex wrote the change, run `/claude-review` (`D:\Work\.claude\commands\claude-review.md`); never `/codex-review`, which asks Codex to review itself.

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
    "The source is a Claude ``.skill`` archive (zip) at ``$SourcePath`` (relative to the repo root). When this wrapper triggers, list it with ``& `"`$env:SystemRoot\System32\tar.exe`" -tf <archive>`` and read files with ``-xOf <archive> <path>``, starting with the packaged ``SKILL.md``; then follow the source workflow. On Windows use the System32 tar explicitly: a bare ``tar`` may resolve to Git Bash's GNU tar, which cannot open ``D:\`` paths."
  } else {
    "The source skill lives at ``$SourcePath`` (relative to the repo root). When this wrapper triggers, read that ``SKILL.md`` and follow the source workflow directly."
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
# Generated BEFORE any destructive step: this call can throw (foreign handlers,
# WorkRoot with whitespace) and must not leave a half-rebuilt claude-compat skill.
$userHooksState = Write-CodexUserHooks -CodexHome $CodexHome -WorkRoot $WorkRoot -BackupRoot $backupRoot
# $backupRoot is created lazily by the Backup-And-Replace* helpers: an eager
# mkdir left an empty dir per run (698 accumulated by 2026-09-19).

$claudeSkills = Join-Path $ClaudeHome "skills"
$repoSkillRoot = Join-Path $WorkRoot ".agents\skills"
$userAgentsRoot = Join-Path $env:USERPROFILE ".agents"
$userSkillRoot = Join-Path $userAgentsRoot "skills"
$installedSkills = New-Object System.Collections.Generic.List[string]

if ($Mode -eq "copy") {
  throw "-Mode copy is retired: copying creates a second, drifting workflow source. Use -Mode linked."
}

Ensure-Directory $repoSkillRoot
Get-ChildItem -Directory -LiteralPath $claudeSkills |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "SKILL.md") } |
  Sort-Object Name |
  ForEach-Object {
    $destination = Join-Path $repoSkillRoot $_.Name
    Backup-And-ReplaceDirectory -Path $destination -BackupRoot (Join-Path $backupRoot (Get-SkillBridgeBackupFolder -Destination $destination)) -CodexRoot $WorkRoot
    $sourceSkillMd = Join-Path $_.FullName "SKILL.md"
    $description = Get-CodexSkillDescription -Name $_.Name -SourceSkillMd $sourceSkillMd
    Write-WrapperSkill -SkillPath $destination -Name $_.Name -Description $description `
      -SourcePath (Get-RepoRelativePath -Path $sourceSkillMd -WorkRoot $WorkRoot)
    $installedSkills.Add($_.Name)
  }

Get-ChildItem -File -LiteralPath $claudeSkills -Filter "*.skill" |
  Sort-Object Name |
  ForEach-Object {
    $topLevel = Get-SkillArchiveTopFolder -Path $_.FullName
    $destination = Join-Path $repoSkillRoot $topLevel
    Backup-And-ReplaceDirectory -Path $destination -BackupRoot (Join-Path $backupRoot (Get-SkillBridgeBackupFolder -Destination $destination)) -CodexRoot $WorkRoot
    $description = Get-CodexSkillDescription -Name $topLevel -SourceSkillMd ""
    Write-WrapperSkill -SkillPath $destination -Name $topLevel -Description $description `
      -SourcePath (Get-RepoRelativePath -Path $_.FullName -WorkRoot $WorkRoot) -IsArchive
    $installedSkills.Add($topLevel)
  }

# Every shared slash command gets a Codex wrapper.
#
# This used to be a hardcoded three-entry table (caveman, wp-bridge-release, zoom-out), so
# 42 of 45 commands were Claude-only -- including `/claude-review`, which AGENTS.md section 4
# names as the required oracle for anything CODEX writes. The reversed-oracle rule could
# therefore only be honoured if the operator remembered it by hand. Enumerating the
# directory means a new command is shared the moment it is committed, with nothing to
# remember and nothing to keep in sync.
#
# Opt out with `codex-skip: true` in a command's frontmatter (for Claude-UI-only macros).
$commandsDir = Join-Path $ClaudeHome "commands"
if (-not (Test-Path -LiteralPath $commandsDir)) {
  throw "Claude commands directory is missing: $commandsDir"
}
$commandFiles = @(Get-ChildItem -File -LiteralPath $commandsDir -Filter "*.md" | Sort-Object Name)
if ($commandFiles.Count -eq 0) {
  throw "No Claude commands found under $commandsDir -- refusing to wipe the generated command wrappers."
}
foreach ($commandFile in $commandFiles) {
  $commandName = [IO.Path]::GetFileNameWithoutExtension($commandFile.Name)
  $fm = Get-MarkdownFrontmatter $commandFile.FullName
  # .Contains, not dot-access: the same expression throws under StrictMode Latest, which
  # check-claude-codex-parity.ps1 does set. Keep both readers identical.
  if ($fm.Contains('codex-skip') -and $fm['codex-skip'] -eq 'true') {
    Write-Host "  skip (codex-skip): /$commandName"
    continue
  }
  $skillName = "source-command-$commandName"
  $destination = Join-Path $repoSkillRoot $skillName
  $description = if ($fm.Contains('description') -and $fm['description']) {
    ($fm['description'] -replace "[<>]", "" -replace "\s+", " ").Trim()
  } else { "" }
  Backup-And-ReplaceDirectory -Path $destination -BackupRoot (Join-Path $backupRoot (Get-SkillBridgeBackupFolder -Destination $destination)) -CodexRoot $WorkRoot
  Write-ClaudeCommandSkillWrapper -SkillPath $destination -Name $skillName `
    -CommandPath (Get-RepoRelativePath -Path $commandFile.FullName -WorkRoot $WorkRoot) `
    -CommandName $commandName -Description $description
  $installedSkills.Add($skillName)
}

# The repo skill root is the only Codex-discovered bridge location for shared
# Claude skills. Remove same-named legacy copies only after backing them up.
foreach ($skillName in @($installedSkills | Sort-Object -Unique)) {
  foreach ($legacyRoot in @($skillRoot, $userSkillRoot)) {
    $legacyPath = Join-Path $legacyRoot $skillName
    if (Test-Path -LiteralPath $legacyPath) {
      $allowedRoot = if ($legacyRoot -eq $skillRoot) { $CodexHome } else { $userAgentsRoot }
      $legacyScope = if ($legacyRoot -eq $skillRoot) { "codex-home" } else { "user-agents" }
      Backup-And-ReplaceDirectory -Path $legacyPath -BackupRoot (Join-Path $backupRoot (Join-Path "legacy-duplicate-skills" $legacyScope)) -CodexRoot $allowedRoot
    }
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
$projectDest = Join-Path $references "project"
$runbookDest = Join-Path $references "runbooks"
$pluginDest = Join-Path $references "plugins"

Ensure-Directory $agentDest
Ensure-Directory $commandDest
Ensure-Directory $hookDest
Ensure-Directory $mcpDest
Ensure-Directory $projectDest
Ensure-Directory $runbookDest
Ensure-Directory $pluginDest

$nativeAgentRoot = Join-Path $WorkRoot ".codex\agents"
$nativeAgentNames = Sync-NativeAgentBridges -SourceDir (Join-Path $ClaudeHome "agents") -DestinationDir $nativeAgentRoot -WorkRoot $WorkRoot -BackupRoot $backupRoot
Remove-LegacyCodexHookRuntime -CodexHome $CodexHome -CanonicalHookRoot (Join-Path $WorkRoot "mcp\claude-userlevel\hooks") -BackupRoot $backupRoot

# Codex Desktop's built-in "migrate subagents" (2026-08-19) left FULL copies of
# the Claude agent prompts in ~/.codex/agents under the same names as the thin
# bridges: a second, frozen source. Same-named ones are backed up and removed.
$legacyUserAgents = @()
$userAgentDir = Join-Path $CodexHome "agents"
if (Test-Path -LiteralPath $userAgentDir) {
  foreach ($f in @(Get-ChildItem -File -LiteralPath $userAgentDir -Filter "*.toml")) {
    if ($nativeAgentNames -contains $f.Name) {
      Backup-And-ReplaceFile -Path $f.FullName -BackupRoot (Join-Path $backupRoot "legacy-user-agents") -AllowedRoot $CodexHome
      $legacyUserAgents += $f.Name
    }
  }
}
# A May-2026 copy of this generator, never referenced by anything.
$legacyUserSync = Join-Path $CodexHome "scripts\sync-claude-to-codex.ps1"
if (Test-Path -LiteralPath $legacyUserSync) {
  Backup-And-ReplaceFile -Path $legacyUserSync -BackupRoot (Join-Path $backupRoot "legacy-user-scripts") -AllowedRoot $CodexHome
}


Write-ClaudeCompatSkill -SkillPath $compatSkill -SourceClaudeHome $ClaudeHome
Write-AgentIndex -SourceDir (Join-Path $ClaudeHome "agents") -DestDir $agentDest -UseSourceLinks ($Mode -eq "linked")
Write-CommandIndex -SourceDir (Join-Path $ClaudeHome "commands") -DestDir $commandDest -UseSourceLinks ($Mode -eq "linked")
Write-HookIndex -ClaudeSettingsPath (Join-Path $ClaudeHome "settings.json") -DestDir $hookDest
Write-McpIndex -ClaudeMcpPath (Join-Path $WorkRoot ".mcp.json") -CodexConfigPath (Join-Path $CodexHome "config.toml") -DestDir $mcpDest
Write-ProjectIndex -WorkRoot $WorkRoot -DestDir $projectDest -ClaudeHome $ClaudeHome
Write-RunbookIndex -WorkRoot $WorkRoot -DestDir $runbookDest
Write-PluginIndex -InstalledPluginsPath (Join-Path $ClaudeHome "plugins\installed_plugins.json") -DestDir $pluginDest

$globalAgents = Join-Path $CodexHome "AGENTS.md"
$globalAgentsContent = @'
# User Codex Instructions

- Use the `claude-compat` skill when the user asks for migrated Claude agents, slash commands, hooks, runbooks, plugins, or Claude Code workflow parity.
- Claude source content lives in `D:\Work\CLAUDE.md` and `D:\Work\.claude`; user Codex skills are generated thin wrappers/indexes, not independent copies.
- Claude is the only human-maintained workflow source. Do not hand-maintain a parallel Codex rule set for migrated Claude behavior.
- In `D:\Work`, read `CLAUDE.md` and then `agency-os\AGENTS.md` in full before task actions. The repo `AGENTS.md` bridge enforces the same rule for project sessions.
- This file is the user-level Codex instruction source. Do not add Codex-only instructions or migration helpers to the repo root.
- Project-specific instructions may live in nested repo `AGENTS.md` files when a project intentionally owns them.
- The user-level MCP config may contain live secrets. Never print raw `config.toml`, `.mcp.json`, `mcp.json`, `.credentials.json`, or token-bearing env values.
- Shared MCP configuration is managed from `D:\Work\mcp\registry.template.json` and `D:\Work\scripts\sync-mcp-config.ps1`.
- Governance hooks run from the generated `~/.codex/hooks.json`. If `/hooks` lists AwareWave hooks as new, changed, or untrusted, tell the operator before task work: until they are trusted every mechanical gate is silently off. A hook BLOCK is a real stop; follow its message.
- Prove the gates per session, do not assume: after your first tool call, `~/.codex/awarewave-hook-heartbeat.json` must show a `events.PreToolUse.last_utc` from this session. If it does not, hooks are being skipped -- say so and do the R0/R4 steps manually.
- Claude's `permissions.deny` list (no new branches, `reset --hard origin/*`, `git clean -fd`, `sudo`, force push, recursive forced delete, ...) is enforced for Codex by the `permission-deny-mirror` hook rule. A block there is policy, not a bug.
- Cross-model review: when Codex authored the change, the oracle is Claude: run `/claude-review` (`D:\Work\.claude\commands\claude-review.md`), never `/codex-review`.
- Greetings and close-out phrases follow CLAUDE.md's AO-RESUME / AO-CLOSE lifecycle; the UserPromptSubmit hook already runs `scripts\ao-resume.ps1` on a new session.
'@
$memoryIndex = Get-ClaudeMemoryIndexPath -WorkRoot $WorkRoot
if (Test-Path -LiteralPath $memoryIndex) {
  $globalAgentsContent += "`n- Operator memory (shared with Claude, single source): before task work in ``$WorkRoot``, read ``$memoryIndex`` and every linked memory file relevant to the task; feedback memories bind Codex exactly as they bind Claude. When the operator states a new durable preference, add a file in that directory with the same frontmatter (``name``, ``description``, ``metadata.type``) plus one index line.`n"
}
Write-Utf8NoBom -Path $globalAgents -Value $globalAgentsContent

$validationScript = Join-Path $CodexHome "skills\.system\skill-creator\scripts\quick_validate.py"
$validationResults = New-Object System.Collections.Generic.List[string]
if (Test-Path -LiteralPath $validationScript) {
  $env:PYTHONUTF8 = "1"
  $skillsToValidate = @($installedSkills | Sort-Object -Unique) + @("claude-compat")
  foreach ($skillName in $skillsToValidate) {
    $path = if ($skillName -eq "claude-compat") { Join-Path $skillRoot $skillName } else { Join-Path $repoSkillRoot $skillName }
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
  nativeAgentBridges = @($nativeAgentNames)
  removedLegacyUserAgents = @($legacyUserAgents)
  userHooks = $userHooksState
  repoSkillRoot = $repoSkillRoot
  compatibilitySkill = $compatSkill
  validation = @($validationResults)
}

$summaryPath = Join-Path $compatSkill "migration-summary.json"
Write-Utf8NoBom -Path $summaryPath -Value ($summary | ConvertTo-Json -Depth 5)

# Retention: prune backup dirs holding ONLY regenerable output of this script;
# anything with a legacy-* folder holds pre-migration user content and is kept.
$generatedOnly = @('repo-skill-bridges', 'native-agent-bridges', 'claude-compat')
$backupsDir = Join-Path $CodexHome "backups"
$pruned = 0
if (Test-Path -LiteralPath $backupsDir) {
  $candidates = @(Get-ChildItem -Directory -LiteralPath $backupsDir -Filter "claude-migration-*" |
    Where-Object { @(Get-ChildItem -LiteralPath $_.FullName -Name | Where-Object { $_ -notin $generatedOnly }).Count -eq 0 } |
    Sort-Object Name -Descending)
  foreach ($old in @($candidates | Select-Object -Skip 15)) {
    Assert-ChildPath -Path $old.FullName -Root $backupsDir
    Remove-Item -LiteralPath $old.FullName -Recurse -Force
    $pruned++
  }
}

Write-Host "Generated repo skill bridges:" (($installedSkills | Sort-Object -Unique) -join ", ")
Write-Host "Generated native agent bridges:" (($nativeAgentNames) -join ", ")
Write-Host "Installed compatibility skill: claude-compat"
Write-Host "Backup root: $backupRoot (pruned $pruned regenerable backup dir(s))"
if ($legacyUserAgents.Count) { Write-Host "Removed legacy full-copy user agents (backed up): $($legacyUserAgents -join ', ')" }
Write-Host "Codex user hooks (~/.codex/hooks.json): $userHooksState"
if ($userHooksState -eq 'written') {
  Write-Host "ACTION: Codex hook definitions changed -> open Codex in $WorkRoot, run /hooks, trust the AwareWave hooks. Until then Codex skips them silently." -ForegroundColor Yellow
}
Write-Host "Validation:"
$validationResults | ForEach-Object { Write-Host " - $_" }
