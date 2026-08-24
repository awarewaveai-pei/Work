#requires -Version 5.1
<#
.SYNOPSIS
  Verify that the latest AO-CLOSE archive's 未完成 / 明日優先 bullets are also
  lifted into agency-os/TASKS.md as `- [ ]` lines (or marked archive-only).

.DESCRIPTION
  Phase Z6 (2026-05-28) — addresses the silent-drop class that caused the
  5/28 18:46 AO-CLOSE archive's "SG deploy 落後 3 commits" item to be invisible
  to the next AO-RESUME because it lived only in the archive, never as a
  TASKS.md `- [ ]` line.

  Reads the newest `agency-os/reports/ao-close/YYYY-MM-DD-HHMM.md`, extracts
  bullets under `## 未完成` and `## 明日優先` sections, and for each bullet
  requires an EXPLICIT, MACHINE-VERIFIABLE declaration of where it lives.

  DESIGN INVARIANT (2026-08-24 rewrite):
    A gate that verifies "X is tracked in Y" must compare DECLARED IDENTITY,
    never LEXICAL SIMILARITY. Similarity matching produces both false-pass
    (a token coincidentally appears inside an unrelated task's narrative) and
    false-fail (the same item worded differently in archive vs TASKS).
    The pre-2026-08-24 implementation guessed via bold-token extraction,
    8-12 char sliding windows and 30/20/12/8 char prefixes; on 2026-08-24 it
    reported 4 false failures at once. That guessing engine is DELETED — this
    is the same bug class removed from check-change-impact-matrix-drift.ps1
    the same day ("only trust explicit declarations; if the data is not
    explicit enough, fix the data — do not teach the code to guess").

  RESOLUTION INVARIANT: a declaration must resolve to EXACTLY ONE open task.
    0 matches  -> the item is not on the board (the silent-drop this gate exists for)
    >1 matches -> the gate cannot prove WHICH task was lifted, so it has proved
                  nothing; a missing lift of the intended task would hide behind
                  an unrelated match. Ambiguity is failure, not success.

  Every bullet must take exactly one of two paths:

    1. `<!-- tasks-ref: <substring> -->`  (positive)
       The substring must occur in exactly one open `- [ ]` line in TASKS.md.
       Declaring is not trusting: it is matched, counted, and must be unique.
       Matching runs against the WHOLE line — an earlier revision truncated each
       task line to its first 120 chars to force "title anchoring", which broke
       every real handoff reference in this repo (measured 2026-08-24: the three
       tasks carrying handoff links hold them at chars 1756 / 1315 / 439, so all
       three false-failed). The uniqueness requirement above is what keeps a short
       ref from silently matching unrelated narrative prose — a coincidental extra
       match now surfaces as an ambiguity failure instead of a false pass.

    2. `<!-- archive-only: <reason> -->`  (negative)
       Intentionally NOT a task-board item. Skipped, with the reason recorded.

  There is deliberately no `handoffs/<slug>` auto-path. It was removed on
  2026-08-24 after measurement showed the assumption behind it was false: a slug
  is NOT a unique identifier in this repo — `2026-06-27-customer-service-u6-
  chatwoot-handoff` appears in three separate open tasks. An auto-path built on a
  false uniqueness claim is the same defect class as the guessing engine it
  replaced. A handoff slug is still a perfectly good `tasks-ref` value; it just
  has to be declared and proven unique like everything else.

  A bullet carrying neither annotation FAILS with an actionable message. There is
  deliberately no heuristic fallback: an unannotated bullet is an unanswered
  question ("is this a task or not?"), and answering it by guessing is the very
  failure this gate exists to prevent.

  Exit codes:
    0 — all lifted (or archive-only annotated) — PASS
    1 — one or more unlifted bullets — FAIL (Add-CriticalFailure when wired
        into system-health-check)
    2 — no archives found / scope skipped — informational

.PARAMETER WorkRoot
  Monorepo root. Default: parent of script's parent.

.PARAMETER DryRun
  Reports only; never writes state file or modifies anything. Useful for
  human inspection. -EmitState below is independent.

.PARAMETER EmitState
  Write `agency-os/.agency-state/archive-lift-last.json` for downstream
  consumers (system-health-check reads it without re-running the check).

.PARAMETER ArchiveFile
  Override the auto-detected newest archive (testing / one-off audit).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\verify-archive-tasks-lift.ps1 -EmitState

.NOTES
  Naming convention: archive file = YYYY-MM-DD-HHMM.md, picked by lexical
  ordering (assumes ISO date prefix). Same pattern as .claude/commands/ao-close.md
  Step 3 archive write path.

  The writer side of this contract lives in `.claude/commands/ao-close.md`
  Step 2.5 — AO-CLOSE must emit one of the three annotations above for every
  未完成 / 明日優先 bullet. Changing the annotation vocabulary here requires
  updating that file in the same commit, or the next AO-CLOSE blocks itself.
#>

[CmdletBinding()]
param(
  [string]$WorkRoot,
  [switch]$DryRun,
  [switch]$EmitState,
  [string]$ArchiveFile
)

$ErrorActionPreference = 'Stop'

# Resolve WorkRoot ---------------------------------------------------------
if (-not $WorkRoot) {
  $envRoot = $env:MONOREPO_ROOT
  if ($envRoot -and (Test-Path -LiteralPath $envRoot)) {
    $WorkRoot = $envRoot
  } else {
    $WorkRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
  }
}

$archiveDir = Join-Path $WorkRoot 'agency-os\reports\ao-close'
$tasksPath  = Join-Path $WorkRoot 'agency-os\TASKS.md'

$findings = New-Object System.Collections.Generic.List[object]
$verdict  = 'pass'
$exit     = 0

function Add-Finding {
  param([string]$Severity, [string]$Detail, [string]$Bullet = '', [string]$Section = '')
  $findings.Add([pscustomobject]@{
    severity = $Severity
    detail   = $Detail
    bullet   = $Bullet
    section  = $Section
  }) | Out-Null
}

# 1) Locate newest archive --------------------------------------------------
if ($ArchiveFile) {
  if (-not (Test-Path -LiteralPath $ArchiveFile)) {
    Add-Finding 'error' "Specified -ArchiveFile not found: $ArchiveFile" '' ''
    $verdict = 'error'
    $exit    = 1
    $latestArchive = $null
  } else {
    $latestArchive = (Resolve-Path -LiteralPath $ArchiveFile).Path
  }
} elseif (-not (Test-Path -LiteralPath $archiveDir)) {
  Add-Finding 'info' "Archive dir does not exist yet: $archiveDir" '' ''
  $verdict = 'skipped'
  $exit    = 2
  $latestArchive = $null
} else {
  $candidates = Get-ChildItem -LiteralPath $archiveDir -Filter '*.md' -File |
    Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}-\d{4}\.md$' } |
    Sort-Object Name -Descending
  if ($candidates.Count -eq 0) {
    Add-Finding 'info' "No archive files matching YYYY-MM-DD-HHMM.md found in $archiveDir" '' ''
    $verdict = 'skipped'
    $exit    = 2
    $latestArchive = $null
  } else {
    $latestArchive = $candidates[0].FullName
  }
}

# 2) Verify TASKS.md exists -------------------------------------------------
if (-not (Test-Path -LiteralPath $tasksPath)) {
  Add-Finding 'error' "TASKS.md not found at $tasksPath" '' ''
  $verdict = 'error'
  $exit    = 1
}

# 3) Parse archive bullets --------------------------------------------------
# Match the headings used by .claude/commands/ao-close.md Step 2:
#   ## 未完成          (or ## 未完成 / 明日優先 combined)
#   ## 明日優先
$bullets = @()
if ($latestArchive -and (Test-Path -LiteralPath $latestArchive)) {
  $archiveLines = Get-Content -LiteralPath $latestArchive -Encoding UTF8
  $currentSection = $null
  foreach ($line in $archiveLines) {
    # Section detector: heading text EXACTLY '未完成' or '明日優先'
    # (Pre-fix bug: '^#{1,3}\s+.*(未完成|明日優先).*$' matched sub-headings like
    # '### 兩條 5/28 18:46「明日優先」實質完成', falsely capturing its bullets.
    # 2026-05-28 22:50 fix during Phase Z6 self-validation.)
    if ($line -match '^#{1,3}\s+(未完成|明日優先)\s*$') {
      $currentSection = $matches[1]
      continue
    }
    # Section terminator: next top-level heading
    if ($line -match '^#{1,3}\s+' -and $currentSection) {
      $currentSection = $null
      continue
    }
    # Bullet capture inside section
    if ($currentSection -and $line -match '^\s*-\s+(\S.*)$') {
      $bulletText = $matches[1].Trim()
      # Skip sub-bullets (indented) — only top-level archive bullets matter
      if ($line -match '^\s{2,}-\s') { continue }
      $bullets += [pscustomobject]@{
        section = $currentSection
        text    = $bulletText
      }
    }
  }
}

# 4) For each bullet, resolve its explicit declaration ---------------------
# No token derivation, no similarity matching — see DESIGN INVARIANT in the
# header block. Each bullet declares where it lives; this section verifies the
# declaration against the real board.
$tasksContent = if (Test-Path -LiteralPath $tasksPath) {
  Get-Content -LiteralPath $tasksPath -Raw -Encoding UTF8
} else { '' }

# Pre-filter to only `- [ ]` lines. Lines are kept WHOLE (no truncation): real
# task lines in this repo run to thousands of chars and legitimately carry their
# identifying references — handoff links most of all — deep in the narrative.
# Coincidental matches are caught by the uniqueness rule below, not by truncation.
$openTaskLines = @(($tasksContent -split "`r?`n") | Where-Object { $_ -match '^\s*-\s+\[\s\]' })

# Return every open task line containing $Needle. Count drives the verdict:
# 0 = not on the board, 1 = proven, >1 = ambiguous (cannot prove which).
function Get-MatchingOpenTasks {
  param([string]$Needle)
  $escaped = [regex]::Escape($Needle)
  return @($openTaskLines | Where-Object { $_ -match $escaped })
}

# Short excerpt of a task line, for disambiguation messages.
function Get-TaskExcerpt {
  param([string]$Line)
  $t = $Line.Trim()
  if ($t.Length -gt 70) { return $t.Substring(0, 70) + '...' }
  return $t
}

$lifted    = 0
$missing   = 0
$skipped   = 0  # archive-only annotated

foreach ($b in $bullets) {
  # --- Contradiction guard: "exactly one of two paths" must be ENFORCED ------
  # Without this, whichever branch is tested first silently wins and the other
  # declaration is never validated — the spec would say "exactly one" while the
  # code accepted both. A bullet claiming to be simultaneously on and off the
  # task board is unresolvable metadata, not a pass.
  $hasArchiveOnly = $b.text -match '<!--\s*archive-only:'
  $hasTasksRef    = $b.text -match '<!--\s*tasks-ref:'
  if ($hasArchiveOnly -and $hasTasksRef) {
    $missing++
    Add-Finding 'fail' "Bullet carries BOTH archive-only and tasks-ref — contradictory declarations. Keep exactly one: tasks-ref if it is on the board, archive-only if it deliberately is not." $b.text $b.section
    continue
  }

  # --- Negative path: explicitly declared as NOT a task-board item ----------
  # The payload is validated, not just detected: this gate's whole claim about
  # archive-only is that the rationale gets recorded. `(.*?)` (not `.+?`) so a
  # blank reason still MATCHES here and is rejected with a precise message,
  # instead of falling through to the generic "no declaration" branch.
  if ($b.text -match '<!--\s*archive-only:\s*(.*?)\s*-->') {
    $reason = $matches[1].Trim()
    # Empty is the only machine-decidable failure. A length threshold was tried
    # (min 4) and removed on 2026-08-25: it false-failed legitimate short CJK
    # reasons like 已解決 (3 chars) while still accepting meaningless padding
    # like "aaaa", i.e. it was a heuristic proxy for a property no gate can
    # actually check. "Did you state a reason" is enforceable; "is the reason
    # any good" is a human judgement and stays with the reader.
    if ($reason.Length -eq 0) {
      $missing++
      Add-Finding 'fail' "archive-only has no reason. State why this is deliberately off the task board — a blank rationale records nothing and defeats the annotation." $b.text $b.section
      continue
    }
    $skipped++
    Add-Finding 'info' "Archive-only (reason: $reason)" $b.text $b.section
    continue
  }

  # --- Positive path: explicit tasks-ref, resolved to EXACTLY ONE open task --
  # Declaring is not trusting. 0 matches = not on the board. >1 matches = the
  # gate cannot prove which task was lifted, so it has proved nothing.
  if ($b.text -match '<!--\s*tasks-ref:\s*(.+?)\s*-->') {
    $ref = $matches[1].Trim()
    if ($ref.Length -lt 4) {
      $missing++
      Add-Finding 'fail' "tasks-ref too short to identify a task (min 4 chars): '$ref'" $b.text $b.section
      continue
    }
    $hits = Get-MatchingOpenTasks -Needle $ref
    if ($hits.Count -eq 1) {
      $lifted++
      Add-Finding 'info' "Lifted via tasks-ref (resolved to exactly 1 open task): $ref" $b.text $b.section
    } elseif ($hits.Count -eq 0) {
      $missing++
      Add-Finding 'fail' "tasks-ref declared but matches NO open '- [ ]' line: '$ref' — fix the ref, or add the task to TASKS.md" $b.text $b.section
    } else {
      $missing++
      $excerpts = ($hits | ForEach-Object { Get-TaskExcerpt $_ }) -join ' || '
      Add-Finding 'fail' "tasks-ref '$ref' is AMBIGUOUS — matches $($hits.Count) open tasks, so it cannot prove which one was lifted. Lengthen the ref until it is unique. Candidates: $excerpts" $b.text $b.section
    }
    continue
  }

  # --- No explicit declaration: fail loud, never guess ----------------------
  $missing++
  Add-Finding 'fail' "No lift declaration. Add '<!-- tasks-ref: <substring unique to one open - [ ] line> -->' if this IS on the task board, or '<!-- archive-only: <reason> -->' if it deliberately is not." $b.text $b.section
}

if ($missing -gt 0) {
  $verdict = 'fail'
  $exit    = 1
} elseif ($skipped -gt 0 -and $bullets.Count -gt 0 -and $lifted -eq 0 -and $missing -eq 0) {
  # All bullets are archive-only — that's OK but worth noting
  $verdict = 'pass-with-skipped'
}

# 5) Output -----------------------------------------------------------------
Write-Host "============================================================"
Write-Host " verify-archive-tasks-lift.ps1"
Write-Host "============================================================"
Write-Host "  WorkRoot    : $WorkRoot"
Write-Host "  Archive     : $(if ($latestArchive) { $latestArchive } else { '(none)' })"
Write-Host "  TASKS.md    : $tasksPath"
Write-Host ""
Write-Host "  Bullets    : $($bullets.Count)"
Write-Host "  Lifted     : $lifted"
Write-Host "  Missing    : $missing"
Write-Host "  Archive-only: $skipped"
Write-Host "  Verdict    : $verdict"
Write-Host ""

foreach ($f in $findings) {
  $color = switch ($f.severity) {
    'info'  { 'DarkGray' }
    'warn'  { 'Yellow' }
    'fail'  { 'Red' }
    'error' { 'Red' }
    default { 'White' }
  }
  $tag = $f.severity.ToUpper()
  $sect = if ($f.section) { "[$($f.section)] " } else { '' }
  Write-Host ("  [$tag] $sect$($f.detail)") -ForegroundColor $color
  if ($f.bullet) {
    $excerpt = $f.bullet
    if ($excerpt.Length -gt 90) { $excerpt = $excerpt.Substring(0, 90) + '...' }
    Write-Host "         bullet: $excerpt" -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host "============================================================"
Write-Host " RESULT: $($verdict.ToUpper())  (exit=$exit)"
Write-Host "============================================================"

# 6) Emit state file (optional) --------------------------------------------
if ($EmitState -and -not $DryRun) {
  try {
    $stateDir = Join-Path $WorkRoot 'agency-os\.agency-state'
    if (-not (Test-Path -LiteralPath $stateDir)) {
      New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }
    $statePath = Join-Path $stateDir 'archive-lift-last.json'

    $findingsForJson = @()
    foreach ($f in $findings) {
      $findingsForJson += [pscustomobject]@{
        severity = $f.severity
        section  = $f.section
        detail   = $f.detail
        bullet   = if ($f.bullet.Length -gt 200) { $f.bullet.Substring(0, 200) } else { $f.bullet }
      }
    }

    $payload = [pscustomobject]@{
      schemaVersion  = 1
      generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
      workRoot       = $WorkRoot
      archive        = $latestArchive
      tasksPath      = $tasksPath
      bullets        = $bullets.Count
      lifted         = $lifted
      missing        = $missing
      archiveOnly    = $skipped
      verdict        = $verdict
      exitCode       = $exit
      findings       = $findingsForJson
    }
    $json = $payload | ConvertTo-Json -Depth 6
    $utf8 = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($statePath, $json, $utf8)
    Write-Host "  state file written: $statePath" -ForegroundColor DarkGray
  } catch {
    Write-Host "  WARN: failed to write state file: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

exit $exit
