<#
.SYNOPSIS
  Audit PowerShell scripts for CP950 stdout-capture traps that lack
  `Invoke-WithUtf8Console` protection.

.DESCRIPTION
  zh-TW Windows defaults [Console]::OutputEncoding to CP950 (Big5). When PowerShell
  captures stdout from external commands (& ssh, & docker, & wp, & scp, & git, etc.),
  UTF-8 bytes get mojibake'd — Chinese characters become `??` and multi-byte sequences
  can eat newline bytes (root cause of backfill-missed-daily.ps1 bug, 2026-05-22).

  This tool walks the AST of each .ps1 file looking for THREE independent CP950-trap shapes:
    1. CommandAst nodes whose command name matches `ssh|docker|wp|scp|git` (capture-trap),
       NOT inside a ScriptBlockExpressionAst whose enclosing call is `Invoke-WithUtf8Console`
    2. BOM-less non-ASCII .ps1 source that fails to parse when decoded as CP950 (parse-break)
    3. `Get-Content` calls with `-Raw` present but `-Encoding` absent (unencoded-raw-read) --
       a DATA FILE read (not command capture, not script self-parse) that silently mis-decodes
       CJK content under CP950 and, for unmappable sequences, loses it IRREVERSIBLY. Root cause
       of the 2026-08-29 codex-oracle.ps1 incident (29 corrupted artifacts, commit `fe87cf05`).
       Deliberately scoped to `-Raw`; non-Raw (line-array) reads carry the same theoretical risk
       but are out of scope -- see AUDIT_REGISTRY.md CP950 section for the documented boundary.

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

.PARAMETER RawReadOnly
  Gate mode. Skip the capture-trap AST audit AND the parse-break check; report ONLY the
  'unencoded-raw-read' class (`Get-Content -Raw` without `-Encoding` -> silent, sometimes
  irreversible CJK data-file corruption under CP950). Mutually exclusive with -ParseBreakOnly
  (specifying both is an error -- each Only-switch means "report ONLY this one class", and
  combining them would silently report nothing). This is the second class wired into
  system-health-check.ps1 as a hard AO-CLOSE gate, alongside -ParseBreakOnly.

.EXAMPLE
  powershell -File scripts/audit-cp950-traps.ps1
  # scan defaults, human report

  powershell -File scripts/audit-cp950-traps.ps1 -Json
  # machine-readable for CI / dashboards

  powershell -File scripts/audit-cp950-traps.ps1 -File scripts/foo.ps1
  # single-file check (used by code-change-tracker hook)

  powershell -File scripts/audit-cp950-traps.ps1 -RawReadOnly -Quiet
  # AO-CLOSE hard gate: ONLY unencoded-raw-read class (mirrors -ParseBreakOnly)

.NOTES
  Companion: scripts/_console-encoding-helpers.ps1 (the helper this tool checks for)
  Slash:     /audit-encoding (calls this tool with sensible defaults)
  Registry:  agency-os/docs/operations/AUDIT_REGISTRY.md (long-term audit record)
  TOOL_TRIGGER_MAP.md §代理自動工具使用規則（2026-09-04 自 AGENTS.md 搬入）— Claude auto-runs this on Edit/Write of .ps1 files
             containing capture patterns

  Default scan paths (kept explicit to avoid scanning node_modules / Backups):
    scripts/
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
    [switch]$ParseBreakOnly,
    [switch]$RawReadOnly
)

if ($ParseBreakOnly -and $RawReadOnly) {
    Write-Error "audit-cp950-traps: -ParseBreakOnly and -RawReadOnly are mutually exclusive (each means 'report ONLY this one class' -- combining them reports nothing)."
    exit 2
}

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
    'lobster-factory\infra\hetzner-phase1-core\scripts',
    'lobster-factory\infra\trigger',
    'mcp\claude-userlevel\hooks'
)

function Resolve-RepoRoot {
    <#
      CWD-independent by construction: `git -C $script:scriptDir` anchors to this SCRIPT's own
      location, not wherever the caller happened to be when they launched it. Critic review
      (2026-08-29) M2: the previous plain `git rev-parse --show-toplevel` (no -C) resolves
      against the process's current directory, which is NOT guaranteed to be inside the repo --
      e.g. a Scheduled Task with no configured "Start in" defaults CWD to %SystemRoot%\System32.
      In that case `Get-Location` fallback returns System32, every Join-Path under it misses,
      Get-ScanTargets returns zero files, and a gate mode reports `drift=0` -> exit 0 -> CLEAN,
      having inspected nothing. Guarded against by the caller asserting scanned>0 in gate modes
      (see Main), but fixing resolution here closes the more common trigger for that state.
      Falls back to Split-Path (scripts/ -> repo root) if git itself is unavailable/fails --
      still CWD-independent, just less authoritative than an actual git toplevel.
    #>
    try {
        # Dogfood: wrap our own git capture in the same helper this tool audits for.
        $r = Invoke-WithUtf8Console { & git -C $script:scriptDir rev-parse --show-toplevel 2>$null }
        if ($LASTEXITCODE -eq 0 -and $r) { return ($r -replace '/', '\').TrimEnd('\') }
    } catch { }
    if ($script:scriptDir) { return (Split-Path -Path $script:scriptDir -Parent) }
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

function Get-UnencodedRawReadFindings {
    <#
      Detects `Get-Content` calls with `-Raw` present but `-Encoding` absent -- the class that
      corrupted 29 CJK artifacts in codex-oracle.ps1 (2026-08-29, commit fe87cf05). Unlike the
      capture-trap class (external command stdout) this is a DATA FILE READ: PowerShell 5.1's
      Get-Content falls back to the system ANSI codepage (CP950 on Big5 hosts) for any -Raw read
      without an explicit -Encoding, UNLESS the file itself starts with a UTF-8 BOM (auto-detected
      regardless of -Encoding). A BOM-less UTF-8 data file -- common when the writer is an
      external tool, e.g. `codex -o <file>` -- then has its CJK multi-byte sequences misdecoded,
      and CP950's unmappable-sequence fallback (0x3F '?') makes the loss IRREVERSIBLE: there is
      no way to recover the original bytes from the corrupted string.

      Deliberately scoped to `-Raw` only (matches the actual incident + task scope); non-Raw
      (line-array) Get-Content carries a theoretically identical risk but is out of scope --
      see AUDIT_REGISTRY.md CP950 section for the documented boundary.

      Detector is intentionally dumb (parameter-presence check only, no data-flow / BOM
      inference) -- see Get-Cp950ParseBreakFinding's BOM short-circuit for the contrast, and
      AUDIT_REGISTRY.md's TRACKED-table note on why a "this call site is probably safe" heuristic
      is exactly the shape that let a live gate-bypass hide for 3 months in the capture-trap
      class. All per-site safety nuance belongs in the AUDIT_REGISTRY classification, not here.

      Parameter names are matched by unambiguous-prefix (PowerShell parameter binding allows
      `-Enc` for `-Encoding`), not exact string, so an abbreviated real -Encoding isn't missed.
      Command name recognizes Get-Content's built-in aliases (gc/cat/type) and a module-qualified
      form (`Microsoft.PowerShell.Management\Get-Content`), not just the literal cmdlet name --
      codex-oracle review (2026-08-29) FINDING 3: an exact-string match silently evades detection
      for any of those valid, common PowerShell forms.

      A file that fails to parse returns ONE finding (Status='unencoded-raw-read-unverifiable')
      instead of silently returning empty -- codex-oracle review (2026-08-29) FINDING 1: in
      `-RawReadOnly` gate mode the parse-break class (which would otherwise report this file) is
      deliberately skipped (see main loop), so a parse-broken file that ALSO has a real unencoded
      -Raw read would otherwise be invisible to the hard gate -- fail CLOSED, not open, when this
      tool cannot verify a file at all. Mirrors Get-UnprotectedCaptures' existing 'parse-error'
      Status, which already does this for class 1.

      Returns array of findings (Status='unencoded-raw-read' or 'unencoded-raw-read-unverifiable'),
      possibly empty.
    #>
    param([string]$ScriptPath)

    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$errors)
    if ($errors -and $errors.Count -gt 0) {
        return @(
            [pscustomobject]@{
                File    = $ScriptPath
                Line    = $errors[0].Extent.StartLineNumber
                Cmd     = '(unencoded-raw-read-unverifiable)'
                Snippet = ("file has parse error(s), cannot statically verify Get-Content -Raw encoding safety -- fix the parse error (see cp950-parse-break / parse-error if applicable), then re-run: {0}" -f $errors[0].Message)
                Status  = 'unencoded-raw-read-unverifiable'
            }
        )
    }

    $script:GetContentNames = @('get-content', 'gc', 'cat', 'type')
    $findings = New-Object System.Collections.Generic.List[object]
    $calls = $ast.FindAll({
        param($n)
        if ($n -isnot [System.Management.Automation.Language.CommandAst]) { return $false }
        if ($n.CommandElements.Count -lt 1) { return $false }
        $first = $n.CommandElements[0]
        if ($first -isnot [System.Management.Automation.Language.StringConstantExpressionAst]) { return $false }
        $name = $first.Value.ToLowerInvariant()
        if ($script:GetContentNames -contains $name) { return $true }
        # Module-qualified form, e.g. Microsoft.PowerShell.Management\Get-Content
        return ($name -match '\\get-content$')
    }, $true)

    # Critic review (2026-08-29) M1: -Encoding's VALUE matters, not just its presence.
    # -Encoding Default / -Encoding Oem reproduce the CP950 bug byte-for-byte (measured: same
    # mangled output as no -Encoding at all); -Encoding Ascii is worse (silently drops non-ASCII
    # to '?' with no fallback path at all). A presence-only check lets any of these -- all
    # legitimate-looking PowerShell values -- silence the gate while the corruption continues.
    # Only the values this repo's own established convention actually uses (verified 2026-08-29:
    # 100% of ~90 pre-existing -Raw -Encoding call sites use UTF8) are trusted as safe.
    $script:SafeEncodingValues = @('utf8', 'utf8bom', 'utf8nobom')

    foreach ($c in $calls) {
        $hasRaw = $false
        # $encodingState: $null = parameter absent; 'safe' | 'unsafe' | 'unverifiable'
        # (unverifiable = -Encoding present but its value isn't a literal string this tool can
        # read statically, e.g. a variable, expression, or splatted parameter -- fail CLOSED,
        # same principle as the parse-error handling above, not "assume safe because unknown").
        $encodingState = $null
        for ($i = 0; $i -lt $c.CommandElements.Count; $i++) {
            $el = $c.CommandElements[$i]
            if ($el -isnot [System.Management.Automation.Language.CommandParameterAst]) { continue }
            $pname = $el.ParameterName
            if ($pname.Length -ge 2 -and 'raw'.StartsWith($pname, [StringComparison]::OrdinalIgnoreCase)) { $hasRaw = $true }
            if (-not ($pname.Length -ge 2 -and 'encoding'.StartsWith($pname, [StringComparison]::OrdinalIgnoreCase))) { continue }
            # Value comes from either colon syntax (-Encoding:UTF8, attached as .Argument) or
            # space syntax (-Encoding UTF8, the next CommandElement that isn't itself a parameter).
            $valueAst = $el.Argument
            if (-not $valueAst -and ($i + 1) -lt $c.CommandElements.Count) {
                $next = $c.CommandElements[$i + 1]
                if ($next -isnot [System.Management.Automation.Language.CommandParameterAst]) { $valueAst = $next }
            }
            if ($null -eq $valueAst) {
                $encodingState = 'unverifiable'
            } elseif ($valueAst -is [System.Management.Automation.Language.StringConstantExpressionAst]) {
                $val = $valueAst.Value.ToLowerInvariant()
                $encodingState = if ($script:SafeEncodingValues -contains $val) { 'safe' } else { 'unsafe' }
            } else {
                $encodingState = 'unverifiable'
            }
        }
        if (-not $hasRaw) { continue }
        if ($null -eq $encodingState) {
            $snippet = $c.Extent.Text -replace '\s+', ' '
            if ($snippet.Length -gt 100) { $snippet = $snippet.Substring(0, 100) + '...' }
            $findings.Add([pscustomobject]@{
                File    = $ScriptPath
                Line    = $c.Extent.StartLineNumber
                Cmd     = '(unencoded-raw-read)'
                Snippet = $snippet
                Status  = 'unencoded-raw-read'
            }) | Out-Null
        } elseif ($encodingState -eq 'unsafe') {
            $snippet = $c.Extent.Text -replace '\s+', ' '
            if ($snippet.Length -gt 100) { $snippet = $snippet.Substring(0, 100) + '...' }
            $findings.Add([pscustomobject]@{
                File    = $ScriptPath
                Line    = $c.Extent.StartLineNumber
                Cmd     = '(unencoded-raw-read)'
                Snippet = ("-Encoding value is not UTF8/UTF8BOM/UTF8NoBOM -- {0}" -f $snippet)
                Status  = 'unencoded-raw-read'
            }) | Out-Null
        } elseif ($encodingState -eq 'unverifiable') {
            $snippet = $c.Extent.Text -replace '\s+', ' '
            if ($snippet.Length -gt 100) { $snippet = $snippet.Substring(0, 100) + '...' }
            $findings.Add([pscustomobject]@{
                File    = $ScriptPath
                Line    = $c.Extent.StartLineNumber
                Cmd     = '(unencoded-raw-read-unverifiable)'
                Snippet = ("-Encoding value is not a static literal (variable/expression/splat) -- cannot verify statically: {0}" -f $snippet)
                Status  = 'unencoded-raw-read-unverifiable'
            }) | Out-Null
        }
        # 'safe' -> no finding.
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

# Gate modes must not report "clean" having scanned nothing -- critic review (2026-08-29) M2:
# even with Resolve-RepoRoot fixed to be CWD-independent, a misconfigured -Path or a repo layout
# change could still leave $scanFiles empty, and drift=0-because-nothing-scanned is
# indistinguishable from drift=0-because-actually-clean unless checked explicitly. A hard gate
# reporting CLEAN after inspecting zero files is worse than not having the gate.
if (($ParseBreakOnly -or $RawReadOnly) -and $scanFiles.Count -eq 0) {
    Write-Error ("audit-cp950-traps: gate mode scanned 0 files (repoRoot={0}) -- refusing to report CLEAN having inspected nothing. Check -Path / repo layout." -f $repoRoot)
    exit 2
}

$allFindings = New-Object System.Collections.Generic.List[object]
$cleanCount = 0
foreach ($f in $scanFiles) {
    $rel = $f.Replace($repoRoot + '\', '').Replace('\', '/')
    # NOTE: Get-UnprotectedCaptures returns `,$array` (idiomatic to prevent unwrapping). DO NOT
    # wrap again with @() — that produces double-wrap (1-element array containing the real array),
    # then `foreach ($x in $findings)` yields an empty array as $x and $x.Line throws under StrictMode.
    #
    # Each -XOnly switch means "report ONLY that one class" (system-health-check.ps1 depends on
    # this exact contract for -ParseBreakOnly already; -RawReadOnly must not silently widen what
    # -ParseBreakOnly reports, and vice versa — hence each class is individually gated off by the
    # OTHER switch, not just by its own).
    if ($ParseBreakOnly -or $RawReadOnly) {
        # Gate mode: skip the capture-trap backlog.
        $findings = @()
    } else {
        $findings = Get-UnprotectedCaptures -ScriptPath $f
        if ($null -eq $findings) { $findings = @() }
        # Force-coerce to array — under StrictMode, if Get-... returned a single non-array object,
        # .Count would fail. @() ensures uniform array type.
        $findings = @($findings)
    }
    if (-not $RawReadOnly) {
        # Host-independent parse-break check (non-ASCII without BOM that breaks under CP950).
        $cp950Finding = Get-Cp950ParseBreakFinding -ScriptPath $f
        if ($cp950Finding) { $findings = @($findings) + $cp950Finding }
    }
    if (-not $ParseBreakOnly) {
        # Same pipeline-unwrap idiom as Get-UnprotectedCaptures above: assign the call directly
        # (no @() at the call site — that would double-wrap the `,$arr` single-object emission
        # into a 1-element array containing the real array), THEN @() the captured variable to
        # normalize null/scalar into a flat array.
        $rawReadFindings = Get-UnencodedRawReadFindings -ScriptPath $f
        if ($null -eq $rawReadFindings) { $rawReadFindings = @() }
        $rawReadFindings = @($rawReadFindings)
        if ($rawReadFindings.Count -gt 0) { $findings = @($findings) + $rawReadFindings }
    }
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
        if (@($allFindings | Where-Object { $_.Status -eq 'unencoded-raw-read' }).Count -gt 0) {
            Write-Host "Fix pattern (unencoded raw reads):" -ForegroundColor DarkGray
            Write-Host "  Get-Content -LiteralPath <path> -Raw -Encoding UTF8" -ForegroundColor DarkGray
            Write-Host ""
        }
        if (@($allFindings | Where-Object { $_.Status -eq 'unencoded-raw-read-unverifiable' }).Count -gt 0) {
            Write-Host "Fix pattern (unverifiable -- see the Snippet above for which case):" -ForegroundColor DarkGray
            Write-Host "  Parse error: fix the parse error first (see the parse-error / cp950-parse-break" -ForegroundColor DarkGray
            Write-Host "  finding for the same file if present), then re-run this audit." -ForegroundColor DarkGray
            Write-Host "  Non-literal -Encoding value (variable/expression/splat): replace with a literal" -ForegroundColor DarkGray
            Write-Host "  -Encoding UTF8, or verify manually that the value always resolves to UTF8." -ForegroundColor DarkGray
            Write-Host ""
        }
    } else {
        Write-Host ""
        Write-Host "  CLEAN - no unprotected capture sites." -ForegroundColor Green
        Write-Host ""
    }
}

if ($totalDrift -gt 0) { exit 1 } else { exit 0 }
