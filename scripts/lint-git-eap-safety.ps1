<#
.SYNOPSIS
  Regression gate for the PS5.1 native-command-stderr footgun (the recurring AO-RESUME
  crash class). Flags `& <cmd> ... 2>&1` and bare `*>&1` capture sites that run under
  $ErrorActionPreference='Stop' WITHOUT an enclosing EAP='Continue' guard.

.DESCRIPTION
  Root cause it guards (2026-06-05, and 4 prior point-fixes): under EAP=Stop, PowerShell 5.1
  raises a terminating NativeCommandError when a native command writes ANY stderr through a
  merged stream (2>&1 / *>&1) — including git's normal "From <url>" — BEFORE $LASTEXITCODE is
  checked. The canonical safe forms are:
    1. route through scripts/lib/git-safe-ops.ps1 (Invoke-SafeGitFetch/Push/Capture), or
    2. wrap inline:  $s=$ErrorActionPreference; $ErrorActionPreference='Continue'; try{ & cmd 2>&1 } finally{ $ErrorActionPreference=$s }

  This linter is the mechanical guarantee that head #6 cannot silently grow back. It is wired
  into verify-build-gates.ps1 (runs at AO-CLOSE) so every session boundary checks it.

  A site is SAFE when ANY of:
    - the line calls Invoke-SafeGit* (routed through the lib SSOT)
    - within the preceding window there is an EAP='Continue' that is still in effect
      (no restore `= $var` and no `= 'Stop'` between it and the risky line)
    - the enclosing file never sets EAP='Stop' (PS default EAP=Continue → no throw)

.PARAMETER WorkRoot
  Monorepo root (default = parent of this script).

.PARAMETER Paths
  Optional explicit file list. Default: all *.ps1 under scripts/ and mcp/ (recursive).

.PARAMETER Window
  How many preceding lines to scan for an in-effect EAP=Continue guard. Default 30.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\lint-git-eap-safety.ps1
#>
param(
    [string]$WorkRoot = "",
    [string[]]$Paths = @(),
    [int]$Window = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
}

# ── Resolve target files ────────────────────────────────────────────────────
if ($Paths -and $Paths.Count -gt 0) {
    $targets = @($Paths | ForEach-Object { (Resolve-Path -LiteralPath $_).Path })
} else {
    $roots = @(
        (Join-Path $WorkRoot 'scripts'),
        (Join-Path $WorkRoot 'mcp')
    ) | Where-Object { Test-Path -LiteralPath $_ }
    $targets = @(
        $roots | ForEach-Object {
            Get-ChildItem -LiteralPath $_ -Recurse -File -Filter '*.ps1' -ErrorAction SilentlyContinue
        } | Select-Object -ExpandProperty FullName
    )
}

# ── Patterns ────────────────────────────────────────────────────────────────
# Scope: GIT capture sites only — `& git ...2>&1` / `& git -C <root> ...2>&1`. This is the
# proven-dangerous, AO-RESUME-critical class (the broader native-command class — ssh/docker/
# node/powershell with the same footgun — is tracked separately as a follow-up audit; many of
# those are already try/catch-handled or routed via Invoke-WithUtf8Console).
# `2>$null` discards stderr (no merge → no throw) → intentionally NOT matched.
$reGitStderr   = '(?:&\s+)?\bgit\b[^|]*\s2>&1'
$reEapContinue = '\$ErrorActionPreference\s*=\s*["'']?Continue'
$reEapStop     = '\$ErrorActionPreference\s*=\s*["'']?Stop'
$reEapRestore  = '\$ErrorActionPreference\s*=\s*\$'   # restore to a saved variable
$thisFile      = $MyInvocation.MyCommand.Path

$violations = New-Object System.Collections.Generic.List[object]
$siteCount  = 0

foreach ($file in $targets) {
    if ($thisFile -and ($file -eq $thisFile)) { continue }   # never lint the linter (it documents the pattern)
    # Force-array: a 1-line file returns a [string] from Get-Content; under Set-StrictMode
    # `$lines.Count` would then throw (and false-block the gate). @() guarantees an array.
    $lines = @(Get-Content -LiteralPath $file -Encoding UTF8)
    if ($lines.Count -eq 0) { continue }
    $fileSetsStop = [bool]($lines | Where-Object { $_ -match $reEapStop })

    $inBlockComment = $false
    $inHereString   = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = [string]$lines[$i]
        $trim = $line.TrimStart()
        # Track <# ... #> block comments (skip their content).
        if ($inBlockComment) { if ($line -match '#>') { $inBlockComment = $false }; continue }
        if ($trim -match '^<#') { if ($line -notmatch '#>') { $inBlockComment = $true }; continue }
        # Track here-strings (@" ... "@ / @' ... '@) and skip their content. Needed once the
        # detector stopped requiring the `&` call operator: scripts that ship a REMOTE bash
        # script as a here-string (e.g. lobster-trigger-deploy.ps1:71 `$deployBash = @"`)
        # contain lines like `git -C /root/Work pull ... 2>&1 | tail -5` that are bash, never
        # executed by PowerShell, and therefore cannot raise NativeCommandError. Flagging them
        # would be a false positive — and a detector that cries wolf gets ignored.
        if ($inHereString) { if ($trim -match '^[''"]@') { $inHereString = $false }; continue }
        if ($line -match '@[''"]\s*$') { $inHereString = $true; continue }
        if ($trim.StartsWith('#')) { continue }                       # line comment
        if ($line -notmatch $reGitStderr) { continue }
        # Skip ONLY a whole-line assignment whose RHS is a string constant (regex/doc lines
        # like  $re = '...2>&1...'). Anchored to start-of-line so a REAL capture such as
        # `$h = & git log --format="%H" 2>&1` (RHS begins with `&`, not a quote) is NOT skipped
        # — the broad `=\s*['"]` form silently false-passed those (critic 2026-06-05).
        if ($trim -match '^\$\w+\s*=\s*[''"]') { continue }
        $siteCount++

        # Safe form 1: routed through the lib SSOT.
        if ($line -match 'Invoke-SafeGit') { continue }
        # Safe form 3: file never sets EAP=Stop → default EAP=Continue → native stderr cannot throw.
        if (-not $fileSetsStop) { continue }

        # Safe form 2a: an EAP='Continue' still in effect (scan back; stop at a restore or =Stop,
        # which would mean an earlier Continue is no longer active).
        $guarded = $false
        $lo = [Math]::Max(0, $i - $Window)
        for ($j = $i - 1; $j -ge $lo; $j--) {
            $pl = [string]$lines[$j]
            if ($pl -match $reEapContinue) { $guarded = $true; break }
            if ($pl -match $reEapRestore -or $pl -match $reEapStop) { break }
        }
        if ($guarded) { continue }

        # NOTE: a bare enclosing try/catch is intentionally NOT credited as safe. It catches the
        # NativeCommandError but converts the crash into silent wrong-behavior (the git exit-code
        # check / output parse is skipped and control jumps to catch). The only accepted forms are
        # lib routing (Invoke-SafeGit*) or an in-effect EAP='Continue' guard.

        $violations.Add([pscustomobject]@{
            File = $file.Substring($WorkRoot.Length).TrimStart('\')
            Line = $i + 1
            Text = $line.Trim()
        }) | Out-Null
    }
}

# ── Report ──────────────────────────────────────────────────────────────────
Write-Host "== lint-git-eap-safety ==" -ForegroundColor Cyan
Write-Host ("  files scanned : {0}" -f $targets.Count)
Write-Host ("  capture sites : {0}" -f $siteCount)
Write-Host ("  violations    : {0}" -f $violations.Count) -ForegroundColor $(if ($violations.Count -gt 0) { 'Red' } else { 'Green' })

if ($violations.Count -gt 0) {
    Write-Host ""
    Write-Host "Unguarded native-stderr capture under EAP=Stop (PS5.1 NativeCommandError risk):" -ForegroundColor Red
    foreach ($v in $violations) {
        Write-Host ("  {0}:{1}" -f $v.File, $v.Line) -ForegroundColor Yellow
        Write-Host ("      {0}" -f $v.Text) -ForegroundColor DarkYellow
    }
    Write-Host ""
    Write-Host "Fix: route through scripts/lib/git-safe-ops.ps1 (Invoke-SafeGitFetch/Push/Capture)," -ForegroundColor Cyan
    Write-Host "     or wrap with scoped \$ErrorActionPreference='Continue' + try/finally restore." -ForegroundColor Cyan
    exit 1
}

Write-Host "  OK: every native-stderr capture is lib-routed or EAP-guarded." -ForegroundColor Green
exit 0
