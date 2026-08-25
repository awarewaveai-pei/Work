<#
.SYNOPSIS
  Back up user-level MCP config files that may hold plaintext secrets, then hand them
  to their single governed writer.

.DESCRIPTION
  This script does exactly two things:

    1. Takes uniquely named, timestamped backups of the user-level files that
       historically carried plaintext tokens:
         %USERPROFILE%\.cursor\mcp.json
         %USERPROFILE%\.claude\mcp.json
         %USERPROFILE%\.claude.json

    2. Delegates the actual rewrite to scripts/sync-claude-userlevel.ps1, which is the
       ONLY writer for all three. What each file must contain is declared in
       mcp/claude-userlevel/manifest.json, not decided here.

  It deliberately does NOT rewrite those files itself.

  Until 2026-08-25 it did, carrying its own hardcoded idea of what each should hold --
  making it the second and third writer of files the manifest already governed, with a
  contradictory intent. That produced three failures, all invisible until an external
  review went looking:

    - It wrote a two-server fallback into ~/.claude/mcp.json, which CLAUDE.md requires
      to be {}. Every run therefore left drift that check-claude-sync.ps1 H2 would then
      flag, and whichever of the two scripts ran last decided the outcome.
    - That fallback hardcoded C:\Users\USER\Work\scripts\start-trigger-mcp.ps1, so on
      any machine whose repo lives elsewhere the trigger MCP could not start. The bug
      was masked for months because sync-mcp-config.ps1 happened to overwrite the file
      afterwards.
    - It copied the repo .mcp.json into ~/.cursor/mcp.json, recreating precisely the
      duplicate-server state that mcp-add-server-quickstart.md tells operators to avoid
      -- Cursor loads both files, so every duplicated server launched twice.

  The invariant this now respects: every user-level config an AI client actually loads
  has exactly one repo-managed writer, and that writer derives its intent from the
  manifest. A script with a private opinion about a governed file is the bug, however
  reasonable the opinion. See WORKLOG 2026-08-25.

.PARAMETER WorkspaceRoot
  Monorepo root. Defaults to the parent of this script's directory.

.PARAMETER BackupRoot
  Where to place the timestamped backup directory. Defaults to <WorkspaceRoot>\Backups.

.PARAMETER SkipDelegate
  Take the backups but do not invoke sync-claude-userlevel.ps1. For the case where you
  want a restore point before running the sync yourself.
#>
param(
    [string]$WorkspaceRoot = "",
    [string]$BackupRoot = "",
    [switch]$SkipDelegate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
    $BackupRoot = Join-Path $WorkspaceRoot "Backups"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $BackupRoot ("mcp-sanitize-" + $timestamp)

# The paths are listed here only so they can be backed up. Their required CONTENT is
# declared in mcp/claude-userlevel/manifest.json -- do not encode expectations here.
$cursorPath = Join-Path $env:USERPROFILE ".cursor\mcp.json"
$claudeLegacyPath = Join-Path $env:USERPROFILE ".claude\mcp.json"
$claudeJsonPath = Join-Path $env:USERPROFILE ".claude.json"

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

$backups = @()
foreach ($path in @($cursorPath, $claudeLegacyPath, $claudeJsonPath)) {
    $backupPath = Backup-FileUnique -SourcePath $path -BackupDirectory $backupDir
    if ($null -ne $backupPath) {
        $backups += $backupPath
    }
}

Write-Host "User MCP backup complete." -ForegroundColor Green
Write-Host "  backup dir : $backupDir" -ForegroundColor Gray

if ($backups.Count -gt 0) {
    Write-Host ""
    Write-Host "Backups:" -ForegroundColor Cyan
    foreach ($backup in $backups) {
        Write-Host "  $backup" -ForegroundColor Gray
    }
} else {
    Write-Host "  (no user-level MCP files present to back up)" -ForegroundColor Gray
}

if ($SkipDelegate) {
    Write-Host ""
    Write-Host "-SkipDelegate given: not invoking sync-claude-userlevel.ps1." -ForegroundColor Yellow
    Write-Host "Run it yourself to apply the manifest:" -ForegroundColor Yellow
    Write-Host "  powershell -File .\scripts\sync-claude-userlevel.ps1 -Mode merge" -ForegroundColor Yellow
    return
}

$userlevelSync = Join-Path $WorkspaceRoot "scripts\sync-claude-userlevel.ps1"
if (-not (Test-Path -LiteralPath $userlevelSync)) {
    throw "Single writer missing: $userlevelSync (git pull to restore it)"
}

Write-Host ""
Write-Host "Delegating the rewrite to the single governed writer..." -ForegroundColor Cyan
# Pass the repo root explicitly. The delegate otherwise discovers it from the current
# directory, which is wrong when this script is invoked by absolute path from elsewhere --
# and silently resolves to a DIFFERENT repo if cwd happens to sit inside one.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $userlevelSync -Mode merge -MonorepoRootOverride $WorkspaceRoot
$syncExit = $LASTEXITCODE
$global:LASTEXITCODE = 0

if ($syncExit -ne 0) {
    Write-Host ""
    Write-Host "FAIL: sync-claude-userlevel.ps1 exited $syncExit -- user-level files were NOT brought to the declared state." -ForegroundColor Red
    Write-Host "      Backups above are your restore point. Re-run after fixing the cause." -ForegroundColor Yellow
    # Exit non-zero. Reporting success here would tell the operator (and apply-shared-ai-governance.ps1,
    # which invokes this via Invoke-CheckedScript) that plaintext/drift was cleaned when it was not.
    exit 1
}

Write-Host ""
Write-Host "Done. Fully exit and reopen Cursor / Claude Code so they reload their config." -ForegroundColor Green
