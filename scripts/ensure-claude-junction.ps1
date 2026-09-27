#requires -Version 5.1
<#
.SYNOPSIS
  Ensure d:\Work\.claude (monorepo .claude) is a junction (mount point) to ~/.claude.

.DESCRIPTION
  CLAUDE.md R1 mandates that repo-root `.claude/` is a junction to the user-level
  `~/.claude/`, so that:
    - Git tracks `.claude/{commands,agents,skills,plans,hooks}` content
    - User-level Claude Code edits land in the same inode as the git-tracked tree
    - sync-claude-userlevel.ps1 only governs hooks/settings/mcp, not commands/agents

  When the junction silently becomes a real directory (observed 2026-05-28: most
  likely cause is an auto-checkpoint hook running git commands while a sibling
  process modified the path, which resolved the junction into a regular folder),
  git status reports 49+ tracked files as deleted (because they live under
  ~/.claude/, not the real folder). The next auto-checkpoint then commits the
  deletions and corrupts history.

  This script is idempotent self-heal:
    1. If d:\Work\.claude is already a junction with the correct target -> exit 0 ("ok")
    2. If missing -> create junction
    3. If real folder with content -> back up content, remove folder, create junction,
       optionally merge backed-up content into ~/.claude (only files not already there)
    4. If junction with wrong target -> back up, remove, recreate with correct target

  Exit codes:
    0 = ok (junction in place + correct target)
    1 = error (cannot fix; user intervention needed)
    2 = warn (junction repaired but partial — e.g. some backup content needed manual review)

.PARAMETER WorkRoot
  Monorepo root. Defaults to the parent directory of this script's parent.
  Must be the MAIN checkout (`.git` is a directory); a linked worktree or a
  non-git directory is skipped as a no-op with exit 0 (2026-09-27).

.PARAMETER UserProfile
  User profile root. Defaults to $env:USERPROFILE.

.PARAMETER DryRun
  Inspect only; do not modify anything. Useful for system-health-check.

.PARAMETER EmitState
  Write a small JSON summary to agency-os/.agency-state/junction-last.json so
  consumers (system-health-check, AO-RESUME) can read the latest state without
  re-running the check.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\ensure-claude-junction.ps1
  # Heals junction if needed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\ensure-claude-junction.ps1 -DryRun
  # Reports state without changing anything (use in health gate).

.NOTES
  Author: 2026-05-28 (Phase C1 of plan Z)
  Related: scripts\check-claude-sync.ps1 (H1 already checks junction; this script
  goes one step further by actively repairing it).
#>

[CmdletBinding()]
param(
  [string]$WorkRoot,
  [string]$UserProfile,
  [switch]$DryRun,
  [switch]$EmitState
)

$ErrorActionPreference = 'Stop'

# Resolve defaults ----------------------------------------------------------
if (-not $WorkRoot) {
  $envRoot = $env:MONOREPO_ROOT
  if ($envRoot -and (Test-Path -LiteralPath $envRoot)) {
    $WorkRoot = $envRoot
  } else {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
  }
}
if (-not $UserProfile) { $UserProfile = $env:USERPROFILE }
if (-not $UserProfile) { throw "USERPROFILE not set and -UserProfile not passed" }

# Main checkout only, whoever calls (hook, ao-close, system-health-check, operator). A linked
# worktree (git worktree add) has `.git` as a FILE and its tracked `.claude/` is real content:
# junction-ing it to ~/.claude means a later `git worktree remove --force` / recursive delete
# follows the junction into ~/.claude, and `git add -A` there stages ~/.claude state as the
# worktree's .claude (observed 2026-09-27, D:\tmp\v-int2). No-op, exit 0, one line, no state file.
$gitEntry = Join-Path $WorkRoot '.git'
if (-not (Test-Path -LiteralPath $gitEntry -PathType Container)) {
  $why = if (Test-Path -LiteralPath $gitEntry) { 'linked worktree (.git is a file)' } else { 'not a git checkout (.git missing)' }
  Write-Host "ensure-claude-junction: skipped -- $WorkRoot is a $why; the .claude junction belongs to the main checkout only (no-op, exit 0)"
  exit 0
}

$junctionPath = Join-Path $WorkRoot '.claude'
$targetPath   = Join-Path $UserProfile '.claude'

$findings = New-Object System.Collections.Generic.List[object]
$verdict  = 'ok'
$exit     = 0

function Add-Finding {
  param([string]$Severity, [string]$Detail, [string]$Action)
  $findings.Add([pscustomobject]@{
    severity = $Severity
    detail   = $Detail
    action   = $Action
  }) | Out-Null
}

# 1) Verify target exists ---------------------------------------------------
if (-not (Test-Path -LiteralPath $targetPath -PathType Container)) {
  Add-Finding 'error' "Target ~/.claude does not exist at $targetPath" "Run scripts\bootstrap-mcp-machine.ps1 first to initialize user-level Claude Code state."
  $verdict = 'error'
  $exit    = 1
}

# 2) Inspect junction path --------------------------------------------------
$junctionExists = Test-Path -LiteralPath $junctionPath
$isJunction     = $false
$currentTarget  = ''
$realFolderContent = @()

if ($junctionExists) {
  $item = Get-Item -LiteralPath $junctionPath -Force
  $reparse = $item.Attributes -band [System.IO.FileAttributes]::ReparsePoint
  if ($reparse) {
    $isJunction = $true
    # Resolve junction target via fsutil
    try {
      $reparseOut = & cmd.exe /c "fsutil reparsepoint query `"$junctionPath`"" 2>&1
      $targetLine = $reparseOut | Where-Object { $_ -match 'Mount Point|Print Name' } | Select-Object -First 1
      if ($reparseOut -is [array]) {
        # PrintName line contains the target path
        $printLine = $reparseOut | Where-Object { $_ -match 'C:\\|D:\\' } | Select-Object -First 1
        if ($printLine) { $currentTarget = ($printLine -replace '^[^:]*:\s*','').Trim() }
      }
    } catch {
      # Fallback: use [System.IO.DirectoryInfo] LinkTarget (PS 7+) or LinkType (PS 5.1)
      $currentTarget = $item.Target
      if (-not $currentTarget) { $currentTarget = '(unable to resolve)' }
    }
  } else {
    $realFolderContent = Get-ChildItem -LiteralPath $junctionPath -Force -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
  }
}

# 3) Decide & act -----------------------------------------------------------
if ($exit -eq 1) {
  # Target missing — can't proceed
}
elseif ($isJunction) {
  # Check target matches expected.
  # fsutil prints PrintName with `\??\` NT object-manager prefix; strip it before comparison.
  $expectedNormalized = $targetPath.TrimEnd('\').ToLowerInvariant()
  $currentNormalized  = ($currentTarget -replace '^\\\?\?\\','').TrimEnd('\').ToLowerInvariant()
  if ($currentNormalized -and ($currentNormalized -ne $expectedNormalized)) {
    Add-Finding 'warn' "Junction exists but points to $currentTarget (expected $targetPath)" "Will rebuild junction to correct target."
    $verdict = 'repaired'
    if (-not $DryRun) {
      cmd.exe /c "rmdir `"$junctionPath`"" 2>&1 | Out-Null
      cmd.exe /c "mklink /J `"$junctionPath`" `"$targetPath`"" 2>&1 | Out-Null
      Add-Finding 'info' "Junction recreated: $junctionPath -> $targetPath" ""
    }
  } else {
    Add-Finding 'pass' "Junction OK: $junctionPath -> $targetPath" ""
  }
}
elseif ($junctionExists -and -not $isJunction) {
  # Real folder where junction should be
  if ($realFolderContent.Count -eq 0) {
    Add-Finding 'warn' "Empty real folder at $junctionPath (expected junction)" "Will remove empty folder and create junction."
    $verdict = 'repaired'
    if (-not $DryRun) {
      cmd.exe /c "rmdir `"$junctionPath`"" 2>&1 | Out-Null
      cmd.exe /c "mklink /J `"$junctionPath`" `"$targetPath`"" 2>&1 | Out-Null
      Add-Finding 'info' "Junction created: $junctionPath -> $targetPath" ""
    }
  } else {
    $backupRoot = Join-Path $env:TEMP ("claude-junction-autoheal-{0:yyyyMMdd-HHmmss}" -f (Get-Date))
    Add-Finding 'warn' "Real folder at $junctionPath contains: $($realFolderContent -join ', ')" "Will back up to $backupRoot then create junction. Backed-up content NOT auto-merged into ~/.claude (review manually if needed)."
    $verdict = 'repaired-with-warning'
    $exit    = 2
    if (-not $DryRun) {
      New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
      Copy-Item -LiteralPath $junctionPath -Destination $backupRoot -Recurse -Force
      cmd.exe /c "rmdir /S /Q `"$junctionPath`"" 2>&1 | Out-Null
      cmd.exe /c "mklink /J `"$junctionPath`" `"$targetPath`"" 2>&1 | Out-Null
      Add-Finding 'info' "Real folder backed up to $backupRoot, junction created" "Review $backupRoot for any content that needs to be merged into ~/.claude manually."
    }
  }
}
else {
  # Junction missing entirely
  Add-Finding 'warn' "No file/folder at $junctionPath" "Will create junction to $targetPath."
  $verdict = 'repaired'
  if (-not $DryRun) {
    cmd.exe /c "mklink /J `"$junctionPath`" `"$targetPath`"" 2>&1 | Out-Null
    Add-Finding 'info' "Junction created: $junctionPath -> $targetPath" ""
  }
}

# 4) Re-verify after repair (skip if DryRun) --------------------------------
if (-not $DryRun -and $verdict -in @('repaired','repaired-with-warning')) {
  $reparseOut = & cmd.exe /c "fsutil reparsepoint query `"$junctionPath`"" 2>&1
  if ($LASTEXITCODE -ne 0) {
    Add-Finding 'error' "Post-repair: $junctionPath is NOT a reparse point. mklink may have failed silently (permissions? dev mode off?)" "Run as user (no admin needed for mklink /J), or enable Windows Developer Mode in Settings > Privacy & Security."
    $verdict = 'error'
    $exit    = 1
  } else {
    Add-Finding 'pass' "Post-repair verification: junction reparse point confirmed via fsutil" ""
  }
}

# 5) Output ------------------------------------------------------------------
Write-Host "============================================================"
Write-Host " ensure-claude-junction.ps1  (mode=$(if($DryRun){'dry-run'}else{'apply'}))"
Write-Host "============================================================"
Write-Host "  junction path : $junctionPath"
Write-Host "  target path   : $targetPath"
Write-Host "  current target: $currentTarget"
Write-Host "  verdict       : $verdict"
Write-Host ""
foreach ($f in $findings) {
  $color = switch ($f.severity) {
    'pass'  { 'Green' }
    'info'  { 'Cyan' }
    'warn'  { 'Yellow' }
    'error' { 'Red' }
    default { 'White' }
  }
  Write-Host ("  [$($f.severity.ToUpper())] $($f.detail)") -ForegroundColor $color
  if ($f.action) { Write-Host "         action: $($f.action)" -ForegroundColor DarkGray }
}
Write-Host ""
Write-Host "============================================================"
Write-Host " RESULT: $($verdict.ToUpper())  (exit=$exit)"
Write-Host "============================================================"

# 6) Write state file (optional) --------------------------------------------
if ($EmitState -and -not $DryRun) {
  try {
    $stateDir  = Join-Path $WorkRoot 'agency-os\.agency-state'
    if (-not (Test-Path -LiteralPath $stateDir)) {
      New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }
    $statePath = Join-Path $stateDir 'junction-last.json'

    # Convert findings (List[object]) to plain PSCustomObject array so ConvertTo-Json is happy.
    $findingsForJson = @()
    foreach ($f in $findings) {
      $findingsForJson += [pscustomobject]@{ severity = $f.severity; detail = $f.detail; action = $f.action }
    }

    $payload = [pscustomobject]@{
      schemaVersion  = 1
      generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
      workRoot       = $WorkRoot
      junctionPath   = $junctionPath
      targetPath     = $targetPath
      verdict        = $verdict
      exitCode       = $exit
      findings       = $findingsForJson
    }
    $json = $payload | ConvertTo-Json -Depth 6
    $utf8 = New-Object System.Text.UTF8Encoding($true)  # UTF-8 BOM (per AGENTS.md cross-machine .md rule, applies to .json under .agency-state too)
    [System.IO.File]::WriteAllText($statePath, $json, $utf8)
    Write-Host "  state file written: $statePath" -ForegroundColor DarkGray
  } catch {
    Write-Host "  WARN: failed to write state file: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

exit $exit
