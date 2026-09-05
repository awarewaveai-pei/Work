[CmdletBinding()]
param(
  [string]$MigrationsDir,
  [switch]$SkipSelfTest
)

# $PSScriptRoot cannot be relied on inside a param() default value
# expression - resolved here instead, same reasoning as
# verify-epistemic-annotation.ps1.
if (-not $MigrationsDir) { $MigrationsDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'database/migrations' }

# ADR-0004 gate 1 (Wave 1, CI-blocking): scans every migration file for a
# column matching overall_score|composite_trust|aggregate_trust|
# universal_trust|^trust_score$ on any table, and fails if that table has no
# NOT-NULL `domain` column anywhere across the migration history - the exact
# shape ADR-0004 forbids (a single scalar "overall trust" slot with no
# per-domain key to distinguish it from a real vector entry). A table whose
# `domain` column is unconditionally NOT NULL is exempt: every row on it IS a
# domain entry, so a column named e.g. `trust_score` there reads as "the
# score for THIS row's domain", not the forbidden aggregate.
#
# db-expert review (2026-09-05, C1): the first version exempted a table on
# ANY column literally named `domain`, nullable or not. Migration 0011 (this
# same ADR's gates 2-3) added a nullable `domain` to hci.subject_records -
# required only for kind='TRUST_DOMAIN' rows, NULL on every other kind, via
# the scoped/required CHECK-pair idiom this schema uses throughout (not a
# hard column-level NOT NULL). That column's mere presence then exempted
# subject_records from this whole check: `ALTER TABLE hci.subject_records ADD
# COLUMN overall_score numeric;` would pass gate 1 from that migration
# onward, reproducing the exact failure ADR-0004:17 names, on the very table
# this ADR exists to protect. Requiring a hard NOT NULL denies the exemption
# to a shared multi-kind table like subject_records (correct - domain is not
# every row's identity there) while still exempting a genuinely
# domain-dedicated table (every row of which IS a domain entry). Defense in
# depth: TRUST-NO-AGGREGATE-COLUMN-01 (wave1-negative-tests.sql) asserts the
# same invariant directly against the live hci.subject_records catalog,
# independent of this script's own text-matching limits.
#
# Deliberately not a full SQL parser (this codebase already accepts that
# trade-off in verify-epistemic-annotation.ps1): CREATE TABLE / ALTER TABLE
# statements in this schema never nest a $$ function body inside their own
# text, so isolating "start of CREATE/ALTER TABLE up to the next semicolon,
# after stripping -- comments" is a safe boundary here, not a general-purpose
# assumption. Same reasoning covers a semicolon inside a string literal
# (e.g. a DEFAULT 'x;y') - grep-verified none exists in this corpus today;
# if one is ever added, the block would truncate early and could hide a
# forbidden column declared after it.
#
# Self-test runs first by default, same non-vacuity rule every audit script
# in this repo follows: a bad synthetic table (forbidden column, no domain at
# all) must be flagged; a table whose domain column is nullable (this
# schema's own real shape for a kind-scoped column) must ALSO be flagged,
# proving the exemption cannot be won cheaply; a table whose domain column is
# genuinely NOT NULL must clear; and - because ADR-0004's own case
# (subject_records: CREATE in 0001, domain added by ALTER in 0011) spans
# multiple files - a forbidden column declared in one file and a NOT NULL
# domain column added to the SAME table in a LATER file must also clear,
# proving the check aggregates per-table state across the whole migrations
# directory rather than per-file.

$ErrorActionPreference = 'Stop'

# critic review (2026-09-05, C2): the forbidden-column scan used to require a
# "name TYPE-keyword" match first (the same pattern the `domain` exemption
# scan uses), gated on a type-keyword whitelist covering only the types this
# schema happens to use elsewhere. A forbidden column declared with any other
# type - decimal, real, double precision, int, jsonb, an un-listed synonym -
# matched nothing and was silently invisible. Fixed by matching the forbidden
# names directly as identifiers, independent of what type follows them: a
# missed match on the DOMAIN side fails safe (loses an exemption, i.e. flags
# MORE), but a missed match on the FORBIDDEN side fails unsafe (hides the
# exact thing this gate exists to catch) - the two sides must not share one
# failure mode.
$forbiddenIdentPattern = '(?i)\b(?:overall_score|composite_trust|aggregate_trust|universal_trust|trust_score)\b'
$typeKeywords = 'text|varchar|character(?:\s+varying)?|char|integer|smallint|bigint|uuid|boolean|numeric|timestamptz|timestamp'
# "name TYPE-keyword" wherever it occurs in a CREATE/ALTER TABLE block, not
# anchored to line-start: this schema declares several columns per line in
# its compact CREATE TABLE style (e.g. subject_records in 0001), so a
# line-start anchor would silently miss every column after the first on such
# a line. Used ONLY for the `domain` exemption scan now (see C2 above) - (?i)
# added after critic review (2026-09-05, C1) found this was case-sensitive,
# so `NUMERIC`/`Numeric` (a common house style this repo's own migrations do
# not use, but nothing enforces that) never matched at all.
$colDeclPattern = "(?i)(?<name>[a-zA-Z_][a-zA-Z0-9_]*)\s+(?:$typeKeywords)\b"

# Whether the column clause starting at $body[$startIndex] carries a bare
# NOT NULL before its own top-level comma (or the end of the block). Tracks
# paren depth so a CHECK(...) containing commas of its own - e.g. `domain
# text CHECK (domain IN ('OPERATIONAL','COMPETENCE'))` - is not mistaken for
# the next column starting.
function Test-ColumnClauseNotNull {
  param([Parameter(Mandatory)][string]$Body, [Parameter(Mandatory)][int]$StartIndex)
  $depth = 0
  for ($i = $StartIndex; $i -lt $Body.Length; $i++) {
    $ch = $Body[$i]
    if ($ch -eq '(') { $depth++ }
    elseif ($ch -eq ')') {
      if ($depth -eq 0) { break }
      $depth--
    }
    elseif ($ch -eq ',' -and $depth -eq 0) { break }
  }
  $clause = $Body.Substring($StartIndex, $i - $StartIndex)
  return [bool]($clause -match '(?i)\bNOT\s+NULL\b')
}

function Get-TrustColumnViolations {
  param([Parameter(Mandatory)][string]$Dir)
  # Per-table state, accumulated across every file in filename order, so a
  # table CREATEd in an early migration and given `domain` by ALTER TABLE in
  # a later one still clears. Note (critic review, 2026-09-05): this is a
  # union, not a true "final shape" snapshot - `hasNotNullDomain` is set-once
  # and never cleared, so a later migration that DROPs the NOT NULL domain
  # column again would still read as exempt here. Out of scope for this
  # gate's real target (this schema's migrations are additive, never drop a
  # column that made a table exempt); the DB-layer TRUST-NO-AGGREGATE-COLUMN-01
  # assertion has no such gap, since it reads the live catalog, not history.
  $tables = @{}
  $files = Get-ChildItem -LiteralPath $Dir -Filter '*.sql' | Sort-Object Name
  # critic review (2026-09-05): a directory that resolves but is empty (a
  # typo'd path pointing at a real-but-wrong folder) previously reported
  # "ok" with zero violations - gate 1 silently closed rather than erroring.
  if ($files.Count -eq 0) { throw "no .sql files found in $Dir" }
  foreach ($f in $files) {
    $raw = Get-Content -LiteralPath $f.FullName -Encoding UTF8
    # Strip -- line comments before block-splitting, so a semicolon or a
    # column-shaped word mentioned only in prose cannot be mistaken for SQL.
    $stripped = ($raw | ForEach-Object { $_ -replace '--.*$', '' }) -join "`n"
    # critic review (2026-09-05, M1): the original pattern captured the FIRST
    # word after CREATE/ALTER TABLE unconditionally, so `ALTER TABLE IF EXISTS
    # foo` captured 'if' as the table name - a real form already present in
    # this corpus (0002/0003's down migrations) - collapsing every such
    # statement's forbidden/domain state into one shared 'if' bucket and
    # leaking one table's exemption onto an unrelated one. IF (NOT) EXISTS /
    # ONLY are now skipped before the real table name.
    $regex = [regex]'(?is)\b(?:CREATE\s+TABLE|ALTER\s+TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+|ONLY\s+)?(?<table>[a-zA-Z_][a-zA-Z0-9_.]*)\b(?<body>.*?);'
    foreach ($m in $regex.Matches($stripped)) {
      $table = $m.Groups['table'].Value.ToLowerInvariant()
      $body = $m.Groups['body'].Value
      if (-not $tables.ContainsKey($table)) { $tables[$table] = [ordered]@{ hasNotNullDomain = $false; forbidden = [System.Collections.Generic.List[string]]::new() } }
      foreach ($cm in ([regex]$colDeclPattern).Matches($body)) {
        $col = $cm.Groups['name'].Value
        if ($col -ieq 'domain' -and (Test-ColumnClauseNotNull -Body $body -StartIndex $cm.Index)) {
          $tables[$table].hasNotNullDomain = $true
        }
      }
      foreach ($fm in ([regex]$forbiddenIdentPattern).Matches($body)) {
        $col = $fm.Value
        if (-not $tables[$table].forbidden.Contains($col)) { $tables[$table].forbidden.Add($col) }
      }
    }
  }
  $violations = @()
  foreach ($t in $tables.Keys | Sort-Object) {
    if ($tables[$t].forbidden.Count -gt 0 -and -not $tables[$t].hasNotNullDomain) {
      foreach ($col in $tables[$t].forbidden) {
        $violations += "table '$t' has forbidden column '$col' with no unconditionally-NOT-NULL domain column anywhere in its migration history"
      }
    }
  }
  return ,$violations
}

if (-not $SkipSelfTest) {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('trust-column-selftest-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    # 0001: bad_table (forbidden column, no domain at all) + nullable_table
    # (forbidden column WITH a domain column, but nullable - this schema's
    # OWN real shape for a kind-scoped column, e.g. subject_records.domain
    # itself - must still be flagged, per db-expert C1) + good_table
    # (forbidden-shaped column NAME paired with a genuinely NOT NULL domain)
    # + a compact multi-column-per-line CREATE TABLE (matching this schema's
    # actual subject_records style) proving line-start anchoring is not
    # silently required, and that a CHECK(...)'s own internal commas do not
    # get mistaken for the next column starting - critic review (2026-09-05,
    # M2) found the ORIGINAL version of this fixture put NOT NULL BEFORE the
    # CHECK, so a broken paren-depth walk that just stopped at the first
    # comma would still see "...NOT NULL CHECK (domain IN ('A'" (which still
    # contains NOT NULL) and pass anyway - the fixture never actually
    # exercised the depth-tracking it claimed to. NOT NULL now comes AFTER
    # the CHECK, so only correct depth-tracking finds it.
    # uppercase_table / evading_type_table (critic C1/C2, 2026-09-05): no
    # domain at all, so both MUST be flagged regardless of type casing or
    # exact type keyword - proves the forbidden-column scan does not depend
    # on the same case-sensitive, whitelist-gated match the domain-exemption
    # scan uses.
    $mig1 = "CREATE TABLE bad_table (`n  id uuid PRIMARY KEY, overall_score numeric`n);`n" +
            "CREATE TABLE nullable_table (id uuid PRIMARY KEY, domain text, trust_score numeric);`n" +
            "CREATE TABLE good_table (id uuid PRIMARY KEY, domain text NOT NULL, trust_score numeric);`n" +
            "CREATE TABLE compact_table (id uuid PRIMARY KEY, kind text, domain text CHECK (domain IN ('A','B')) NOT NULL, universal_trust numeric);`n" +
            "CREATE TABLE uppercase_table (id UUID PRIMARY KEY, overall_score NUMERIC);`n" +
            "CREATE TABLE evading_type_table (id uuid PRIMARY KEY, composite_trust decimal(5,2));`n"
    # 0002: a table CREATEd with a forbidden column and NO domain in this
    # same file, later given a NOT NULL domain by ALTER TABLE in a LATER file
    # (0003) - the exact cross-migration shape ADR-0004's own subject_records
    # case takes (CREATE in 0001, domain added by ALTER in 0011 - nullable
    # there, since subject_records is a shared multi-kind table, which is
    # exactly why THAT real case must NOT clear via this exemption and
    # instead relies on TRUST-NO-AGGREGATE-COLUMN-01 at the DB layer; this
    # synthetic case uses a NOT NULL domain purely to prove the cross-file
    # aggregation mechanics work at all).
    # if_exists_alpha / if_exists_beta (critic M1, 2026-09-05): both altered
    # via `ALTER TABLE IF EXISTS <name>`, a real form already present in this
    # corpus's own down migrations. The original table-name capture ignored
    # `IF EXISTS` and captured the literal word 'if' for both, so alpha's
    # NOT NULL domain silently exempted beta too. beta MUST still be flagged.
    $mig2 = "CREATE TABLE cross_file_table (id uuid PRIMARY KEY, aggregate_trust numeric);`n" +
            "CREATE TABLE if_exists_alpha (id uuid PRIMARY KEY);`n" +
            "CREATE TABLE if_exists_beta (id uuid PRIMARY KEY);`n"
    $mig3 = "-- a semicolon in a comment; must not be mistaken for a statement end`n" +
            "ALTER TABLE cross_file_table ADD COLUMN domain text NOT NULL;`n" +
            "ALTER TABLE IF EXISTS if_exists_alpha ADD COLUMN domain text NOT NULL;`n" +
            "ALTER TABLE IF EXISTS if_exists_beta ADD COLUMN overall_score numeric;`n"
    [IO.File]::WriteAllText((Join-Path $tmp '0001_up.sql'), $mig1, (New-Object System.Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $tmp '0002_up.sql'), $mig2, (New-Object System.Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $tmp '0003_up.sql'), $mig3, (New-Object System.Text.UTF8Encoding($false)))
    $found = Get-TrustColumnViolations -Dir $tmp
    $expected = @(
      "table 'bad_table' has forbidden column 'overall_score' with no unconditionally-NOT-NULL domain column anywhere in its migration history"
      "table 'nullable_table' has forbidden column 'trust_score' with no unconditionally-NOT-NULL domain column anywhere in its migration history"
      "table 'uppercase_table' has forbidden column 'overall_score' with no unconditionally-NOT-NULL domain column anywhere in its migration history"
      "table 'evading_type_table' has forbidden column 'composite_trust' with no unconditionally-NOT-NULL domain column anywhere in its migration history"
      "table 'if_exists_beta' has forbidden column 'overall_score' with no unconditionally-NOT-NULL domain column anywhere in its migration history"
    )
    $foundSorted = @($found | Sort-Object)
    $expectedSorted = @($expected | Sort-Object)
    if (@(Compare-Object $foundSorted $expectedSorted).Count -ne 0) {
      Write-Host 'check-no-universal-trust-column: SELF-TEST FAILED - expected exactly these five violations (bad_table/uppercase_table/evading_type_table with no domain at all in various type-name shapes; nullable_table with only a nullable domain; if_exists_beta whose own table name must not be conflated with if_exists_alpha via IF EXISTS); good_table/compact_table (forbidden-shaped name WITH a NOT NULL domain) and cross_file_table/if_exists_alpha (NOT NULL domain present) must NOT be flagged. Got:'
      $found | ForEach-Object { Write-Host "  $_" }
      exit 2
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'check-no-universal-trust-column: self-test ok (undomained and nullable-domain forbidden columns flagged; NOT-NULL-domained ones and cross-file NOT-NULL-domain aggregation not)'
}

if (-not (Test-Path -LiteralPath $MigrationsDir)) { throw "migrations directory not found: $MigrationsDir" }
$real = Get-TrustColumnViolations -Dir $MigrationsDir
if ($real.Count -gt 0) {
  Write-Host ('check-no-universal-trust-column: FAIL - {0} violation(s):' -f $real.Count)
  $real | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host 'check-no-universal-trust-column: ok - no undomained universal-trust-shaped column exists'
exit 0
