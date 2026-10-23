<#
.SYNOPSIS
  Verifies BUGHUNT_DONE: hits=0 claims by running a literal search of identifier-type
  patterns in the declared scope, excluding staged files.

.DESCRIPTION
  Called from verify-closeout-completeness.ps1 (dot-sourced) after the label-presence
  and scope-keyword gates. Parses today's WORKLOG section for BUGHUNT_DONE lines where
  hits=0, extracts scope= paths and grep= patterns, runs Select-String -SimpleMatch,
  and hard-fails if any declared-clean identifier pattern has actual matches.

  WHAT this verifies:
    grep= patterns that are ASCII identifier-like: letter/$/_  start, alphanumeric +
    _$.-hyphen body, total length >= 5, no spaces or CJK. This covers function names,
    const names, variable names, command names, and config keys.

  WHAT this does NOT verify:
    - Multi-word descriptions (contain spaces)
    - CJK / Unicode patterns
    - Regex patterns with special chars (!body\.ok, \b, etc.)
    - Patterns shorter than 5 chars

  WHY the identifier filter:
    CJK and common-word patterns appear legitimately throughout a bilingual codebase.
    Identifier-like patterns (function/const names) are specific enough that a literal
    hits=0 claim is falsifiable with a grep.

  WHY staged files are excluded:
    BUGHUNT checks cross-file impact of a change. The changed files themselves are
    expected to contain the changed symbol. We verify OTHER files are not silently broken.

  USAGE — dot-sourced (recommended, avoids multiline arg-passing issues):
    . "$WorkRoot\scripts\bughunt-oracle.ps1"
    $failures = Invoke-BughuntOracle -WorklogSection $section `
                    -WorkRoot $WorkRoot -Gate $Gate -StagedFiles $staged

  USAGE — standalone (for testing / CI):
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bughunt-oracle.ps1 `
        -WorklogSectionFile <utf8-temp-file> [-BhWorkRoot <path>] [-BhGate warn|strict|off]

  NOTE on param naming: top-level params use $Bh* prefix to avoid clobbering caller's
  $WorkRoot / $Gate / $StagedFiles when dot-sourced. The function Invoke-BughuntOracle
  uses the clean names (it has its own scope).

.NOTES
  SSOT for required-roots: scripts/verify-closeout-completeness.ps1 $bhRequiredRoots.
  This oracle adds content verification on top of form verification (label + scope keyword).
  ASCII-only script body — no external command captures, no CP950 trap surface.
#>
param(
    # Standalone mode: path to UTF-8 file containing the WORKLOG section text.
    # Unused when dot-sourced; caller passes -WorklogSection to Invoke-BughuntOracle directly.
    [string]$WorklogSectionFile = "",
    # $Bh* prefix avoids clobbering caller's $WorkRoot / $Gate / $StagedFiles on dot-source.
    [string]$BhWorkRoot         = "",
    [ValidateSet("off", "warn", "strict")]
    [string]$BhGate             = "strict",
    [string[]]$BhStagedFiles    = @()
)

# ─────────────────────────────────────────────────────────────────────────────
# Core function — available after dot-source; also called by standalone entry.
# ─────────────────────────────────────────────────────────────────────────────
function Invoke-BughuntOracle {
    [OutputType([int])]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WorklogSection,

        [Parameter(Mandatory = $true)]
        [string]$WorkRoot,

        [ValidateSet("off", "warn", "strict")]
        [string]$Gate = "strict",

        [string[]]$StagedFiles = @()
    )
    Set-StrictMode -Version Latest

    if ($Gate -eq "off") { return 0 }

    # ASCII identifier-like: letter/$/_  start; alphanumeric+_$.-hyphen body; total >= 5 chars.
    # Intentionally simple regex — must be readable and stable for 30 years.
    $idRegex = '^[a-zA-Z_$][a-zA-Z0-9_$.\-]{4,}$'

    # Code-file extensions: oracle only searches source files, not documentation.
    # .md/.json/.yaml mention symbol names legitimately (WORKLOG, README, config) — not stale callers.
    $prunedDirs = @('node_modules', '.git', '.next', '.venv', '__pycache__')
    $codeExts = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase
    )
    foreach ($ext in @('.ps1','.psm1','.psd1','.ts','.tsx','.js','.jsx','.mjs','.cjs','.py','.sh','.bash')) {
        [void]$codeExts.Add($ext)
    }

    # Build staged-file exclusion set (absolute paths, case-insensitive on Windows/NTFS).
    # git returns relative forward-slash paths (e.g. scripts/foo.ps1); absolute paths also accepted
    # (test harness, CI) via IsPathRooted guard.
    $stagedSet = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase
    )
    foreach ($sf in $StagedFiles) {
        if ([string]::IsNullOrWhiteSpace($sf)) { continue }
        # git quotes non-ASCII paths with surrounding double-quotes + octal escapes.
        # Strip the outer quotes so IsPathRooted doesn't throw on the leading '"'.
        # The octal-escaped interior won't match the real Unicode path, but fail-open
        # is fine: the staged-set is an exclusion hint, not a hard requirement.
        $raw  = $sf.Trim()
        if ($raw.StartsWith('"') -and $raw.EndsWith('"') -and $raw.Length -gt 1) {
            $raw = $raw.Substring(1, $raw.Length - 2)
        }
        $norm = $raw -replace '/', [System.IO.Path]::DirectorySeparatorChar
        try {
            $abs = if ([System.IO.Path]::IsPathRooted($norm)) { $norm } else { Join-Path $WorkRoot $norm }
            [void]$stagedSet.Add($abs)
        } catch { }  # fail-open: invalid path chars (octal-escaped CJK) — skip entry
    }

    # Find BUGHUNT_DONE lines that declare hits=0 (plain "0" or "0 <description text>").
    $bhLines = @(
        ($WorklogSection -split '\r?\n') |
        Where-Object { $_ -match '^\s*-\s*BUGHUNT_DONE:' -and $_ -match '\|\s*hits=0(\b|\s|$)' }
    )

    if ($bhLines.Count -eq 0) {
        Write-Host "bughunt-oracle: no hits=0 claims to verify." -ForegroundColor DarkGray
        return 0
    }

    $oracleChecks = 0   # lines that had at least one verifiable identifier pattern
    $failCount    = 0

    foreach ($line in $bhLines) {
        $afterColon = ($line -replace '^\s*-\s*BUGHUNT_DONE:\s*', '').Trim()

        # Field separator is ' | ' (space-pipe-space).
        # Within grep= field, '|' and '+' (no surrounding spaces) are pattern separators.
        $fields = @($afterColon -split ' \| ')
        $scopeRaw = ''; $grepRaw = ''
        foreach ($f in $fields) {
            if ($f -match '^scope=(.+)$') { $scopeRaw = $Matches[1].Trim() }
            if ($f -match '^grep=(.+)$')  { $grepRaw  = $Matches[1].Trim() }
        }

        if ([string]::IsNullOrWhiteSpace($grepRaw) -or [string]::IsNullOrWhiteSpace($scopeRaw)) {
            Write-Host "bughunt-oracle: malformed line (no scope= or grep=) — skip." -ForegroundColor Yellow
            continue
        }

        # Resolve scope= to absolute paths (comma and/or whitespace separated).
        # Paths in BUGHUNT_DONE are always relative to WorkRoot (e.g. agency-os/, scripts/).
        # Guard against already-absolute paths to avoid double-join corruption.
        $scopePaths = @(
            ($scopeRaw -split '[,\s]+') |
            Where-Object { $_ } |
            ForEach-Object {
                $cleaned = $_.TrimEnd('/').TrimEnd('\') -replace '/', [System.IO.Path]::DirectorySeparatorChar
                try {
                    if ([System.IO.Path]::IsPathRooted($cleaned)) { $cleaned }
                    else { Join-Path $WorkRoot $cleaned }
                } catch { $null }
            } |
            Where-Object { $_ }
        )

        # Filter grep= to identifier-type patterns only.
        $patterns = @(
            ($grepRaw -split '[|+]') |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and $_ -match $idRegex }
        )

        if ($patterns.Count -eq 0) {
            Write-Host ("bughunt-oracle: '{0}' — no identifier patterns; oracle skips (descriptive/CJK/short)." -f $grepRaw) -ForegroundColor DarkGray
            continue
        }

        # Enumerate non-staged candidate files across all scope paths (deduplicated).
        $seenFullPaths = [System.Collections.Generic.HashSet[string]]::new(
            [System.StringComparer]::OrdinalIgnoreCase
        )
        $candidates = [System.Collections.Generic.List[System.IO.FileInfo]]::new()

        foreach ($sp in $scopePaths) {
            if (-not (Test-Path -LiteralPath $sp)) {
                Write-Host ("bughunt-oracle: scope not found — skip: {0}" -f $sp) -ForegroundColor DarkGray
                continue
            }
            $entry = Get-Item -LiteralPath $sp -ErrorAction SilentlyContinue
            if ($null -eq $entry) { continue }

            $files = if ($entry.PSIsContainer) {
                # Pruned walk: vendored/generated trees are never call sites, and .next holds copies of our own
                # code (a false hit for a hits=0 claim); recursing node_modules made one claim cost minutes.
                $found = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
                $stack = [System.Collections.Generic.Stack[System.IO.DirectoryInfo]]::new()
                $stack.Push([System.IO.DirectoryInfo]::new($entry.FullName))
                while ($stack.Count -gt 0) {
                    $d = $stack.Pop()
                    try {
                        foreach ($sub in $d.GetDirectories()) { if ($prunedDirs -notcontains $sub.Name) { $stack.Push($sub) } }
                        foreach ($fi in $d.GetFiles()) { $found.Add($fi) }
                    } catch { }  # unreadable directory: same as Get-ChildItem -ErrorAction SilentlyContinue
                }
                @($found)
            } else {
                @($entry)
            }
            # For scopes INSIDE WorkRoot, prevent junction/symlink traversal outside (e.g. .claude/ → ~/.claude/).
            # For explicitly-declared scopes outside WorkRoot, allow — they are intentional (test fixtures, CI paths).
            $workRootPrefix = $WorkRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
            $scopeIsInsideWorkRoot = $sp.StartsWith($workRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)
            foreach ($fi in $files) {
                # Only search code files — .md/.json/.yaml legitimately mention symbol names.
                if (-not $codeExts.Contains($fi.Extension)) { continue }
                # Skip files that escaped WorkRoot via junction traversal (only enforced for in-WorkRoot scopes).
                if ($scopeIsInsideWorkRoot -and -not $fi.FullName.StartsWith($workRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
                # Skip staged files (the changed artifacts; cross-file refs are in OTHER files).
                if ($stagedSet.Count -gt 0 -and $stagedSet.Contains($fi.FullName)) { continue }
                # Deduplicate across overlapping scope paths.
                if ($seenFullPaths.Add($fi.FullName)) { $candidates.Add($fi) }
            }
        }

        if ($candidates.Count -eq 0) {
            Write-Host "bughunt-oracle: all scope files are staged or paths missing — skip." -ForegroundColor DarkGray
            continue
        }

        $oracleChecks++

        foreach ($pat in $patterns) {
            try {
                $_bhErrors = $null
                $hits = @($candidates | Select-String -Pattern $pat -SimpleMatch -ErrorAction SilentlyContinue -ErrorVariable _bhErrors)
                if ($null -ne $_bhErrors -and $_bhErrors.Count -gt 0) {
                    Write-Warning ("bughunt-oracle: {0} file(s) unreadable while searching '{1}' — those files NOT verified." -f $_bhErrors.Count, $pat)
                }
                if ($hits.Count -gt 0) {
                    $failCount++
                    $sample = ($hits | Select-Object -First 3 |
                        ForEach-Object { "    $($_.Filename):$($_.LineNumber): $($_.Line.Trim())" }
                    ) -join [Environment]::NewLine
                    $msg = (
                        "bughunt-oracle: FALSE CLEAN — hits=0 declared but '{0}' matched {1} time(s) outside staged files.{2}{3}" -f
                        $pat, $hits.Count, [Environment]::NewLine, $sample
                    )
                    if ($Gate -eq "strict") { Write-Host $msg -ForegroundColor Red }
                    else                    { Write-Warning $msg }
                }
            } catch {
                # Non-fatal: binary file, temporary FS error. Log and continue.
                Write-Host ("bughunt-oracle: search error for '{0}': {1}" -f $pat, $_) -ForegroundColor Yellow
            }
        }
    }

    if ($oracleChecks -eq 0) {
        Write-Host "bughunt-oracle: no oracle-verifiable claims today (all descriptive/CJK/short)." -ForegroundColor DarkGray
        return 0
    }

    if ($failCount -gt 0) {
        $summary = (
            "bughunt-oracle: {0} false-clean pattern(s). Update hits= count OR re-run grep to confirm real=0. Gate={1}" -f
            $failCount, $Gate
        )
        if ($Gate -eq "strict") { Write-Host $summary -ForegroundColor Red }
        else                    { Write-Warning $summary }
    } else {
        Write-Host ("== bughunt-oracle: {0} identifier pattern(s) verified clean (staged files excluded) ==" -f $oracleChecks) -ForegroundColor Green
    }

    return $failCount
}

# ─────────────────────────────────────────────────────────────────────────────
# Standalone entry point — runs when script is executed directly (not dot-sourced).
# Uses -WorklogSectionFile (temp file) to avoid multiline arg quoting issues.
# ─────────────────────────────────────────────────────────────────────────────
if ($WorklogSectionFile) {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = "Stop"

    if ($BhGate -eq "off") { exit 0 }

    if (-not $BhWorkRoot) {
        $BhWorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    } else {
        $BhWorkRoot = (Resolve-Path -LiteralPath $BhWorkRoot).Path
    }

    $utf8 = New-Object System.Text.UTF8Encoding $false
    if (-not (Test-Path -LiteralPath $WorklogSectionFile)) {
        Write-Host "bughunt-oracle: section file not found: $WorklogSectionFile" -ForegroundColor DarkGray
        exit 0
    }
    $sectionText = [System.IO.File]::ReadAllText($WorklogSectionFile, $utf8)

    $failures = Invoke-BughuntOracle `
        -WorklogSection $sectionText `
        -WorkRoot $BhWorkRoot `
        -Gate $BhGate `
        -StagedFiles $BhStagedFiles

    exit ([int]($failures -gt 0))
}
