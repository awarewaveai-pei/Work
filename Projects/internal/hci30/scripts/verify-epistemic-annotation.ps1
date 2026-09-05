[CmdletBinding()]
param(
  [string]$MigrationsDir,
  # Look-back window: the ADR-0013 citation must appear on the declaring
  # line itself or within this many lines above it (a comment block placed
  # directly over the column, the shape 0010 uses).
  [int]$Window = 8,
  [switch]$SkipSelfTest
)

# $PSScriptRoot cannot be relied on inside a param() default value
# expression (it is not yet populated at that point in some PowerShell
# versions - the same reason every other script in this repo sets $root
# from $PSScriptRoot in the body, never in param()); resolved here instead.
if (-not $MigrationsDir) { $MigrationsDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'database/migrations' }

# ADR-0013 gate 5, WAVE1-EPISTEMIC-ANNOTATION-01: any Wave 1 migration that
# declares an evidence/claim/assessment epistemic or risk classification
# column (name matching epistemic|risk_tier|admission_state|fact_type) must
# annotate it with an inline SQL comment citing ADR-0013 and marking the
# value set provisional pending gate 3. This exists so Wave 1 does not
# silently freeze a vocabulary that Wave 3's lossless-mapping test then
# finds unmappable. Source-level check, as the ADR specifies (it is the
# migration text that gets reviewed), not a catalog COMMENT ON check.
#
# Self-test runs first by default: a synthetic unannotated file must be
# flagged and a synthetic annotated one must not, so a regex that quietly
# matches nothing cannot report a green build (the same non-vacuity rule the
# SQL suite's mutation-check enforces).

$ErrorActionPreference = 'Stop'

# A declaration is: optional `ADD COLUMN`, a column name containing one of
# the trigger words, then a type keyword. Comment lines are skipped. A bare
# reference like `OLD.risk_tier` or `WHERE risk_tier IN (...)` has no type
# keyword after the name and does not match.
$declPattern = '^\s*(?:ADD\s+COLUMN\s+)?(?<col>[a-z_]*(?:epistemic|risk_tier|admission_state|fact_type)[a-z_]*)\s+(?:text|varchar|character|char|integer|smallint|bigint|uuid|boolean)\b'

function Get-Violations {
  param([Parameter(Mandatory)][string]$Dir, [Parameter(Mandatory)][int]$LookBack)
  $violations = @()
  $files = Get-ChildItem -LiteralPath $Dir -Filter '*_up.sql' | Sort-Object Name
  foreach ($f in $files) {
    $lines = Get-Content -LiteralPath $f.FullName -Encoding UTF8
    # A RETURNS TABLE(...) column list re-declares an already-constrained
    # real column's type for a function's return shape - it carries no
    # CHECK/ENUM of its own (ADR-0013 gate 5's literal scope is "a CHECK
    # constraint or CREATE TYPE ... AS ENUM introduced ... for a column"),
    # so it is not a second classification decision needing its own
    # citation. Tracked as a simple span: this schema's RETURNS TABLE
    # lists always open and close within a few lines, never nested.
    $inReturnsTable = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
      $line = $lines[$i]
      if ($line -match '^\s*--') { continue }
      if ($line -match 'RETURNS\s+TABLE\s*\(') { $inReturnsTable = $true }
      if ($inReturnsTable) {
        if ($line -match '\)\s*LANGUAGE') { $inReturnsTable = $false }
        continue
      }
      if ($line -notmatch $declPattern) { continue }
      $col = $Matches['col']
      $start = [Math]::Max(0, $i - $LookBack)
      $annotated = $false
      for ($j = $start; $j -le $i; $j++) {
        if ($lines[$j] -match 'ADR-0013') { $annotated = $true; break }
      }
      if (-not $annotated) {
        $violations += ('{0}:{1}: column `{2}` has no ADR-0013 annotation within {3} lines above it' -f $f.Name, ($i + 1), $col, $LookBack)
      }
    }
  }
  return ,$violations
}

if (-not $SkipSelfTest) {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('epistemic-selftest-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $bad = "CREATE TABLE t (`n  id uuid PRIMARY KEY,`n  risk_tier text NOT NULL CHECK (risk_tier IN ('R0'))`n);`n"
    $good = "-- ADR-0013 (WAVE1-EPISTEMIC-ANNOTATION-01): provisional pending gate 3`nALTER TABLE t ADD COLUMN epistemic_label text CHECK (epistemic_label IN ('UNKNOWN'));`n-- OLD.risk_tier below is a reference, not a declaration`nSELECT 1 WHERE risk_tier IN ('R0');`n" +
            "CREATE FUNCTION f() RETURNS TABLE (`n  id uuid, epistemic_label text, risk_tier text`n) LANGUAGE sql AS `$`$ SELECT 1 `$`$;`n"
    [IO.File]::WriteAllText((Join-Path $tmp '0001_bad_up.sql'), $bad, (New-Object System.Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $tmp '0002_good_up.sql'), $good, (New-Object System.Text.UTF8Encoding($false)))
    $found = Get-Violations -Dir $tmp -LookBack $Window
    if ($found.Count -ne 1 -or $found[0] -notmatch '^0001_bad_up\.sql:3: column `risk_tier`') {
      Write-Host 'verify-epistemic-annotation: SELF-TEST FAILED - expected exactly one violation at 0001_bad_up.sql:3 (risk_tier); RETURNS TABLE re-declarations of epistemic_label/risk_tier in 0002_good_up.sql must NOT be flagged (they carry no CHECK/ENUM of their own). Got:'
      $found | ForEach-Object { Write-Host "  $_" }
      exit 2
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'verify-epistemic-annotation: self-test ok (unannotated column flagged, annotated column and bare reference not)'
}

if (-not (Test-Path -LiteralPath $MigrationsDir)) { throw "migrations directory not found: $MigrationsDir" }
$real = Get-Violations -Dir $MigrationsDir -LookBack $Window
if ($real.Count -gt 0) {
  Write-Host ('verify-epistemic-annotation: FAIL - {0} unannotated classification column(s):' -f $real.Count)
  $real | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host 'verify-epistemic-annotation: ok - every epistemic/risk classification column cites ADR-0013'
exit 0
