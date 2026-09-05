<#
.SYNOPSIS
  Audit the monorepo for two deterministic (zero-LLM-judgment) repo-hygiene
  bug classes: case-insensitive path collisions and oversized source files.

.DESCRIPTION
  Origin: 2026-09-05, discovered by hand while closing out
  agency-os/TASKS.md:822 -- `Projects/internal/hci30` (git index, lowercase)
  vs `Projects/internal/HCI30/` (disk, uppercase) had drifted apart under
  Windows' case-insensitive filesystem while git's case-sensitive index only
  ever saw one of them. That class is 100% mechanical to detect and has
  essentially zero legitimate case: two DISTINCT tracked paths (or a tracked
  file colliding with a tracked directory ancestor) whose lowercased form
  collides will silently become ONE file/directory the moment anyone clones
  on a case-insensitive filesystem (Windows, default macOS) after being fine
  on a case-sensitive one (Linux CI, most servers).

  Two independent classes, each independently gate-able (mirrors the
  audit-cp950-traps.ps1 multi-class -Only-switch shape):

    1. case-collision (HARD gate, wired into system-health-check.ps1 check
       7d): every tracked path is expanded into ALL of its directory-prefix
       levels PLUS the full path itself (`a/b/c.md` -> `a`, `a/b`, `a/b/c.md`)
       and grouped by lowercased form across the WHOLE repo. A group holding
       more than one DISTINCT original casing is a finding -- this catches
       both a same-depth file/file collision (`Foo.md` vs `foo.md`) and a
       cross-depth collision (a file `docs/README.md` vs a directory
       `docs/readme.md/` that holds other tracked files), which is the shape
       of the actual origin incident (the collision was between a directory
       and its sibling-case counterpart, not between two same-name leaf
       files -- see critic review 2026-09-05 finding M1 below).

    2. oversized-file (informational / Tier 3 backlog signal, NOT a hard
       gate): a tracked source-code file exceeding -MaxLines or -MaxBytes.
       Deliberately excludes docs/data/report extensions (.md/.json/.jsonl/
       .csv/.txt/.log) -- this repo's WORKLOG.md and TASKS.md are supposed to
       be long-lived append logs, not a code-smell. Legitimate hits ARE
       expected (a big generated config, a wide test fixture) so this class
       is never a hard gate; it is a backlog signal for the monthly
       schedule-driven audit tier (BUG_HUNT_PROTOCOL.md Tier 3), not
       something that blocks anyone.

  Explicitly OUT OF SCOPE for this tool (considered and declined, not an
  oversight): general "duplicate code block" / "naming drift" detection.
  Both need judgment calls (a repeated 12-line block might be a copy-paste
  bug or might be intentional boilerplate; "naming drift" beyond exact case
  collision is inherently fuzzy) that a deterministic AST/hash scan cannot
  make reliably without either an AST-aware, token-normalized comparison
  (a materially bigger build than this tool) or a high false-positive rate.
  BUG_HUNT_PROTOCOL.md Step 7 warns explicitly: a >10% FP-rate tool gets
  dismissed every run and dies by month 2-3 ("protocol becomes theater").
  This repo's existing critic subagent + /code-review + /simplify already
  cover that judgment-requiring ground. Re-litigate only if a real duplicate
  -code incident happens (Tier 1) or critic repeatedly flags the same
  duplicate 3+ times (Tier 2) -- see BUG_HUNT_PROTOCOL.md backlog.

  Reports findings. Does NOT auto-fix (operator/Claude decides per finding).

  CRITIC REVIEW HISTORY (2026-09-05, before this class was allowed to become
  a hard gate -- see AUDIT_REGISTRY.md "Repo-hygiene audit" section for the
  full report): first draft had 3 CRITICAL + 4 MAJOR findings, ALL fixed in
  this version before deployment:
    C1 (git ls-files output mojibake'd under a CP950/Big5 console, producing
        ghost collisions between two legitimately different CJK filenames)
        -> fixed by routing every git capture through Invoke-SafeGitCapture
        (scripts/lib/git-safe-ops.ps1), which wraps Invoke-WithUtf8Console.
    C2 (an unmerged/mid-merge index lists the same path 2-3x, one per
        conflict stage, miscounted as a self-collision)
        -> fixed by detecting an in-progress merge/rebase/cherry-pick/
        unmerged state up front and exiting 2 ("cannot determine") instead
        of silently producing a false exit-1 drift.
    C3 (git failure was swallowed by a decorative try/catch around a native
        command, so a broken git returned $null, both loops no-opped, and
        the tool reported "clean" having checked nothing)
        -> fixed by checking Invoke-SafeGitCapture's .ExitCode explicitly
        and treating a 0-file result as an error, not a clean repo.
    M1 (only same-depth full-path collisions were detected, missing the
        actual origin incident's shape: a file colliding with a DIFFERENT
        depth's directory ancestor)
        -> fixed by the prefix-expansion design described above.
    M2 (repo-root resolution depended on the caller's CWD, not the script's
        own location -- the exact bug audit-cp950-traps.ps1 already fixed
        under its own M2, 2026-08-29)
        -> fixed by mirroring that tool's Resolve-RepoRoot (git -C
        $PSScriptRoot, with a Split-Path fallback).
    M3 (Write-Error under $ErrorActionPreference='Stop' is a terminating
        error, so `exit 2` after it never ran -- real exit code was
        indistinguishable from exit 1 "drift")
        -> fixed by using [Console]::Error.WriteLine + exit instead of
        Write-Error for every early-exit path.
    M4 (docs declared the system-health-check.ps1 hard gate before it was
        actually wired) -> the wiring landed in the same commit as this
        fixed script; no longer a dangling claim.

  Exits:
    0  clean — no drift in the requested class(es)
    1  drift — >=1 finding in a requested class
    2  error — invalid args, git unavailable/failed, unmerged index state
       when case-collision was requested, or an unreadable file

.PARAMETER Json
  Output machine-readable JSON instead of a human Markdown report.

.PARAMETER Quiet
  Suppress the "clean" summary line when there is no drift; only print
  findings (or nothing, on a clean run).

.PARAMETER CaseCollisionOnly
  Gate mode. Report ONLY the case-collision class. This is the class wired
  into a hard AO-CLOSE gate (see system-health-check.ps1 check 7d).

.PARAMETER OversizedOnly
  Gate mode. Report ONLY the oversized-file class. Mutually exclusive with
  -CaseCollisionOnly.

.PARAMETER MaxLines
  Line-count threshold for the oversized-file class. Default 1000.

.PARAMETER MaxBytes
  Byte-size threshold for the oversized-file class. Default 100000 (100KB).
  A file trips the class if it exceeds EITHER threshold.

.PARAMETER TargetFile
  Single-file mode for the oversized-file class only (useful right after an
  Edit/Write touched one file). Ignored for case-collision, which is
  inherently whole-repo (a single file cannot collide with itself). Named
  -TargetFile rather than -File to avoid ambiguity with PowerShell's own
  `-File <script>` launch switch (critic review 2026-09-05, s2).

.PARAMETER WorkRoot
  Explicit repo root, overriding the default CWD-independent resolution
  (git -C $PSScriptRoot). Same pattern as scripts/commit-checkpoint.ps1 and
  scripts/validate-memory-index.ps1 -- lets system-health-check.ps1 pass
  $monoRoot explicitly, and lets a test fixture point this tool at a
  throwaway repo instead of always auditing the repo this script lives in.

.EXAMPLE
  powershell -File scripts/audit-repo-hygiene.ps1
  # scan defaults, human report, both classes

  powershell -File scripts/audit-repo-hygiene.ps1 -CaseCollisionOnly -Quiet
  # AO-CLOSE hard gate: ONLY case-collision class

  powershell -File scripts/audit-repo-hygiene.ps1 -OversizedOnly -Json
  # machine-readable oversized-file backlog signal

.NOTES
  Slash:     /audit-repo-hygiene (calls this tool with sensible defaults)
  Registry:  agency-os/docs/operations/AUDIT_REGISTRY.md
  TOOL_TRIGGER_MAP.md — case-collision is a hard AO-CLOSE gate; oversized
             -file is informational only.
#>

param(
    [switch]$Json,
    [switch]$Quiet,
    [switch]$CaseCollisionOnly,
    [switch]$OversizedOnly,
    [int]$MaxLines = 1000,
    [int]$MaxBytes = 100000,
    [string]$TargetFile = "",
    [string]$WorkRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-ToolError {
    # Deliberately NOT Write-Error: under $ErrorActionPreference='Stop' (set above),
    # Write-Error is a terminating error, so any `exit <n>` written after it never
    # runs -- the process's real exit code becomes whatever PowerShell defaults to
    # on an uncaught terminating error, indistinguishable from "drift found" to a
    # caller checking `-ne 0`. Critic review 2026-09-05 finding M3.
    param([string]$Message)
    [Console]::Error.WriteLine("audit-repo-hygiene: $Message")
}

if ($CaseCollisionOnly -and $OversizedOnly) {
    Write-ToolError "-CaseCollisionOnly and -OversizedOnly are mutually exclusive (each means 'report ONLY this one class')."
    exit 2
}

# Dot-source the repo's canonical safe-git-capture lib: it wraps every git call in
# Invoke-WithUtf8Console (fixes CP950/Big5 console mojibake on non-ASCII tracked
# paths -- critic review 2026-09-05 finding C1, reproduced end-to-end against real
# CJK filenames) and returns an explicit .ExitCode instead of relying on a bare
# try/catch around a native command, which does NOT catch a non-zero exit (finding
# C3). Reuse, don't reinvent: this is the same helper ao-close.ps1 and
# ao-resume.ps1 already depend on for every other git capture in this repo.
. (Join-Path $PSScriptRoot 'lib\git-safe-ops.ps1')

function Resolve-RepoRoot {
    <#
      CWD-independent by construction: `git -C $PSScriptRoot` anchors to this
      SCRIPT's own location, not wherever the caller's shell happened to be.
      Mirrors audit-cp950-traps.ps1's Resolve-RepoRoot (that tool's own M2 fix,
      2026-08-29) -- critic review 2026-09-05 flagged this script for repeating
      the exact same CWD-dependent bug (finding M2) before this fix.
    #>
    try {
        $cap = Invoke-SafeGitCapture -GitArgs @('-C', $PSScriptRoot, 'rev-parse', '--show-toplevel')
        if ($cap.ExitCode -eq 0 -and $cap.Output.Count -gt 0) {
            return (($cap.Output[0]) -replace '/', '\').TrimEnd('\')
        }
    } catch { }
    if ($PSScriptRoot) { return (Split-Path -Path $PSScriptRoot -Parent) }
    return (Get-Location).Path
}

# -WorkRoot lets a caller (system-health-check.ps1, or a test fixture) name the
# repo explicitly instead of relying on this script's own on-disk location --
# same pattern as scripts/validate-memory-index.ps1 and scripts/commit-checkpoint.ps1
# (critic review 2026-09-05 M2 suggestion).
$repoRoot = if ($WorkRoot) { (Resolve-Path -LiteralPath $WorkRoot).Path } else { Resolve-RepoRoot }
if (-not $repoRoot -or -not (Test-Path -LiteralPath (Join-Path $repoRoot '.git'))) {
    Write-ToolError "could not resolve a git repository root (resolved to '$repoRoot')."
    exit 2
}

# Source-code extensions in scope for the oversized-file class. Deliberately
# excludes docs/data/report extensions (.md/.json/.jsonl/.csv/.txt/.log) --
# see header comment for why those are not a code-smell in this repo.
$sourceExtensions = @('.ps1', '.mjs', '.js', '.jsx', '.ts', '.tsx', '.py', '.sql', '.sh', '.cjs')

# Path fragments excluded from the oversized-file class ONLY: generated/vendor
# /report/archive content that legitimately grows unbounded or is machine
# -written, not hand-authored code a human would need to split up. Deliberately
# NOT applied to case-collision (critic review 2026-09-05 finding m3 corrected a
# stale comment that implied otherwise) -- a hard gate must have no blind spots;
# a case collision inside agency-os/reports/ or node_modules/ still breaks a
# Windows/macOS clone exactly the same as one anywhere else.
$excludeFragments = @(
    '/node_modules/', '/Backups/', '/.next/', '/dist/', '/build/',
    '/agency-os/reports/', '/agency-os/memory/daily/', '/.git/',
    '/vendor/', '/__pycache__/', '/.venv/', '/coverage/', '/out/', '/.turbo/'
)

function Test-ExcludedPath {
    param([string]$RelPath)
    $normalized = "/$($RelPath -replace '\\', '/')"
    foreach ($frag in $excludeFragments) {
        if ($normalized -like "*$frag*") { return $true }
    }
    # Minified bundles are single absurdly-long lines with zero action value if
    # flagged -- they will always trip -MaxBytes and never usefully "split up"
    # (critic review 2026-09-05 s1).
    if ($normalized -match '\.min\.[a-z]+$') { return $true }
    return $false
}

# ---- git ls-files: single source of truth for both classes ----------------
$lsFilesCap = Invoke-SafeGitCapture -GitArgs @('-C', $repoRoot, '-c', 'core.quotepath=false', 'ls-files')
if ($lsFilesCap.ExitCode -ne 0) {
    Write-ToolError "git ls-files failed (exit $($lsFilesCap.ExitCode)) -- cannot audit an unknown tree state."
    exit 2
}
$allTracked = @($lsFilesCap.Output | Where-Object { $_ -and $_.Trim() })
if ($allTracked.Count -eq 0) {
    # A hard gate must fail CLOSED when its own data source looks empty --
    # critic review 2026-09-05 finding C3 (fail-open on git failure produced
    # the exact same symptom: silent "clean" having checked nothing).
    Write-ToolError "git ls-files returned 0 tracked paths -- refusing to report 'clean' on what looks like a broken read, not an empty repo."
    exit 2
}
# Defense in depth against duplicate entries (belt-and-suspenders alongside the
# unmerged-index guard below) -- critic review 2026-09-05 finding C2.
$uniqueTracked = @($allTracked | Select-Object -Unique)
$trackedSet = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($p in $uniqueTracked) { [void]$trackedSet.Add($p) }

$findings = @{
    caseCollision = @()
    oversized     = @()
}

# ---- Class 1: case-collision ------------------------------------------------
if (-not $OversizedOnly) {
    # An unmerged/mid-operation index lists the SAME path multiple times (once
    # per conflict stage: 1=base, 2=ours, 3=theirs), which without this guard
    # gets counted as the path colliding with itself. Detecting and refusing
    # (exit 2 "cannot determine") is more honest than silently producing a
    # false exit-1 drift with an unreadable "X <-> X <-> X" message -- critic
    # review 2026-09-05 finding C2, reproduced end-to-end. Marker list mirrors
    # commit-checkpoint.ps1's identical in-progress-operation check.
    $inProgressMarkers = @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer')
    $inProgress = @($inProgressMarkers | Where-Object {
        $gp = (Invoke-SafeGitCapture -GitArgs @('-C', $repoRoot, 'rev-parse', '--git-path', $_)).Text.Trim()
        $gp -and (Test-Path -LiteralPath $gp)
    })
    $unmergedCap = Invoke-SafeGitCapture -GitArgs @('-C', $repoRoot, 'ls-files', '--unmerged')
    if ($unmergedCap.ExitCode -ne 0) {
        Write-ToolError "git ls-files --unmerged failed (exit $($unmergedCap.ExitCode))."
        exit 2
    }
    $hasUnmerged = (@($unmergedCap.Output | Where-Object { $_ -and $_.Trim() })).Count -gt 0

    if ($inProgress.Count -gt 0 -or $hasUnmerged) {
        Write-ToolError "git index has an unresolved merge/rebase/cherry-pick/revert or unmerged entries -- case-collision cannot be reliably determined until resolved. Resolve the operation first, then re-run."
        exit 2
    }

    # Expand every tracked path into ALL of its directory-prefix levels plus the
    # full path itself, then group by lowercased form ACROSS THE WHOLE REPO.
    # This catches both same-depth collisions (Foo.md vs foo.md) and cross-depth
    # ones (a file docs/README.md vs a directory docs/readme.md/ holding other
    # tracked files) -- the latter is the actual shape of the origin incident
    # this tool was built for, which a same-depth-only comparison misses
    # entirely (critic review 2026-09-05 finding M1, reproduced end-to-end).
    $prefixOwners = @{}
    foreach ($p in $uniqueTracked) {
        $segments = $p -split '/'
        $acc = New-Object System.Collections.Generic.List[string]
        for ($i = 0; $i -lt $segments.Count; $i++) {
            $acc.Add($segments[$i])
            $prefix = [string]::Join('/', $acc)
            $lower = $prefix.ToLowerInvariant()
            if (-not $prefixOwners.ContainsKey($lower)) {
                $prefixOwners[$lower] = New-Object 'System.Collections.Generic.HashSet[string]'
            }
            [void]$prefixOwners[$lower].Add($prefix)
        }
    }
    foreach ($lower in $prefixOwners.Keys) {
        $variants = $prefixOwners[$lower]
        if ($variants.Count -gt 1) {
            $findings.caseCollision += [PSCustomObject]@{
                lowered  = $lower
                variants = @($variants)
            }
        }
    }
}

# ---- Class 2: oversized-file ------------------------------------------------
if (-not $CaseCollisionOnly) {
    $scanList = $uniqueTracked
    if ($TargetFile) {
        $resolved = (Resolve-Path -LiteralPath $TargetFile -ErrorAction SilentlyContinue)
        $relFile = $null
        if ($resolved) {
            $relFile = $resolved.Path -replace [regex]::Escape("$repoRoot\"), '' -replace '\\', '/'
        }
        if (-not $relFile -or -not $trackedSet.Contains($relFile)) {
            # Silently skipping an untracked/out-of-repo target means the caller
            # sees exit 0 "clean" for a file that was never actually checked --
            # critic review 2026-09-05 finding m4.
            Write-ToolError "-TargetFile '$TargetFile' is not a git-tracked path (resolved to '$relFile') -- cannot verify."
            exit 2
        }
        $scanList = @($relFile)
    }
    foreach ($p in $scanList) {
        $ext = [System.IO.Path]::GetExtension($p).ToLowerInvariant()
        if ($sourceExtensions -notcontains $ext) { continue }
        if (Test-ExcludedPath -RelPath $p) { continue }
        $full = Join-Path $repoRoot ($p -replace '/', '\')
        try {
            if (-not (Test-Path -LiteralPath $full)) { continue }
            $fi = Get-Item -LiteralPath $full
            # Stream line-counting instead of loading the whole file as a line
            # array just to measure it (critic review 2026-09-05 s4).
            $reader = [System.IO.StreamReader]::new($full, [System.Text.Encoding]::UTF8, $true)
            $lineCount = 0
            try {
                while ($null -ne $reader.ReadLine()) { $lineCount++ }
            } finally {
                $reader.Dispose()
            }
        } catch {
            # File disappeared between listing and stat (concurrent session,
            # antivirus, git checkout) -- skip rather than crash the whole scan
            # (critic review 2026-09-05 finding m2, TOCTOU).
            continue
        }
        if ($lineCount -gt $MaxLines -or $fi.Length -gt $MaxBytes) {
            $findings.oversized += [PSCustomObject]@{
                path  = $p
                lines = $lineCount
                bytes = $fi.Length
            }
        }
    }
}

$totalFindings = $findings.caseCollision.Count + $findings.oversized.Count

if ($Json) {
    [PSCustomObject]@{
        caseCollision = $findings.caseCollision
        oversized     = $findings.oversized
        clean         = ($totalFindings -eq 0)
    } | ConvertTo-Json -Depth 5
} else {
    if (-not $OversizedOnly -and $findings.caseCollision.Count -gt 0) {
        Write-Host "== case-collision (HARD gate class) ==" -ForegroundColor Red
        foreach ($f in $findings.caseCollision) {
            Write-Host "  COLLISION: $($f.variants -join ' <-> ')" -ForegroundColor Red
        }
    } elseif (-not $OversizedOnly -and -not $Quiet) {
        Write-Host "audit-repo-hygiene: case-collision clean (0 hits across $($uniqueTracked.Count) tracked paths)." -ForegroundColor Green
    }

    if (-not $CaseCollisionOnly -and $findings.oversized.Count -gt 0) {
        Write-Host "== oversized-file (informational, Tier 3 backlog signal) ==" -ForegroundColor Yellow
        foreach ($f in $findings.oversized) {
            Write-Host ("  {0}  ({1} lines, {2} bytes)" -f $f.path, $f.lines, $f.bytes) -ForegroundColor Yellow
        }
    } elseif (-not $CaseCollisionOnly -and -not $Quiet) {
        Write-Host "audit-repo-hygiene: oversized-file clean (0 hits over $MaxLines lines / $MaxBytes bytes)." -ForegroundColor Green
    }
}

if ($totalFindings -gt 0) { exit 1 } else { exit 0 }
