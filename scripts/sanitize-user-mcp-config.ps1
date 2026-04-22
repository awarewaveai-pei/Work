<#
.SYNOPSIS
  Back up and sanitize user-level Cursor / Claude MCP config files.

.DESCRIPTION
  Creates uniquely named backups, then:

  - rewrites %USERPROFILE%\.cursor\mcp.json to an env-based form derived from
    repo-root .mcp.json
  - rewrites %USERPROFILE%\.claude\mcp.json to a minimal non-secret fallback
  - clears project-level mcpServers entries from %USERPROFILE%\.claude.json so
    repo-root .mcp.json becomes the project source of truth

  This script never writes secrets into repo-tracked files. Use -WhatIf to
  preview backup and target paths before making changes.
#>
param(
    [string]$WorkspaceRoot = "",
    [string]$BackupRoot = "",
    [switch]$SkipCursor,
    [switch]$SkipClaudeLegacy,
    [switch]$SkipClaudeUserJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
    $BackupRoot = Join-Path $WorkspaceRoot "Backups"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $BackupRoot ("mcp-sanitize-" + $timestamp)

$cursorPath = Join-Path $env:USERPROFILE ".cursor\mcp.json"
$claudeLegacyPath = Join-Path $env:USERPROFILE ".claude\mcp.json"
$claudeJsonPath = Join-Path $env:USERPROFILE ".claude.json"
$workspaceMcpPath = Join-Path $WorkspaceRoot ".mcp.json"

function Write-Utf8NoBomFile {
    param(
        [string]$Path,
        [string]$Content
    )

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    $encoding = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Backup-FileUnique {
    param(
        [string]$SourcePath,
        [string]$BackupDirectory
    )

    if (-not (Test-Path -LiteralPath $SourcePath)) {
        return $null
    }

    if (-not (Test-Path -LiteralPath $BackupDirectory)) {
        New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
    }

    $leaf = Split-Path -Leaf $SourcePath
    $parentLeaf = Split-Path -Leaf (Split-Path -Parent $SourcePath)
    if ([string]::IsNullOrWhiteSpace($parentLeaf) -or $parentLeaf -eq [IO.Path]::GetPathRoot($SourcePath)) {
        $parentLeaf = "root"
    }

    $safeParent = ($parentLeaf -replace '[^A-Za-z0-9._-]', '_')
    $targetLeaf = "$safeParent--$leaf"
    $targetPath = Join-Path $BackupDirectory $targetLeaf
    Copy-Item -LiteralPath $SourcePath -Destination $targetPath -Force
    return $targetPath
}

function Get-SanitizedCursorConfig {
    param([string]$SharedWorkspaceMcpPath)

    if (-not (Test-Path -LiteralPath $SharedWorkspaceMcpPath)) {
        throw "Workspace MCP file not found: $SharedWorkspaceMcpPath"
    }

    $shared = Get-Content -LiteralPath $SharedWorkspaceMcpPath -Raw -Encoding UTF8
    $shared = $shared -replace '\$\{([A-Z_][A-Z0-9_]*)\}', '${env:$1}'
    $shared = $shared -replace [regex]::Escape('"' + $WorkspaceRoot.Replace('\', '\\') + '"'), '"${workspaceFolder}"'
    $shared = $shared -replace [regex]::Escape('"' + $env:USERPROFILE.Replace('\', '\\') + '"'), '"${userHome}"'
    return $shared
}

function Get-SanitizedClaudeLegacyConfig {
    return @'
{
  "mcpServers": {
    "copilot": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp",
      "headers": {
        "Authorization": "Bearer ${COPILOT_MCP_BEARER_TOKEN}"
      }
    },
    "trigger": {
      "command": "powershell",
      "args": [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "C:\\Users\\USER\\Work\\scripts\\start-trigger-mcp.ps1",
        "-ProjectRef",
        "${TRIGGER_PROJECT_REF}"
      ],
      "env": {
        "TRIGGER_API_URL": "${TRIGGER_API_URL}"
      }
    }
  }
}
'@
}

function Clear-ClaudeProjectMcpEntries {
    param([string]$ClaudeJsonPath)

    if (-not (Test-Path -LiteralPath $ClaudeJsonPath)) {
        return $false
    }

    $cfg = Get-Content -LiteralPath $ClaudeJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json -AsHashtable
    if (-not $cfg.ContainsKey("projects")) {
        return $false
    }

    foreach ($key in @($cfg["projects"].Keys)) {
        $project = $cfg["projects"][$key]
        if ($project -is [hashtable]) {
            if ($project.ContainsKey("mcpServers")) {
                $project["mcpServers"] = @{}
            }
            if ($project.ContainsKey("enabledMcpjsonServers")) {
                $project["enabledMcpjsonServers"] = @()
            }
            if ($project.ContainsKey("disabledMcpjsonServers")) {
                $project["disabledMcpjsonServers"] = @()
            }
        }
    }

    Write-Utf8NoBomFile -Path $ClaudeJsonPath -Content ($cfg | ConvertTo-Json -Depth 100)
    return $true
}

$backups = @()
foreach ($path in @($cursorPath, $claudeLegacyPath, $claudeJsonPath)) {
    $backupPath = Backup-FileUnique -SourcePath $path -BackupDirectory $backupDir
    if ($null -ne $backupPath) {
        $backups += $backupPath
    }
}

if (-not $SkipCursor) {
    $cursorSanitized = Get-SanitizedCursorConfig -SharedWorkspaceMcpPath $workspaceMcpPath
    Write-Utf8NoBomFile -Path $cursorPath -Content $cursorSanitized
}

if (-not $SkipClaudeLegacy) {
    Write-Utf8NoBomFile -Path $claudeLegacyPath -Content (Get-SanitizedClaudeLegacyConfig)
}

if (-not $SkipClaudeUserJson) {
    $null = Clear-ClaudeProjectMcpEntries -ClaudeJsonPath $claudeJsonPath
}

Write-Host "User MCP sanitization complete." -ForegroundColor Green
Write-Host "  backup dir      : $backupDir" -ForegroundColor Gray
Write-Host "  cursor user mcp : $(if ($SkipCursor) { 'skipped' } else { $cursorPath })" -ForegroundColor Gray
Write-Host "  claude legacy   : $(if ($SkipClaudeLegacy) { 'skipped' } else { $claudeLegacyPath })" -ForegroundColor Gray
Write-Host "  claude user json: $(if ($SkipClaudeUserJson) { 'skipped' } else { $claudeJsonPath })" -ForegroundColor Gray

if ($backups.Count -gt 0) {
    Write-Host ""
    Write-Host "Backups:" -ForegroundColor Cyan
    foreach ($backup in $backups) {
        Write-Host "  - $backup" -ForegroundColor Cyan
    }
}
