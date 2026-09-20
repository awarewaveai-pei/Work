#requires -Version 5.1
<#
.SYNOPSIS
  Capture a diff snapshot, then write a codex-oracle-compatible review artifact
  from an ALREADY-OBTAINED answer text, bound to that exact snapshot.

.DESCRIPTION
  Companion to `/codex:adversarial-review` (2026-08-30 primary oracle entry point,
  AGENTS.md §跨模型 oracle). That command does not write into
  `agency-os/reports/oracle/`, so the ORACLE gate (verify-closeout-completeness.ps1)
  never sees that a review happened without this script.

  REWRITE 2026-08-30 (critic Critical finding C1, first version): the first version
  of this script computed `files-reviewed`/`deletions-reviewed` from a FRESH
  `git diff` at write-time, entirely disconnected from what was actually reviewed.
  `-Answer "x"` (one character) produced the exact same `path@hash` token the
  ORACLE gate's deletion check expects -- a silent, always-true rubber stamp,
  exactly the "消音偵測器" failure mode AGENTS.md's §補丁判準 calls the worst
  possible outcome. The invariant this rewrite enforces: every claim in the
  artifact about what was reviewed must trace back to a diff snapshot CAPTURED
  BEFORE the review call, never one recomputed after receiving the answer.

  Two modes, always used in sequence:
    1. `-Mode capture`  -- snapshot the current diff + filtered untracked files to
       a file, BEFORE calling /codex:adversarial-review. Real exit codes: 2 if
       there is nothing to review or git fails (ported from codex-oracle.ps1's
       own guards, not reinvented).
    2. `-Mode review`   -- after the review answer is in hand, write the artifact.
       `files-reviewed`/`deletions-reviewed` are parsed FROM the file `-Mode
       capture` wrote (`-ReviewedDiff`), never from a fresh git query. If
       `-ReviewedDiff` is omitted, both fields are unconditionally weak
       ("(NOT CAPTURED)" / "(none)") rather than silently recomputed -- an
       artifact with no real binding must look weak, not look identical to one
       with a real binding.

.PARAMETER Mode
  capture | review | inspect.

.PARAMETER Out
  capture mode: path to write the diff snapshot to.

.PARAMETER ReviewedDiff
  review mode: path to the file `-Mode capture` wrote. Required to get real
  files-reviewed/deletions-reviewed values.

.PARAMETER Answer / AnswerFile
  review|inspect mode: the review/inspect answer text.

.PARAMETER Context / DiffRef / Path
  Same meaning as codex-oracle.ps1's equivalents.

.EXAMPLE
  .\scripts\write-oracle-artifact.ps1 -Mode capture -Out $env:TEMP\rd.diff
  # ... run /codex:adversarial-review, get $answer ...
  .\scripts\write-oracle-artifact.ps1 -Mode review -ReviewedDiff $env:TEMP\rd.diff -Context "..." -AnswerFile $env:TEMP\answer.json
#>
[CmdletBinding()]
param(
    [ValidateSet('capture', 'review', 'inspect')]
    [string]$Mode = 'review',

    [string]$Out = '',
    [string]$ReviewedDiff = '',

    [string]$Answer = '',
    [string]$AnswerFile = '',

    [string]$Context = '',
    [string]$DiffRef = '',
    [string[]]$Path = @(),

    [string]$RepoRoot = '',

    # Which model produced -Answer. The oracle must be the model that did NOT
    # write the change: codex reviews Claude's work, claude reviews Codex's.
    [ValidateSet('codex', 'claude')]
    [string]$Reviewer = 'codex'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$encHelpers = Join-Path $PSScriptRoot '_console-encoding-helpers.ps1'
if (Get-Command Invoke-WithUtf8Console -ErrorAction SilentlyContinue) {
    # already loaded by a parent scope
} elseif (Test-Path -LiteralPath $encHelpers) {
    . $encHelpers
} else {
    [Console]::Error.WriteLine("write-oracle-artifact: missing dependency _console-encoding-helpers.ps1 next to this script -- refusing to run without UTF-8-safe git output capture (CP950 mangling risk).")
    exit 2
}

function Fail {
    # M4 fix: Write-Error under $ErrorActionPreference='Stop' throws a
    # script-terminating error, so the `exit N` on the same line never runs --
    # every prior error path in this script's first version actually exited 0.
    # This bypasses PowerShell's error stream entirely so the exit code is real.
    param([string]$Message, [int]$Code = 2)
    [Console]::Error.WriteLine("write-oracle-artifact: $Message")
    exit $Code
}

function Invoke-Git {
    param([string[]]$GitArgs, [string]$Root)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out  = Invoke-WithUtf8Console { & git -c core.quotepath=false -C $Root @GitArgs 2>&1 }
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
        return @{ Text = (@($out) -join "`n"); Exit = $code }
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Resolve-RepoRoot {
    param([string]$Given)
    if ($Given -and (Test-Path -LiteralPath $Given)) { return (Resolve-Path -LiteralPath $Given).Path }
    $r = Invoke-Git -GitArgs @('rev-parse', '--show-toplevel') -Root (Get-Location).Path
    if ($r.Exit -eq 0 -and $r.Text.Trim()) { return ($r.Text.Trim() -replace '/', '\') }
    if ($PSScriptRoot) { return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path }
    return (Get-Location).Path
}

$root = Resolve-RepoRoot -Given $RepoRoot
$rr = Invoke-Git -GitArgs @('rev-parse', '--is-inside-work-tree') -Root $root
if ($rr.Exit -ne 0) { Fail "not a git repository: $root (git rev-parse failed: $($rr.Text.Trim()))" }

# =============================================================================
# MODE: capture -- snapshot diff + filtered untracked files BEFORE the review
# call. Ported guards from codex-oracle.ps1 (exit-code checks, empty-diff
# abort, untracked-file filter list, auto-commit warning) -- these are the
# guards the first version of this script skipped (critic M1/M2).
# =============================================================================
if ($Mode -eq 'capture') {
    if (-not $Out) { Fail "-Mode capture requires -Out <path>" }

    if ($DiffRef) {
        if ($DiffRef -match '\.\.') { $diffArgs = @('diff', $DiffRef) }
        else                        { $diffArgs = @('show', '--format=', '--patch', $DiffRef) }
    } else {
        $diffArgs = @('diff')
    }
    $excludeArtifacts = ':(exclude)agency-os/reports/oracle'
    if ($Path.Count -gt 0) { $diffArgs += @('--') + $Path + @($excludeArtifacts) }
    else                   { $diffArgs += @('--', '.', $excludeArtifacts) }

    $r = Invoke-Git -GitArgs $diffArgs -Root $root
    if ($r.Exit -ne 0) { Fail "git $($diffArgs -join ' ') failed (exit=$($r.Exit)): $($r.Text.Trim())" }
    $diffText = $r.Text

    if (-not $DiffRef) {
        $stagedArgs = @('diff', '--cached')
        if ($Path.Count -gt 0) { $stagedArgs += @('--') + $Path + @($excludeArtifacts) }
        else                   { $stagedArgs += @('--', '.', $excludeArtifacts) }
        $rs = Invoke-Git -GitArgs $stagedArgs -Root $root
        if ($rs.Exit -ne 0) { Fail "git diff --cached failed (exit=$($rs.Exit)): $($rs.Text.Trim())" }
        $diffText = ($rs.Text + "`n" + $diffText).Trim()
    }

    $inlined = @()
    $skipped = @()
    if (-not $DiffRef) {
        $reviewableExt = @('.ps1', '.psm1', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sh',
                           '.py', '.sql', '.json', '.yml', '.yaml', '.toml', '.md', '.php', '.css', '.html')
        $secretish     = '(^|[\\/._-])(env|secret|secrets|credential|credentials|token|tokens|password|passwd|vault|id_rsa|id_ed25519)([\\/._-]|$)|\.(pem|key|pfx|p12|crt|keystore)$'
        $selfArtifacts = '^agency-os/reports/oracle/'

        $ru        = Invoke-Git -GitArgs @('ls-files', '--others', '--exclude-standard') -Root $root
        $untracked = @($ru.Text -split "`n" | ForEach-Object { "$_".Trim() } | Where-Object { $_ -and $_ -notmatch $selfArtifacts })
        if ($Path.Count -gt 0) {
            # @() wrapping required -- Set-StrictMode suppresses the synthetic
            # .Count on a non-array Where-Object result (0 or exactly 1 match),
            # the exact bug class fixed in codex-oracle.ps1 by commit eb0530ea1.
            $untracked = @($untracked | Where-Object {
                $f = $_
                @($Path | Where-Object { $f -like (($_ -replace '\\', '/').TrimEnd('/') + '*') }).Count -gt 0
            })
        }

        foreach ($u in $untracked) {
            $full = Join-Path $root ($u -replace '/', '\')
            if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }
            if ($u -match $secretish) { $skipped += "$u (name suggests a secret)"; continue }
            if ($reviewableExt -notcontains ([IO.Path]::GetExtension($u).ToLower())) {
                $skipped += "$u (not a reviewable source type)"; continue
            }
            if ((Get-Item -LiteralPath $full).Length -gt 512KB) {
                $skipped += "$u (larger than 512KB)"; continue
            }
            $body = Get-Content -LiteralPath $full -Raw -Encoding UTF8
            $diffText += "`n`n--- NEW UNTRACKED FILE: $u ---`n" + $body
            $inlined  += $u
        }
        if ($inlined.Count -gt 0) {
            Write-Host ("write-oracle-artifact: inlining {0} untracked file(s): {1}" -f $inlined.Count, ($inlined -join ', ')) -ForegroundColor DarkGray
        }
        if ($skipped.Count -gt 0) {
            Write-Host ("write-oracle-artifact: NOT captured ({0}): {1}" -f $skipped.Count, ($skipped -join '; ')) -ForegroundColor DarkYellow
        }
    }

    $looksLikeAutoCommitted = $false
    if (-not $DiffRef) {
        $rLog = Invoke-Git -GitArgs @('log', '-3', '--format=%H %s') -Root $root
        $looksLikeAutoCommitted = ($rLog.Exit -eq 0 -and ($rLog.Text -match '(?m)^\S+ \[claude\] '))
    }

    if (-not $diffText.Trim()) {
        if ($looksLikeAutoCommitted) {
            Fail "Nothing to review -- AND recent commit(s) at HEAD are automated ([claude] checkpoint / AO-CLOSE sync), so this is likely because the work already landed there. Re-run with -DiffRef <commit before the checkpoints>."
        } else {
            Fail "Nothing to review: no diff for the given ref/paths."
        }
    }
    if ($looksLikeAutoCommitted) {
        Write-Host "write-oracle-artifact: WARNING -- recent commit(s) at HEAD look like session auto-checkpoints. This snapshot may not include everything you expect." -ForegroundColor DarkYellow
    }

    Set-Content -LiteralPath $Out -Value $diffText -Encoding UTF8
    Write-Host ("write-oracle-artifact: captured -> {0} ({1} bytes)" -f $Out, (Get-Item -LiteralPath $Out).Length) -ForegroundColor DarkGray
    exit 0
}

# ---- shared answer-loading for review|inspect -------------------------------
if ($AnswerFile) {
    if (-not (Test-Path -LiteralPath $AnswerFile)) { Fail "AnswerFile not found: $AnswerFile" }
    $Answer = Get-Content -LiteralPath $AnswerFile -Raw -Encoding UTF8
}
if (-not $Answer.Trim()) { Fail "No answer text given. Pass -Answer '<text>' or -AnswerFile <path>." }

# =============================================================================
# MODE: review|inspect -- write the artifact. files-reviewed/deletions-reviewed
# are derived ONLY from -ReviewedDiff's captured content (never a fresh git
# query at this point) -- that is the fix for critic finding C1.
# =============================================================================
$reviewedPathsList = $null
$deletedPathsList  = $null
$bindingNote       = 'NOT CAPTURED -- no -ReviewedDiff given, this artifact does not prove any specific file was reviewed'

if ($Mode -eq 'review') {
    if ($ReviewedDiff) {
        if (-not (Test-Path -LiteralPath $ReviewedDiff)) { Fail "ReviewedDiff file not found: $ReviewedDiff" }
        $diffText = Get-Content -LiteralPath $ReviewedDiff -Raw -Encoding UTF8

        $reviewedPaths = New-Object System.Collections.Generic.List[string]
        $deletedPaths  = New-Object System.Collections.Generic.List[string]
        foreach ($block in [regex]::Split($diffText, '(?m)(?=^diff --git )')) {
            $dm = [regex]::Match($block, '(?m)^diff --git a/.+? b/(.+?)\s*$')
            if (-not $dm.Success) { continue }
            $p = $dm.Groups[1].Value
            $reviewedPaths.Add($p)
            if ($block -match '(?m)^deleted file mode') {
                $ixm = [regex]::Match($block, '(?m)^index ([0-9a-f]+)\.\.')
                if ($ixm.Success) { $deletedPaths.Add(('{0}@{1}' -f $p, $ixm.Groups[1].Value)) }
                else { $deletedPaths.Add($p) }
            }
        }
        foreach ($nm in [regex]::Matches($diffText, '(?m)^--- NEW UNTRACKED FILE: (.+?) ---$')) {
            $reviewedPaths.Add($nm.Groups[1].Value)
        }
        $reviewedPathsList = (@($reviewedPaths) | Select-Object -Unique) -join ', '
        $deletedPathsList  = (@($deletedPaths) | Select-Object -Unique) -join ', '
        $bindingNote       = "bound to captured snapshot: $ReviewedDiff"
    } else {
        # Critic fix #2 for C1: no fresh git recomputation, ever. An artifact
        # with no real binding must look weak, not identical to a bound one.
        $reviewedPathsList = '(NOT CAPTURED -- see -Mode capture)'
        $deletedPathsList  = '(none)'
    }
}


# The oracle must be the model that did NOT write the change (AGENTS.md section 4).
# The ORACLE gate only checks that SOME artifact exists today, so the refusal has
# to happen where every artifact is produced: here.
. (Join-Path $PSScriptRoot '_agent-host.ps1')
if ($Mode -eq 'review') {
    $agentHost = Get-AgentHost
    if ($agentHost -eq $Reviewer) {
        Fail "Refusing to write a $Reviewer-reviewed artifact from inside a $agentHost session: that is the same model reviewing its own change. Run the other model's oracle (/codex-review or /claude-review)."
    }
}

# ---- findings count: JSON-first, then two known text-render fallbacks, never
# guess -----------------------------------------------------------------------
# Critic M3: a bare regex count of the substring `"severity":` returns 0 for
# codex-oracle.ps1's own `FINDING N:` text format (real findings, wrong count)
# and 1 for a JSON schema echoed in prose with no real findings (wrong count
# the other way). Try structured parsing first; only fall back to known
# text-render shapes; print a placeholder rather than a wrong number if none
# match.
#
# Third shape added 2026-08-30 after a REAL end-to-end run against
# /codex:adversarial-review: its --wait foreground output is neither raw JSON
# nor codex-oracle.ps1's `FINDING N:` format -- it is a rendered markdown
# report with a `Findings:` section and `- [severity] ...` bullets per finding
# (verified from a live run, not assumed from reading codex-companion.mjs's
# source -- the source suggested raw JSON via `outputSchema`, but the actual
# printed output is rendered markdown, confirming the two can differ).
$findingsCountStr = '<unknown>'
try {
    $parsed = $Answer | ConvertFrom-Json -ErrorAction Stop
    if ($parsed.PSObject.Properties.Name -contains 'findings') {
        $findingsCountStr = [string](@($parsed.findings)).Count
    }
} catch {
    $textMatches = [regex]::Matches($Answer, '(?m)^\s*FINDING\s+\d+')
    $bulletMatches = [regex]::Matches($Answer, '(?mi)^-\s*\[(?:critical|high|medium|low)\]\s')
    if ($textMatches.Count -gt 0 -or $Answer -match '(?m)^\s*(NO FINDINGS|TOTAL:\s*0\b)') {
        $findingsCountStr = [string]$textMatches.Count
    } elseif ($bulletMatches.Count -gt 0 -or $Answer -match '(?im)^verdict:\s*approve\b') {
        $findingsCountStr = [string]$bulletMatches.Count
    }
}

$oracleDir = Join-Path $root 'agency-os\reports\oracle'
if (-not (Test-Path -LiteralPath $oracleDir)) { New-Item -ItemType Directory -Path $oracleDir -Force | Out-Null }

$stamp        = [guid]::NewGuid().ToString('N').Substring(0, 8)
$artifactKind = if ($Mode -eq 'review' -and ($DiffRef -or $Path.Count -gt 0)) { 'partialreview' } else { $Mode }
$artifact     = Join-Path $oracleDir (('{0}-{1}-{2}.md' -f (Get-Date -Format 'yyyy-MM-dd'), $artifactKind, $stamp))

$reviewerSource = if ($Reviewer -eq 'claude') { '`claude -p` via scripts/claude-oracle.ps1 (/claude-review)' } else { '`/codex:adversarial-review` (via write-oracle-artifact.ps1, not codex-oracle.ps1)' }
$meta = @(
    ('# {0}-oracle {1} -- {2}' -f $Reviewer, $Mode, (Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')),
    '',
    ('- mode: `{0}`' -f $Mode),
    ('- reviewer: `{0}`' -f $Reviewer),
    ('- source: {0}' -f $reviewerSource),
    ('- binding: {0}' -f $bindingNote),
    ('- scope: {0}' -f $(if ($Path.Count -gt 0) { '-Path ' + ($Path -join ', ') + '  <-- PARTIAL: does not satisfy the ORACLE gate' } else { 'whole repo' })),
    ('- target: `{0}`' -f $(if ($DiffRef) { $DiffRef } else { 'working tree (staged + unstaged + untracked)' })),
    ('- context: {0}' -f $(if ($Context) { $Context } else { '(none given)' })),
    ('- files-reviewed: {0}' -f $(if ($reviewedPathsList) { $reviewedPathsList } else { '(n/a for this mode)' })),
    ('- deletions-reviewed: {0}' -f $(if ($deletedPathsList) { $deletedPathsList } else { '(none)' })),
    ('- findings-count: {0}' -f $findingsCountStr),
    '',
    ('> {0} output, NOT verified truth. R0 requires the' -f $(if ($Reviewer -eq 'claude') { 'Claude' } else { 'Codex' })),
    '> caller to confirm every `file:line` before acting on it. Archived so that SKIPPING',
    '> the oracle is visible -- not so that its findings are trusted.',
    '',
    '---',
    '',
    $Answer
)
Set-Content -LiteralPath $artifact -Value ($meta -join [Environment]::NewLine) -Encoding UTF8
Write-Host ("write-oracle-artifact: artifact -> {0}" -f $artifact) -ForegroundColor DarkGray

if ($Mode -eq 'review') {
    Write-Host ""
    Write-Host "Verify each finding yourself, then record in WORKLOG [verification]:" -ForegroundColor DarkGray
    Write-Host ("- REVIEW_DONE: critic=Deep | verdict=<pass/warn/fail> | findings={0}" -f $findingsCountStr) -ForegroundColor DarkGray
    Write-Host ("  - external oracle = {0}, artifact recorded via write-oracle-artifact.ps1" -f $reviewerSource) -ForegroundColor DarkGray
    if ($findingsCountStr -eq '<unknown>') {
        Write-Host "  - WARNING: could not determine findings count from answer shape -- fill in manually after reading the artifact, do not guess 0." -ForegroundColor Yellow
    }
    if (-not $ReviewedDiff) {
        Write-Host "  - WARNING: no -ReviewedDiff given -- this artifact does NOT prove which files were reviewed. Re-run with -Mode capture first for anything commit-worthy." -ForegroundColor Yellow
    }
}
