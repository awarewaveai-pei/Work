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

.PARAMETER ParseBreakOnly
  Gate mode. Skip the capture-trap AST audit (a large, mostly-accepted backlog) and report
  ONLY the catastrophic 'cp950-parse-break' class (BOM-less non-ASCII that fails to parse
  under CP950 -> the script cannot run at all). Exit 1 only if such a file exists. This is
  the class wired into system-health-check.ps1 as a hard AO-CLOSE gate.

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
    [switch]$Quiet,
    [switch]$ParseBreakOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Dogfood: this tool itself captures `git` stdout in Resolve-RepoRoot — must use the helper
# it audits for, otherwise the auditor IS a trap.
# $PSScriptRoot is empty when piped via stdin / Invoke-Expression — fall back to MyInvocation.
$script:scriptDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Get-Location).Path }
. (Join-Path $script:scriptDir "_console-encoding-helpers.ps1")

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

function Get-ScriptLevelProtectionLine {
    <#
      Pattern B: file sets [Console]::OutputEncoding = UTF8 somewhere.
      Returns the 1-based line number of the FIRST set, or -1 if not found.

      A capture site is protected by Pattern B ONLY if its line number > set's line number
      (critic round 1 found false-negative: set after capture is no protection).

      Matches all common UTF-8 set forms:
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        [Console]::OutputEncoding = [Text.Encoding]::UTF8
        [System.Console]::OutputEncoding = ...
        [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
        [Console]::OutputEncoding = (New-Object System.Text.UTF8Encoding $false)
        [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    #>
    param([string]$ScriptPath)
    try {
        $lines = [System.IO.File]::ReadAllLines($ScriptPath, [System.Text.Encoding]::UTF8)
        # Two-stage match: first hit `[Console]::OutputEncoding` set, then verify RHS has UTF8 token.
        $setRe = [regex]'\[(?:System\.)?Console\]::OutputEncoding\s*='
        $utf8Re = [regex]'(?:UTF8|UTF8Encoding)'
        for ($i = 0; $i -lt $lines.Length; $i++) {
            $line = $lines[$i]
            if ($setRe.IsMatch($line) -and $utf8Re.IsMatch($line)) {
                return ($i + 1)  # 1-based
            }
        }
        return -1
    } catch {
        return -1
    }
}

function Get-UnprotectedCaptures {
    <#
      Return list of @{File, Line, Cmd, Snippet} for unprotected capture sites.
    #>
    param([string]$ScriptPath)

    # Pattern B check: get line number of script-level set (or -1 if none).
    # Captures on lines AFTER the set are protected. Captures BEFORE the set are NOT.
    $patternBLine = Get-ScriptLevelProtectionLine -ScriptPath $ScriptPath

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

        $line = $c.Extent.StartLineNumber
        # Pattern A: wrapped in Invoke-WithUtf8Console block
        $protectedByA = Test-IsInsideUtf8ConsoleBlock -Ast $c
        # Pattern B: file sets [Console]::OutputEncoding before this capture
        $protectedByB = ($patternBLine -gt 0 -and $line -gt $patternBLine)
        if (-not $protectedByA -and -not $protectedByB) {
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

function Get-Cp950ParseBreakFinding {
    <#
      Host-INDEPENDENT detector for the parse-break class (playwright-runner.ps1 +
      generate-customer-delivery-status.ps1, both 2026-05-30). A BOM-less .ps1 containing
      non-ASCII bytes is read by Windows PowerShell 5.1 on a zh-TW host using code page 950
      (Big5). Most such files still parse (mojibake in comments/strings only) and run fine.
      But when a UTF-8 multibyte sequence decodes under CP950 into bytes that break quoting
      or brackets, the WHOLE script fails to parse and cannot run at all.

      We reproduce that deterministically on ANY host: decode the raw bytes as CP950 and parse.
        - Files WITH a UTF-8 BOM are read as UTF-8 on every host  -> always safe, skipped.
        - Pure-ASCII files decode identically under CP950          -> never break, skipped.
      This is why the naive "non-ASCII without BOM" rule is wrong: 63 repo scripts match it but
      only the genuinely syntax-breaking ones are caught here.

      Returns a finding (Status='cp950-parse-break') or $null.
    #>
    param([string]$ScriptPath)
    try {
        $bytes = [System.IO.File]::ReadAllBytes($ScriptPath)
        # BOM present => UTF-8 on every host => safe.
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { return $null }
        # Pure ASCII => CP950 decode == ASCII => never breaks. Fast path.
        $nonAscii = $false
        foreach ($b in $bytes) { if ($b -gt 0x7F) { $nonAscii = $true; break } }
        if (-not $nonAscii) { return $null }
        # GetEncoding(950) is always present on .NET Framework (PS 5.1 / Windows). On .NET Core
        # (pwsh/Linux) it needs the CodePages provider; if absent this throws -> caught -> $null.
        # The gate's home is the Windows AO-CLOSE health check, where code page 950 is always present.
        $cp950 = [System.Text.Encoding]::GetEncoding(950)
        $text = $cp950.GetString($bytes)
        $errs = $null
        [System.Management.Automation.Language.Parser]::ParseInput($text, [ref]$null, [ref]$errs) | Out-Null
        if ($errs -and $errs.Count -gt 0) {
            return [pscustomobject]@{
                File    = $ScriptPath
                Line    = $errs[0].Extent.StartLineNumber
                Cmd     = '(cp950-parse-break)'
                Snippet = ("non-ASCII without BOM breaks parsing under CP950 ({0} error(s)) -- fix: ASCII-ify if decorative, or add UTF-8 BOM if CJK is data" -f $errs.Count)
                Status  = 'cp950-parse-break'
            }
        }
        return $null
    } catch {
        return $null
    }
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
    if ($ParseBreakOnly) {
        # Gate mode: skip the capture-trap backlog; report only the catastrophic parse-break class.
        $findings = @()
    } else {
        $findings = Get-UnprotectedCaptures -ScriptPath $f
        if ($null -eq $findings) { $findings = @() }
        # Force-coerce to array — under StrictMode, if Get-... returned a single non-array object,
        # .Count would fail. @() ensures uniform array type.
        $findings = @($findings)
    }
    # Host-independent parse-break check (non-ASCII without BOM that breaks under CP950). Always runs.
    $cp950Finding = Get-Cp950ParseBreakFinding -ScriptPath $f
    if ($cp950Finding) { $findings = @($findings) + $cp950Finding }
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
        Write-Host "Encoding drift (CP950 capture traps and/or parse-breaks):" -ForegroundColor Yellow
        foreach ($x in $allFindings) {
            Write-Host ("  {0}:{1}  [{2}]  {3}" -f $x.File, $x.Line, $x.Cmd, $x.Snippet) -ForegroundColor Yellow
        }
        Write-Host ""
        if (@($allFindings | Where-Object { $_.Status -eq 'unprotected' }).Count -gt 0) {
            Write-Host "Fix pattern (capture traps):" -ForegroundColor DarkGray
            Write-Host "  . (Join-Path `$PSScriptRoot '_console-encoding-helpers.ps1')" -ForegroundColor DarkGray
            Write-Host "  `$out = Invoke-WithUtf8Console { & ssh ... 2>&1 }" -ForegroundColor DarkGray
            Write-Host ""
        }
        if (@($allFindings | Where-Object { $_.Status -eq 'cp950-parse-break' }).Count -gt 0) {
            Write-Host "Fix pattern (parse-breaks):" -ForegroundColor DarkGray
            Write-Host "  ASCII-ify decorative glyphs (box-drawing / arrows / em-dashes), OR" -ForegroundColor DarkGray
            Write-Host "  add a UTF-8 BOM when the non-ASCII is real CJK data the script must keep." -ForegroundColor DarkGray
            Write-Host ""
        }
    } else {
        Write-Host ""
        Write-Host "  CLEAN - no unprotected capture sites." -ForegroundColor Green
        Write-Host ""
    }
}

if ($totalDrift -gt 0) { exit 1 } else { exit 0 }
