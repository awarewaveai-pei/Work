<#
.SYNOPSIS
  Audit PowerShell scripts for CP950 stdout-capture traps that lack
  `Invoke-WithUtf8Console` protection.

.DESCRIPTION
  zh-TW Windows defaults [Console]::OutputEncoding to CP950 (Big5). When PowerShell
  captures stdout from external commands (& ssh, & docker, & wp, & scp, & git, etc.),
  UTF-8 bytes get mojibake'd — Chinese characters become `??` and multi-byte sequences
  can eat newline bytes (root cause of backfill-missed-daily.ps1 bug, 2026-05-22).

  This tool walks the AST of each .ps1 file looking for:
    1. CommandAst nodes whose command name matches `ssh|docker|wp|scp|git`
    2. NOT inside a ScriptBlockExpressionAst whose enclosing call is `Invoke-WithUtf8Console`

  Reports unprotected sites. Does NOT auto-fix (operator decides).

  Exits:
    0  clean — no unprotected traps found
    1  drift — at least one unprotected trap; exit code suitable for CI gate
    2  error — invalid args / unreadable files

.PARAMETER Path
  Root path(s) to scan. Default scans the standard SSOT locations.

.PARAMETER File
  Single file mode (overrides Path).

.PARAMETER Json
  Output machine-readable JSON instead of human Markdown.

.PARAMETER Quiet
  Suppress per-file "OK" lines; only show drift.

.EXAMPLE
  powershell -File scripts/audit-cp950-traps.ps1
  # scan defaults, human report

  powershell -File scripts/audit-cp950-traps.ps1 -Json
  # machine-readable for CI / dashboards

  powershell -File scripts/audit-cp950-traps.ps1 -File scripts/foo.ps1
  # single-file check (used by code-change-tracker hook)

.NOTES
  Companion: scripts/_console-encoding-helpers.ps1 (the helper this tool checks for)
  Slash:     /audit-encoding (calls this tool with sensible defaults)
  Registry:  agency-os/docs/operations/AUDIT_REGISTRY.md (long-term audit record)
  AGENTS.md: §代理自動工具使用規則 — Claude auto-runs this on Edit/Write of .ps1 files
             containing capture patterns

  Default scan paths (kept explicit to avoid scanning node_modules / Backups):
    scripts/
    agency-os/scripts/
    lobster-factory/infra/**/scripts/
    lobster-factory/infra/trigger/
    mcp/claude-userlevel/hooks/ (PS hooks only)

  Excludes:
    **/node_modules/**
    **/Backups/**
    *.test.ps1 / *.spec.ps1
#>

[CmdletBinding()]
param(
    [string[]]$Path = @(),
    [string]$File = "",
    [switch]$Json,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Dogfood: this tool itself captures `git` stdout in Resolve-RepoRoot — must use the helper
# it audits for, otherwise the auditor IS a trap.
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

# Command names we treat as CP950-sensitive (capture trap candidates).
# Linux/Unix native commands invoked from PowerShell on Windows hit the
# [Console]::OutputEncoding boundary; pure-PS cmdlets do not.
$script:CaptureCmds = @('ssh', 'docker', 'wp', 'scp', 'git', 'kubectl', 'helm', 'curl', 'wget')

# Default scan paths if -Path not given.
$script:DefaultScanPaths = @(
    'scripts',
    'agency-os\scripts',
    'lobster-factory\infra\hetzner-phase1-core\scripts',
    'lobster-factory\infra\trigger',
    'mcp\claude-userlevel\hooks'
)

function Resolve-RepoRoot {
    try {
        # Dogfood: wrap our own git capture in the same helper this tool audits for.
        $r = Invoke-WithUtf8Console { & git rev-parse --show-toplevel 2>$null }
        if ($LASTEXITCODE -eq 0 -and $r) { return ($r -replace '/', '\').TrimEnd('\') }
    } catch { }
    return (Get-Location).Path
}

function Test-IsInsideUtf8ConsoleBlock {
    <#
      Walk parent chain. Return $true if a CommandAst named
      'Invoke-WithUtf8Console' wraps our scriptblock.
    #>
    param($Ast)
    $node = $Ast
    while ($node) {
        $parent = $node.Parent
        if ($null -eq $parent) { break }
        # Look for ScriptBlockExpressionAst → its Parent should be CommandAst
        if ($parent -is [System.Management.Automation.Language.ScriptBlockExpressionAst]) {
            $caller = $parent.Parent
            if ($caller -is [System.Management.Automation.Language.CommandAst]) {
                if ($caller.CommandElements.Count -ge 1) {
                    $first = $caller.CommandElements[0]
                    if ($first -is [System.Management.Automation.Language.StringConstantExpressionAst]) {
                        if ($first.Value -eq 'Invoke-WithUtf8Console') {
                            return $true
                        }
                    }
                }
            }
        }
        $node = $parent
    }
    return $false
}

function Test-FileHasScriptLevelProtection {
    <#
      Pattern B: file sets [Console]::OutputEncoding = UTF8 somewhere at script-level
      (before any capture site). Covers backfill-missed-daily / print-open-tasks pattern.
      Returns $true if such a line exists in the source.
    #>
    param([string]$ScriptPath)
    try {
        $content = [System.IO.File]::ReadAllText($ScriptPath, [System.Text.Encoding]::UTF8)
        # Match `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` or `= [Text.Encoding]::UTF8` etc.
        return ($content -match '\[Console\]::OutputEncoding\s*=\s*\[(?:System\.)?Text\.Encoding\]::UTF8')
    } catch {
        return $false
    }
}

function Get-UnprotectedCaptures {
    <#
      Return list of @{File, Line, Cmd, Snippet} for unprotected capture sites.
    #>
    param([string]$ScriptPath)

    # Pattern B check (script-level set). If file has it, treat all captures as protected.
    if (Test-FileHasScriptLevelProtection -ScriptPath $ScriptPath) {
        return ,@()
    }

    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$errors)
    if ($errors -and $errors.Count -gt 0) {
        return @(
            [pscustomobject]@{
                File    = $ScriptPath
                Line    = $errors[0].Extent.StartLineNumber
                Cmd     = '(parse-error)'
                Snippet = $errors[0].Message
                Status  = 'parse-error'
            }
        )
    }

    $findings = New-Object System.Collections.Generic.List[object]
    $captures = $ast.FindAll({
        param($n)
        if ($n -isnot [System.Management.Automation.Language.CommandAst]) { return $false }
        if ($n.CommandElements.Count -lt 1) { return $false }
        $first = $n.CommandElements[0]
        if ($first -isnot [System.Management.Automation.Language.StringConstantExpressionAst]) { return $false }
        $cmdName = $first.Value
        return ($script:CaptureCmds -contains $cmdName)
    }, $true)

    foreach ($c in $captures) {
        # Only `&` invocation form is the trap (no `&` means it's parsed as standalone — also captures stdout).
        # PowerShell parses both `& ssh` and bare `ssh` as CommandAst with InvocationOperator=Ampersand or Unknown.
        # For audit purposes, treat both as captures (assignment with `$x = ssh ...` also leaks stdout).

        $protected = Test-IsInsideUtf8ConsoleBlock -Ast $c
        if (-not $protected) {
            $line = $c.Extent.StartLineNumber
            $snippet = $c.Extent.Text
            if ($snippet.Length -gt 100) { $snippet = $snippet.Substring(0, 100) + '...' }
            $findings.Add([pscustomobject]@{
                File    = $ScriptPath
                Line    = $line
                Cmd     = $c.CommandElements[0].Value
                Snippet = $snippet
                Status  = 'unprotected'
            }) | Out-Null
        }
    }

    return ,$findings.ToArray()
}

function Get-ScanTargets {
    param([string[]]$RootPaths, [string]$RepoRoot)

    $files = New-Object System.Collections.Generic.List[string]
    foreach ($p in $RootPaths) {
        $absRoot = if ([System.IO.Path]::IsPathRooted($p)) { $p } else { Join-Path $RepoRoot $p }
        if (-not (Test-Path -LiteralPath $absRoot)) { continue }
        Get-ChildItem -LiteralPath $absRoot -Filter '*.ps1' -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object {
                $f = $_.FullName
                ($f -notmatch '\\node_modules\\') -and
                ($f -notmatch '\\Backups\\') -and
                ($_.Name -notmatch '\.(test|spec)\.ps1$')
            } |
            ForEach-Object { [void]$files.Add($_.FullName) }
    }
    return ,$files.ToArray()
}

# ── Main ──────────────────────────────────────────────────────────────────────
$repoRoot = Resolve-RepoRoot

if ($File) {
    $absFile = if ([System.IO.Path]::IsPathRooted($File)) { $File } else { Join-Path $repoRoot $File }
    if (-not (Test-Path -LiteralPath $absFile)) {
        Write-Error "audit-cp950-traps: file not found: $absFile"
        exit 2
    }
    $scanFiles = @($absFile)
} else {
    if ($Path.Count -eq 0) { $Path = $script:DefaultScanPaths }
    $scanFiles = Get-ScanTargets -RootPaths $Path -RepoRoot $repoRoot
}

$allFindings = New-Object System.Collections.Generic.List[object]
$cleanCount = 0
foreach ($f in $scanFiles) {
    $rel = $f.Replace($repoRoot + '\', '').Replace('\', '/')
    # NOTE: Get-UnprotectedCaptures returns `,$array` (idiomatic to prevent unwrapping). DO NOT
    # wrap again with @() — that produces double-wrap (1-element array containing the real array),
    # then `foreach ($x in $findings)` yields an empty array as $x and $x.Line throws under StrictMode.
    $findings = Get-UnprotectedCaptures -ScriptPath $f
    if ($null -eq $findings) { $findings = @() }
    # Force-coerce to array — under StrictMode, if Get-... returned a single non-array object,
    # .Count would fail. @() ensures uniform array type.
    $findings = @($findings)
    if ($findings.Count -eq 0) {
        $cleanCount++
        if (-not $Quiet -and -not $Json) { Write-Host ("  OK   {0}" -f $rel) -ForegroundColor DarkGray }
    } else {
        # Build new objects rather than mutate (StrictMode + pscustomobject mutation can fail).
        foreach ($x in $findings) {
            [void]$allFindings.Add([pscustomobject]@{
                File    = $rel
                Line    = $x.Line
                Cmd     = $x.Cmd
                Snippet = $x.Snippet
                Status  = $x.Status
            })
        }
    }
}

# ── Report ────────────────────────────────────────────────────────────────────
$totalDrift = $allFindings.Count

if ($Json) {
    $payload = [ordered]@{
        timestamp_utc = (Get-Date).ToUniversalTime().ToString('o')
        repo_root     = $repoRoot
        scanned       = $scanFiles.Count
        clean         = $cleanCount
        drift_count   = $totalDrift
        findings      = $allFindings
    }
    $payload | ConvertTo-Json -Depth 6
} else {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host (" audit-cp950-traps: scanned={0} clean={1} drift={2}" -f $scanFiles.Count, $cleanCount, $totalDrift) -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    if ($totalDrift -gt 0) {
        Write-Host ""
        Write-Host "Unprotected capture sites (must wrap in Invoke-WithUtf8Console { ... }):" -ForegroundColor Yellow
        foreach ($x in $allFindings) {
            Write-Host ("  {0}:{1}  [{2}]  {3}" -f $x.File, $x.Line, $x.Cmd, $x.Snippet) -ForegroundColor Yellow
        }
        Write-Host ""
        Write-Host "Fix pattern:" -ForegroundColor DarkGray
        Write-Host "  . (Join-Path `$PSScriptRoot '_console-encoding-helpers.ps1')" -ForegroundColor DarkGray
        Write-Host "  `$out = Invoke-WithUtf8Console { & ssh ... 2>&1 }" -ForegroundColor DarkGray
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "  CLEAN — no unprotected capture sites." -ForegroundColor Green
        Write-Host ""
    }
}

if ($totalDrift -gt 0) { exit 1 } else { exit 0 }
