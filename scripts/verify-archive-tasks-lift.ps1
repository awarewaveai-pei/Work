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
  greps TASKS.md for a matching `- [ ]` line. Mismatches are reported.

  Escape hatch: a bullet ending with HTML comment
    `<!-- archive-only: <reason> -->`
  is intentionally archive-only and skipped (counted as warning only).

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

  The matching algorithm is intentionally lenient on prose but anchored on a
  stable "token" — the first 20-40 chars after stripping leading markdown
  bullet/decoration. Operators control match strength: a bullet titled
  `**SG deploy** — production 落後 3 commits` produces token `SG deploy` which
  matches any TASKS.md line containing `SG deploy`.
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
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
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

# 4) For each bullet, derive a token and grep TASKS.md ---------------------
# Token strategy: strip markdown decoration (**, `, [], etc.), take first
# meaningful 20-40 chars. Operators control match strength.
$tasksContent = if (Test-Path -LiteralPath $tasksPath) {
  Get-Content -LiteralPath $tasksPath -Raw -Encoding UTF8
} else { '' }

# Pre-filter to only `- [ ]` lines for performance and accuracy.
# Anchor: only match tokens that appear within the first 120 chars of the
# `- [ ]` line. This prevents false positives where a token appears deep
# inside another task's narrative description (observed: "SG deploy" appears
# in a Phase 4 task narrative without being its own task).
$openTaskLines = @(($tasksContent -split "`r?`n") | Where-Object { $_ -match '^\s*-\s+\[\s\]' })
# Build per-line anchored search strings: only first 120 chars of each line.
$openTaskHeads = @($openTaskLines | ForEach-Object {
  if ($_.Length -gt 120) { $_.Substring(0, 120) } else { $_ }
})
$openTaskBlob  = $openTaskHeads -join "`n"

$lifted    = 0
$missing   = 0
$skipped   = 0  # archive-only annotated

foreach ($b in $bullets) {
  # Archive-only escape hatch — explicit HTML comment
  if ($b.text -match '<!--\s*archive-only:\s*(.+?)\s*-->') {
    $reason = $matches[1].Trim()
    $skipped++
    Add-Finding 'info' "Archive-only (reason: $reason)" $b.text $b.section
    continue
  }

  # Auto lifted: bullet references a handoff slug that also appears in TASKS - [ ].
  # Matches both: handoffs/2026-06-06-2044-slug.md  AND  handoffs/2026-06-06-2044 (no extension).
  # This covers the common AO-CLOSE style "（TASKS 已開 → handoffs/YYYY-MM-DD-HHMM-slug）".
  if ($b.text -match 'handoffs/(\d{4}-\d{2}-\d{2}-\d{4}(?:-[^)\s.]+)?)') {
    $slug = $matches[1]
    $slugEscaped = [regex]::Escape($slug)
    if ($openTaskBlob -match $slugEscaped) {
      $lifted++
      Add-Finding 'info' "Lifted via handoff slug: $slug" $b.text $b.section
      continue
    }
  }

  # Auto-classify: bullet claims "（TASKS …" or "(TASKS" or "TASKS:" — already on task board.
  # （ = full-width （ — avoids CP950/BOM encoding trap in regex bracket class.
  # Runs token-matching to verify: if a bold token exists in TASKS → lifted (verified).
  # If not verified → warn (visible in output/state-file, not a hard fail) rather than silent skip.
  if ($b.text -match '[\(（]TASKS|TASKS:') {
    $verifyTokens = @()
    $cleanVerify  = ($b.text -replace '<!--.*?-->', '').Trim()
    $boldVerify   = [regex]::Matches($cleanVerify, '\*\*([^*]+)\*\*')
    foreach ($mv in $boldVerify) {
      $bv = $mv.Groups[1].Value.Trim() -replace '`', ''
      if ($bv.Length -ge 4 -and $bv.Length -le 80) { $verifyTokens += $bv }
    }
    $verifyMatched = $false
    foreach ($tv in $verifyTokens) {
      if ($openTaskBlob -match [regex]::Escape($tv)) { $verifyMatched = $true; break }
    }
    if ($verifyMatched) {
      $lifted++
      Add-Finding 'info' "Lifted via TASKS reference + token verified" $b.text $b.section
    } else {
      $skipped++
      Add-Finding 'warn' "TASKS-ref auto-skipped but bold token not found in TASKS.md — verify manually or add archive-only comment" $b.text $b.section
    }
    continue
  }

  # Token strategy: prefer **bold-text** identifiers (operators write
  # `- [ ] **Batch 3** — ...` style); fall back to sliding-window substrings.
  # Each candidate is tried against TASKS.md `- [ ]` lines until one matches.
  #
  # Strip leading bullet metadata: `[ ]`, `[x]`, backticks-wrapped `[ ]`
  $clean = $b.text
  $clean = $clean -replace '^`?\[[ x]\]`?\s*', ''
  $clean = $clean.Trim()

  # Primary candidates: bold-text fragments (most distinctive identifier),
  # plus sliding sub-windows of each bold token to handle prefix/decoration
  # mismatches (e.g. archive `筆電 ` vs TASKS `筆電跑 `).
  $tokens = @()
  $boldMatches = [regex]::Matches($clean, '\*\*([^*]+)\*\*')
  foreach ($m in $boldMatches) {
    $bold = $m.Groups[1].Value.Trim() -replace '`', ''
    if ($bold.Length -ge 4 -and $bold.Length -le 80) {
      $tokens += $bold
      # Also try 8-12-char sliding windows so partial matches succeed
      if ($bold.Length -ge 8) {
        for ($start = 0; $start -le ($bold.Length - 8); $start++) {
          $win = $bold.Substring($start, [Math]::Min(12, $bold.Length - $start)).Trim()
          if ($win.Length -ge 8 -and $win -notmatch '^\s+$') { $tokens += $win }
        }
      }
    }
  }

  # Fallback candidates: sliding-window of cleaned text (no markdown)
  $plain = $clean -replace '\*\*', '' -replace '`', ''
  $plain = $plain.Trim()
  if ($tokens.Count -eq 0) {
    if ($plain.Length -lt 6) {
      Add-Finding 'warn' "Bullet too short for token match: '$plain'" $b.text $b.section
      continue
    }
    foreach ($len in @(30, 20, 12, 8)) {
      if ($plain.Length -ge $len) {
        $tokens += $plain.Substring(0, $len).Trim()
      }
    }
  }

  $matched = $false
  $matchedToken = ''
  foreach ($t in $tokens) {
    $escaped = [regex]::Escape($t)
    if ($openTaskBlob -match $escaped) {
      $matched = $true
      $matchedToken = $t
      break
    }
  }

  if ($matched) {
    $lifted++
    # Don't pollute findings with every PASS; only count.
  } else {
    $missing++
    Add-Finding 'fail' "Not lifted to TASKS.md (no `- [ ]` line matches first chars of bullet)" $b.text $b.section
  }
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
