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

# CP950 protection for native stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------- Locate monorepo root ----------
# $PSScriptRoot is tried FIRST because the script's own location on disk is true no
# matter what working directory the caller happened to have. The previous order asked
# `git rev-parse` and then walked up from Get-Location -- both cwd-dependent -- so this
# check passed when a human ran it from D:\Work and threw "Cannot locate monorepo root"
# under the DAILY SCHEDULED run, which starts elsewhere. That single failure held the
# health score at 99.7% against a 100% gate, so system-guard wrote ALERT_REQUIRED.txt
# every day (observed 2026-08-27 12:02, auto-repair FAIL). A check that only works when
# someone is standing in the right directory is not a check.
# TrimEnd('\') on a drive root turns 'D:\' into 'D:', and every later
# Join-Path then yields a DRIVE-RELATIVE path ('D:.claude') that silently resolves against
# the process's per-drive current directory. Improbable here (no .git at any drive root)
# but silent and unbounded if it ever happens, so the trim is bounded instead.
function Normalize-RootPath {
    param([string]$Path)
    if (-not $Path) { return $Path }
    $t = $Path.TrimEnd([char]92)
    if ($t.Length -lt 3) { return $Path }   # 'D:' -> keep 'D:\'
    return $t
}

function Resolve-MonorepoRoot {
    $candidates = @()
    if ($PSScriptRoot) {
        $candidates += (Split-Path -Parent $PSScriptRoot)   # <root>\scripts -> <root>
        $candidates += $PSScriptRoot
    }
    $candidates += (Get-Location).Path
    foreach ($start in $candidates) {
        if (-not $start) { continue }
        # -C makes git resolve relative to $start rather than the process cwd.
        try {
            $r = (Invoke-WithUtf8Console { & git -C $start rev-parse --show-toplevel 2>$null })
            if ($LASTEXITCODE -eq 0 -and $r) { return (Normalize-RootPath ($r -replace '/', '\')) }
        } catch { }
        $cur = $start
        while ($cur -and (Test-Path -LiteralPath $cur)) {
            if (Test-Path -LiteralPath (Join-Path $cur '.git')) { return (Normalize-RootPath $cur) }
            $parent = Split-Path -Parent $cur
            if ($parent -eq $cur) { break }
            $cur = $parent
        }
    }
    # Name what was actually tried: "run from inside the repo" sent the reader looking at
    # their shell when the caller was a scheduler they could not see.
    throw ("Cannot locate monorepo root. Tried: " + ($candidates -join " ; "))
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
                # PS 5.1 Get-Item exposes Target as string[] for reparse points; unwrap to avoid
                # "System.String[]" appearing in detail/JSON output. -join handles 1+ entries.
                $target = if ($item.Target) { @($item.Target) -join ',' } else { '<unknown>' }
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
# CP950 trap protection: nested powershell.exe inherits the parent console's
# OutputEncoding (CP950 on zh-TW Windows by default). The verify script's
# UTF-8 stdout would be mangled when captured via 2>&1, polluting the
# "Last output:" detail string. Force UTF-8 inside the child shell.
$syncScript = Join-Path $MonorepoRoot 'scripts\sync-claude-userlevel.ps1'
if (Test-Path -LiteralPath $syncScript) {
    try {
        # -MonorepoRootOverride is REQUIRED, not decorative: the callee discovers its root from
        # the CURRENT DIRECTORY, so a run started from System32 or from another checkout verifies
        # a different repo's SSOT and still exits 0 -- this gate would go green having checked
        # nothing here. sanitize-user-mcp-config.ps1:152 already pins it; this caller did not.
        $verifyCommand = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); & '$syncScript' -Mode verify -MonorepoRootOverride '$MonorepoRoot'"
        $verifyOut = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $verifyCommand 2>&1
        $verifyExit = $LASTEXITCODE
        if ($verifyExit -eq 0) {
            Add-Finding -Severity 'pass' -Check 'H2: sync-claude-userlevel -Mode verify' `
                -Detail 'hooks/settings/mcp.json all aligned with SSOT'
        } else {
            $tail = ($verifyOut | Select-Object -Last 5) -join ' | '
            Add-Finding -Severity 'hard' -Check 'H2: sync-claude-userlevel -Mode verify' `
                -Detail "Drift detected (exit $verifyExit). Last output: $tail" `
                -Fix 'powershell -File scripts\sync-claude-userlevel.ps1 -Mode merge  [if drift PERSISTS: N concurrent Claude sessions share ~/.claude (junction) and each writes its own settings.json snapshot -- benign multi-session contention, only the fork-bomb deny flaps. Run merge+gate in ONE invocation, or let AO-CLOSE/session-restart converge. See CROSS_MACHINE_SYNC_RUNBOOK.md multi-session section]'
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

# ---------- H4: repo-root .mcp.json placeholder syntax ----------
# SCOPE (deliberate, do not widen -- see invariant analysis, WORKLOG 2026-08-28):
#   This gate owns exactly ONE question: did OUR generator emit a placeholder form that
#   Claude Code cannot expand? That is a closed, statically-decidable question with a
#   known-wrong token, and it is the regression that actually happened.
#   It does NOT and MUST NOT try to answer "will every server actually start" -- that
#   depends on the launch-time environment and on Claude Code's own per-server schema,
#   so a static text check can only ever approximate it, and each approximation is one
#   more thing to keep in sync with an external product. Two oracle rounds proposed
#   widening it that way (unresolved ${NAME} at runtime; per-server schema validation);
#   both are real gaps, and both belong to a RUNTIME detector reading the actual
#   connected/failed counts, not here. See TASKS.md "MCP runtime usability detector".

# Claude Code expands ${NAME}. It passes ${env:NAME} through as a LITERAL string --
# that form is Cursor / VS Code syntax. Getting it wrong fails SILENTLY: every
# powershell-launched server receives '${env:MONOREPO_ROOT}\scripts\...' as its -File
# path, and every http server receives 'Bearer ${env:TOKEN}' as its credential.
# 14 of 24 servers failed on EVERY launch from at least 2026-08-12 to 2026-08-28 while
# every gate stayed green, because no gate looked at this file at all. Found by external
# oracle review, see agency-os/reports/oracle/2026-08-28-inspect-c3ee1ed4.md FINDING 2.
# Generator: scripts/sync-mcp-config.ps1, Resolve-EnvValue / ClaudeProjectPlaceholder.
$projectMcpPath = Join-Path $MonorepoRoot '.mcp.json'
if (-not (Test-Path -LiteralPath $projectMcpPath)) {
    Add-Finding -Severity 'hard' -Check 'H4: .mcp.json placeholder syntax' `
        -Detail "Project MCP config missing: $projectMcpPath" `
        -Fix 'powershell -File scripts\sync-mcp-config.ps1'
} else {
    $mcpRaw = Get-Content -LiteralPath $projectMcpPath -Raw -Encoding UTF8
    # Parse before linting. The invariant is "Claude Code can LOAD this file and every
    # placeholder in it is one Claude expands" -- a substring check alone reports PASS on a
    # file that is not valid JSON at all, which fails just as silently (no project MCP servers
    # load, no error surfaces). Oracle review 2026-08-28-review-2158c99b.md FINDING 2.
    $mcpParsed = $null
    $mcpParseError = ''
    try { $mcpParsed = $mcpRaw | ConvertFrom-Json } catch { $mcpParseError = $_.Exception.Message }
    if ($null -eq $mcpParsed) {
        Add-Finding -Severity 'hard' -Check 'H4: .mcp.json placeholder syntax' `
            -Detail "Not valid JSON, Claude Code loads no project MCP servers: $mcpParseError" `
            -Fix 'powershell -File scripts\sync-mcp-config.ps1   (regenerates .mcp.json from mcp/registry.template.json)'
    } elseif ($null -eq $mcpParsed.PSObject.Properties['mcpServers']) {
        Add-Finding -Severity 'hard' -Check 'H4: .mcp.json placeholder syntax' `
            -Detail 'Valid JSON but no mcpServers key -- Claude Code loads no project MCP servers' `
            -Fix 'powershell -File scripts\sync-mcp-config.ps1'
    } elseif (([regex]::Matches($mcpRaw, '\$\{env:[A-Za-z_][A-Za-z0-9_]*\}')).Count -gt 0) {
        $cursorStyle = [regex]::Matches($mcpRaw, '\$\{env:[A-Za-z_][A-Za-z0-9_]*\}')
        $sample = (($cursorStyle | Select-Object -First 3 | ForEach-Object { $_.Value }) -join ', ')
        $h4Detail = "$($cursorStyle.Count) Cursor-style placeholder(s) of the form " + '${env:NAME}' + " in .mcp.json -- Claude Code does NOT expand that form, so each server gets the literal text as its path or credential. Sample: $sample"
        Add-Finding -Severity 'hard' -Check 'H4: .mcp.json placeholder syntax' `
            -Detail $h4Detail `
            -Fix 'powershell -File scripts\sync-mcp-config.ps1   (if they return, the generator regressed: check Resolve-EnvValue ClaudeProjectPlaceholder in scripts\sync-mcp-config.ps1)'
    } else {
        Add-Finding -Severity 'pass' -Check 'H4: .mcp.json placeholder syntax' `
            -Detail ('no ' + '${env:NAME}' + ' placeholders (Claude Code expands ${NAME} only)')
    }
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

    if ($tracked.Count -eq 0) {
        # A vacuous pass: with no tracked files, $missing is empty and the else-branch below
        # would report "0 tracked file(s) all present on disk" as a PASS -- a green line for a
        # comparison that never happened. `git ls-files` returning nothing means the detector
        # produced no evidence (wrong root, git failure, path renamed), not that parity holds.
        Add-Finding -Severity 'hard' -Check "H3: .claude/$subdir git/disk parity" `
            -Detail "git ls-files returned NOTHING for $relPath - no evidence was produced, so parity is unverified (not passing)." `
            -Fix "Check the resolved monorepo root and that $relPath is still tracked: git -C <root> ls-files $relPath"
    } elseif ($missing.Count -gt 0) {
        $sample = ($missing | Select-Object -First 3) -join ', '
        $more = if ($missing.Count -gt 3) { " (+$($missing.Count - 3) more)" } else { '' }
        Add-Finding -Severity 'hard' -Check "H3: .claude/$subdir git/disk parity" `
            -Detail "$($missing.Count) file(s) tracked in git but missing on disk: $sample$more. Junction likely broken." `
            -Fix 'powershell -File scripts\bootstrap-mcp-machine.ps1 (recreate junction); then git checkout HEAD -- .claude/'
    } else {
        Add-Finding -Severity 'pass' -Check "H3: .claude/$subdir git/disk parity" `
            -Detail "$($tracked.Count) tracked file(s) all present on disk"
    }

    # SOFT: extras = untracked AND not ignored, decided by git with the repo's .gitignore only (same flags as
    # scripts/verify-asset-mcp-refs.mjs). A filesystem walk counted gitignored app output (.claude/skills/synced/)
    # as local work and told the operator to `git add` it.
    $repoSubdirAbs = Join-Path $MonorepoRoot ($relPath -replace '/', '\')
    if (Test-Path -LiteralPath $repoSubdirAbs) {
        $diskFiles = @(& git -C $MonorepoRoot ls-files --others --exclude-per-directory=.gitignore -- $relPath 2>$null)
        if ($LASTEXITCODE -ne 0) {
            Add-Finding -Severity 'hard' -Check "S1: .claude/$subdir uncommitted extras" `
                -Detail "git ls-files --others failed (exit $LASTEXITCODE) - extras unverified (not passing)." `
                -Fix "git -C <root> ls-files --others --exclude-per-directory=.gitignore -- $relPath"
            continue
        }
        # Claude Code runtime junk under ~/.claude/ (via the junction) that .gitignore does not cover.
        # Conservative deny-list: anything new surfaces as SOFT until we know what it is.
        $relevant = $diskFiles | Where-Object {
            $name = Split-Path $_ -Leaf
            $isReadme = ($subdir -eq 'agents' -and ($name -eq 'README.md' -or $name -eq 'README.zh-TW.md'))
            $isRuntimeJunk = $_ -match '/(?:\.cache|\.history|\.shell-snapshots|node_modules|__pycache__|\.venv)(?:/|$)'
            -not ($isReadme -or $isRuntimeJunk)
        }
        $extras = @($relevant)
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

# Atomic write: temp file + rename. NTFS same-volume rename is atomic, so the
# reader (system-health-check.ps1) never sees a partial JSON. Without this,
# concurrent AO-RESUME hooks (120s dedup is best-effort, not a lock) could race
# the writer and the reader catches a half-written file -> Skipped pass
# silently masks real drift. See critic notes 2026-05-22.
#
# PS 5.1 / .NET Framework 4.x note: File.Move(src, dst, overwrite) 3-arg
# overload only exists in .NET Core / .NET 5+. Use File.Replace for the
# overwrite case (atomic on NTFS) and 2-arg File.Move for first-time write.
$encoding = New-Object System.Text.UTF8Encoding $false
$tmpJsonPath = $JsonPath + '.tmp'
[System.IO.File]::WriteAllText($tmpJsonPath, ($result | ConvertTo-Json -Depth 10), $encoding)
if (Test-Path -LiteralPath $JsonPath) {
    # PS 5.1 marshalling quirk: bare $null gets coerced to '' which File.Replace
    # rejects with "not a valid path format". [NullString]::Value is the only
    # form that survives into the C# String parameter as a real null reference.
    [System.IO.File]::Replace($tmpJsonPath, $JsonPath, [NullString]::Value)
} else {
    [System.IO.File]::Move($tmpJsonPath, $JsonPath)
}

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
