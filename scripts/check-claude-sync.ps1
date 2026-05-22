<#
.SYNOPSIS
  Verify Claude Code cross-machine sync health. Single source of truth for
  "what does sync mean" — runs faster than a human auditor and never lies.

.DESCRIPTION
  Today's lesson: the sync architecture is non-obvious. CLAUDE.md/AGENTS.md
  describe it in prose, but prose decays. This script is the executable spec —
  if it passes, sync is healthy by definition.

  Checks (layered by severity):

  HARD (exit 1) -- sync infrastructure is broken; fix before next session:
    H1. .claude is a Windows Junction/Symlink (or platform skip on non-Windows)
    H2. sync-claude-userlevel.ps1 -Mode verify exits 0 (hooks/settings/mcp.json)
    H3. Every git-tracked file under .claude/commands|agents|skills exists on disk
        (broken sync = git pull wrote into a real dir, Claude reads from ~/.claude)

  SOFT (exit 2) -- sync is working but the user has local files not in git
                  (untracked .md under .claude/{commands,agents,skills}). Not
                  blocking, but worth surfacing in case the user forgot to commit.

  ENV (exit 3) -- Claude Code not installed (~/.claude missing). Graceful skip.

  PASS (exit 0) -- all clean.

  Note: a previous version also strict-matched ~/.claude/mcp.json to literal
  '{}', but sync-claude-userlevel.ps1 -Mode verify (delegated above) already
  enforces mcp.json conformance via its own template comparison. The strict
  text match produced false positives on the semantically-equivalent
  '{ "mcpServers": {} }' form. Removed to avoid duplicate / divergent rules.

.PARAMETER Quiet
  Suppress human-readable output; only write JSON. Used by system-health-check
  to avoid noisy nested logs.

.OUTPUTS
  Human-readable table to stdout (unless -Quiet) AND machine-readable JSON to
  agency-os/.agency-state/sync-check-last.json (always).

.NOTES
  - Read-only. Never modifies sync state.
  - The fix for each fail is printed in the 'fix' field of the JSON entry.
  - 30-year design: when the sync model changes, update THIS script first; the
    docs are downstream.
#>
[CmdletBinding()]
param(
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------- Locate monorepo root ----------
function Resolve-MonorepoRoot {
    try {
        $r = (& git rev-parse --show-toplevel 2>$null)
        if ($LASTEXITCODE -eq 0 -and $r) { return ($r -replace '/', '\').TrimEnd('\') }
    } catch { }
    $cur = (Get-Location).Path
    while ($cur -and (Test-Path $cur)) {
        if (Test-Path (Join-Path $cur '.git')) { return $cur.TrimEnd('\') }
        $parent = Split-Path -Parent $cur
        if ($parent -eq $cur) { break }
        $cur = $parent
    }
    throw "Cannot locate monorepo root. Run from inside the repo."
}

$MonorepoRoot = Resolve-MonorepoRoot
$UserProfile = $env:USERPROFILE
$ClaudeUserRoot = if ($UserProfile) { Join-Path $UserProfile '.claude' } else { $null }
$ClaudeRepoPath = Join-Path $MonorepoRoot '.claude'
$StateDir = Join-Path $MonorepoRoot 'agency-os\.agency-state'
$JsonPath = Join-Path $StateDir 'sync-check-last.json'

$findings = New-Object System.Collections.ArrayList
$worstSeverity = 'pass'  # pass < soft < hard < env

function Add-Finding {
    param(
        [Parameter(Mandatory)][ValidateSet('pass','soft','hard','env')] [string]$Severity,
        [Parameter(Mandatory)][string]$Check,
        [Parameter(Mandatory)][string]$Detail,
        [string]$Fix = ''
    )
    $entry = [ordered]@{
        check    = $Check
        severity = $Severity
        detail   = $Detail
        fix      = $Fix
    }
    [void]$findings.Add($entry)
    $rank = @{ pass = 0; soft = 1; hard = 2; env = 3 }
    if ($rank[$Severity] -gt $rank[$script:worstSeverity]) {
        $script:worstSeverity = $Severity
    }
}

# ---------- Pre-flight: Claude Code installed? ----------
if (-not $ClaudeUserRoot -or -not (Test-Path -LiteralPath $ClaudeUserRoot)) {
    Add-Finding -Severity 'env' -Check 'pre-flight' `
        -Detail "Claude Code not installed: $ClaudeUserRoot does not exist" `
        -Fix 'Install Claude Code from https://claude.ai/download'
}

# ---------- H1: .claude junction status ----------
# PS 5.1 lacks $IsWindows automatic variable; under Set-StrictMode it throws on access.
# $env:OS = 'Windows_NT' on Windows (both PS 5.1 and PS 7+); empty on Linux/Mac.
$isWindowsHost = ($env:OS -eq 'Windows_NT')
if ($isWindowsHost) {
    if (Test-Path -LiteralPath $ClaudeRepoPath) {
        try {
            $item = Get-Item -LiteralPath $ClaudeRepoPath -Force
            $isLink = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
            if ($isLink) {
                $target = $item.Target
                Add-Finding -Severity 'pass' -Check 'H1: .claude junction' `
                    -Detail "Junction OK -> $target"
            } else {
                Add-Finding -Severity 'hard' -Check 'H1: .claude junction' `
                    -Detail "$ClaudeRepoPath is a real directory, not a junction. Cross-machine sync of commands/agents/skills will silently break." `
                    -Fix "Backup contents, then: rmdir `"$ClaudeRepoPath`" && powershell -File scripts\bootstrap-mcp-machine.ps1"
            }
        } catch {
            Add-Finding -Severity 'hard' -Check 'H1: .claude junction' `
                -Detail "Failed to inspect $($ClaudeRepoPath): $($_.Exception.Message)" `
                -Fix 'Inspect manually with: Get-Item .claude -Force'
        }
    } else {
        Add-Finding -Severity 'hard' -Check 'H1: .claude junction' `
            -Detail "$ClaudeRepoPath does not exist. git pull will fail to update tracked files." `
            -Fix 'powershell -File scripts\bootstrap-mcp-machine.ps1'
    }
} else {
    Add-Finding -Severity 'pass' -Check 'H1: .claude junction' `
        -Detail 'Skipped (non-Windows platform; this architecture targets Windows)'
}

# ---------- H2: sync-claude-userlevel verify ----------
$syncScript = Join-Path $MonorepoRoot 'scripts\sync-claude-userlevel.ps1'
if (Test-Path -LiteralPath $syncScript) {
    try {
        $verifyOut = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -Mode verify 2>&1
        $verifyExit = $LASTEXITCODE
        if ($verifyExit -eq 0) {
            Add-Finding -Severity 'pass' -Check 'H2: sync-claude-userlevel -Mode verify' `
                -Detail 'hooks/settings/mcp.json all aligned with SSOT'
        } else {
            $tail = ($verifyOut | Select-Object -Last 5) -join ' | '
            Add-Finding -Severity 'hard' -Check 'H2: sync-claude-userlevel -Mode verify' `
                -Detail "Drift detected (exit $verifyExit). Last output: $tail" `
                -Fix 'powershell -File scripts\sync-claude-userlevel.ps1 -Mode merge'
        }
    } catch {
        Add-Finding -Severity 'hard' -Check 'H2: sync-claude-userlevel -Mode verify' `
            -Detail "Script invocation failed: $($_.Exception.Message)" `
            -Fix 'Inspect scripts\sync-claude-userlevel.ps1 manually'
    }
} else {
    Add-Finding -Severity 'hard' -Check 'H2: sync-claude-userlevel -Mode verify' `
        -Detail "Sync script missing: $syncScript" `
        -Fix 'git pull to restore scripts/sync-claude-userlevel.ps1'
}

# ---------- H3 + S1: git-tracked .claude files exist on disk + extras ----------
# (Former H3 strict-match of mcp.json removed -- H2 above already validates it
#  via sync-claude-userlevel.ps1's own template comparison, which understands
#  the semantically-equivalent '{ "mcpServers": {} }' form.)
$claudeSubdirs = @('commands', 'agents', 'skills')
foreach ($subdir in $claudeSubdirs) {
    $relPath = ".claude/$subdir"
    $tracked = @(& git -C $MonorepoRoot ls-files $relPath 2>$null)
    $missing = New-Object System.Collections.ArrayList
    foreach ($t in $tracked) {
        $abs = Join-Path $MonorepoRoot ($t -replace '/', '\')
        if (-not (Test-Path -LiteralPath $abs)) {
            [void]$missing.Add($t)
        }
    }

    if ($missing.Count -gt 0) {
        $sample = ($missing | Select-Object -First 3) -join ', '
        $more = if ($missing.Count -gt 3) { " (+$($missing.Count - 3) more)" } else { '' }
        Add-Finding -Severity 'hard' -Check "H3: .claude/$subdir git/disk parity" `
            -Detail "$($missing.Count) file(s) tracked in git but missing on disk: $sample$more. Junction likely broken." `
            -Fix 'powershell -File scripts\bootstrap-mcp-machine.ps1 (recreate junction); then git checkout HEAD -- .claude/'
    } else {
        Add-Finding -Severity 'pass' -Check "H3: .claude/$subdir git/disk parity" `
            -Detail "$($tracked.Count) tracked file(s) all present on disk"
    }

    # SOFT: extras on disk (filesystem files not in git)
    $repoSubdirAbs = Join-Path $MonorepoRoot ($relPath -replace '/', '\')
    if (Test-Path -LiteralPath $repoSubdirAbs) {
        $diskFiles = @(Get-ChildItem -LiteralPath $repoSubdirAbs -Recurse -File -ErrorAction SilentlyContinue |
            ForEach-Object {
                $rel = $_.FullName.Substring($MonorepoRoot.Length).TrimStart('\') -replace '\\', '/'
                $rel
            })
        # Filter out files that .gitignore handles (README.md in agents/, .cache, etc.)
        $relevant = $diskFiles | Where-Object {
            $name = Split-Path $_ -Leaf
            $isReadme = ($subdir -eq 'agents' -and ($name -eq 'README.md' -or $name -eq 'README.zh-TW.md'))
            $isCache = $_ -match '\.cache(/|$)'
            -not ($isReadme -or $isCache)
        }
        $extras = @($relevant | Where-Object { $tracked -notcontains $_ })
        if ($extras.Count -gt 0) {
            $sample = ($extras | Select-Object -First 3) -join ', '
            $more = if ($extras.Count -gt 3) { " (+$($extras.Count - 3) more)" } else { '' }
            Add-Finding -Severity 'soft' -Check "S1: .claude/$subdir uncommitted extras" `
                -Detail "$($extras.Count) file(s) on disk but not in git: $sample$more" `
                -Fix "git add $relPath/ && git commit"
        }
    }
}

# ---------- Write JSON + render output ----------
if (-not (Test-Path -LiteralPath $StateDir)) {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}

$result = [ordered]@{
    schemaVersion  = 1
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    worstSeverity  = $worstSeverity
    exitCode       = switch ($worstSeverity) {
        'env'  { 3 }
        'hard' { 1 }
        'soft' { 2 }
        default { 0 }
    }
    findings       = @($findings)
}

$encoding = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($JsonPath, ($result | ConvertTo-Json -Depth 10), $encoding)

if (-not $Quiet) {
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host '  Claude Code cross-machine sync check' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan
    foreach ($f in $findings) {
        $color = switch ($f.severity) {
            'pass' { 'Green' }
            'soft' { 'Yellow' }
            'hard' { 'Red' }
            'env'  { 'Magenta' }
        }
        $tag = $f.severity.ToUpper().PadRight(4)
        Write-Host ("[$tag] " + $f.check) -ForegroundColor $color
        Write-Host ('       ' + $f.detail) -ForegroundColor Gray
        if ($f.fix) { Write-Host ('       fix: ' + $f.fix) -ForegroundColor DarkGray }
    }
    Write-Host '------------------------------------------------------------' -ForegroundColor Cyan
    $label = switch ($worstSeverity) {
        'pass' { 'PASS' }
        'soft' { 'WARN (soft drift -- uncommitted local work)' }
        'hard' { 'FAIL (hard drift -- sync infrastructure broken)' }
        'env'  { 'SKIP (Claude Code not installed)' }
    }
    $resultColor = switch ($worstSeverity) {
        'pass' { 'Green' }
        'soft' { 'Yellow' }
        'hard' { 'Red' }
        'env'  { 'Magenta' }
    }
    Write-Host "  Result: $label" -ForegroundColor $resultColor
    Write-Host "  JSON:   $JsonPath" -ForegroundColor DarkGray
    Write-Host '============================================================' -ForegroundColor Cyan
}

exit $result.exitCode
