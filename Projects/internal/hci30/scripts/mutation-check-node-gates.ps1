[CmdletBinding()]
param()

# ============================================================================
# Node-level gate mutation check - the node --test equivalent of
# mutation-check-wave1.ps1's SQL mutation sweep.
# ============================================================================
# Tracked as debt across two commits (TASKS.md, 2026-09-06): CONSENT-NEG-01
# and the five ADR-0004/P0-04 Node-level gate files had no mutation coverage
# of their own - non-vacuity rested solely on each test file's own
# accept/reject pairs, exactly the failure mode this repo's history (ADR-0004
# gate 1) already showed is not sufficient on its own for a control that
# matters.
#
# Simplification vs the SQL harness, disclosed rather than silently
# narrowed: this checks "does mutating this line make the file's own test
# suite go red at all" (exit code), not "do these EXACT named assertions
# flip" the way mutation-check-wave1.ps1 names specific assertion ids per
# mutation. node --test's default reporter output is not as reliably
# line-parseable as the SQL harness's SQLSTATE-driven assertions. This is
# still real non-vacuity proof - a mutation that produces zero failures IS
# a vacuous check, and is caught here - just a coarser one.
#
# packages/intelligence/assessment-dimensions.mjs is deliberately absent
# from the list below: its own test file
# (tests/unit/intelligence/assessment-dimensions.test.mjs, "the module
# throws at import time...") already re-reads the REAL source file's text,
# applies a targeted drift, and imports the mutated copy - a bespoke,
# self-updating mutation test that exercises this exact file's guard logic
# every run, so a second generic entry here would be redundant.
#
# Every mutation targets a single, single-line substring (never spanning
# multiple lines) specifically to keep this script's own PowerShell string
# literals simple and safe - JS template-literal backticks and `${...}`
# interpolation would otherwise collide with PowerShell's own backtick
# escape character across a multi-line double-quoted string. Any snippet
# containing a backtick or `$` uses a single-quoted PowerShell string
# (which passes both through literally); plain JS uses double-quoted.
#
# Mechanism: ESM imports resolve relative paths at parse time, so a mutated
# module cannot be swapped in at runtime. Each mutation copies the whole
# packages/, tests/, database/, and docs/ trees to a fresh temp directory
# (critic review, 2026-09-06 M5: an earlier version copied only packages/
# and tests/, so any test reading database/ or docs/ -- trust-domains.test.mjs
# reads a migration file; assessment-dimensions.test.mjs reads a spec doc --
# threw ENOENT regardless of the mutation, which this script's own
# non-zero-exit-code-means-killed logic silently counted as a correct
# "kill". A baseline no-op check, below, now runs every unique target test
# file once with NO mutation applied before the real sweep starts, and
# throws if that alone is not green -- turning that whole failure class
# into a loud, specific error instead of an inflated "killed" count).
# ============================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$mutations = @(
  @{ id = 'consent-drop-bare-consent-check'
     file = 'packages/contracts/validate-request.mjs'
     find = "if (Object.hasOwn(value, 'consent')) throw new Error('bare consent is not an HCI record type');"
     replace = ''
     test = 'tests/unit/contracts/validate-request.test.mjs' }

  @{ id = 'trust-domains-corrupt-governance-power'
     file = 'packages/contracts/trust-domains.mjs'
     find = "'GOVERNANCE_POWER',"
     replace = "'',"
     test = 'tests/unit/contracts/trust-domains.test.mjs' }

  @{ id = 'trust-domains-remove-trust-score-from-forbidden-regex'
     file = 'packages/contracts/trust-domains.mjs'
     find = 'overall_score|composite_trust|aggregate_trust|universal_trust|trust_score|overall_trust'
     replace = 'overall_score|composite_trust|aggregate_trust|universal_trust|overall_trust'
     test = 'tests/unit/contracts/validate-trust-domain-response.test.mjs' }

  @{ id = 'gate4-drop-entry-level-whitelist'
     file = 'packages/contracts/validate-trust-domain-response.mjs'
     find = 'for (const key of Object.keys(entry)) if (!DOMAIN_ENTRY_KEYS.has(key)) throw new Error(`domains[${index}]: unknown property: ${key}`);'
     replace = ''
     test = 'tests/unit/contracts/validate-trust-domain-response.test.mjs' }

  @{ id = 'gate4-drop-duplicate-domain-check'
     file = 'packages/contracts/validate-trust-domain-response.mjs'
     find = 'if (seen.has(entry.domain)) throw new Error(`duplicate domain in response: ${entry.domain}`);'
     replace = ''
     test = 'tests/unit/contracts/validate-trust-domain-response.test.mjs' }

  @{ id = 'gate4-drop-nested-forbidden-name-scan'
     file = 'packages/contracts/validate-trust-domain-response.mjs'
     find = 'for (const key of Object.keys(entry)) if (FORBIDDEN_AGGREGATE_KEY.test(key)) throw new Error(`TRUST-NEG-03: forbidden cross-domain field: ${key}`);'
     replace = ''
     test = 'tests/unit/contracts/validate-trust-domain-response.test.mjs' }

  @{ id = 'gate5-drop-outputs-forbidden-name-check'
     file = 'packages/contracts/validate-method-contract.mjs'
     find = 'if (FORBIDDEN_AGGREGATE_KEY.test(key)) throw new Error(`ADR-0004: forbidden cross-domain field in outputs: ${key}`);'
     replace = ''
     test = 'tests/unit/contracts/validate-method-contract.test.mjs' }

  @{ id = 'gate5-revert-isPlainObject-to-permissive'
     file = 'packages/contracts/validate-method-contract.mjs'
     find = '&& (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);'
     replace = ';'
     test = 'tests/unit/contracts/validate-method-contract.test.mjs' }

  @{ id = 'gate5-drop-duplicate-domain-in-outputs-check'
     file = 'packages/contracts/validate-method-contract.mjs'
     find = "if (domains.length !== outputs.domains.length) throw new Error('outputs.domains must not repeat a domain');"
     replace = ''
     test = 'tests/unit/contracts/validate-method-contract.test.mjs' }

  @{ id = 'rollup-drop-zero-coverage-continue-guard'
     file = 'packages/intelligence/rollup-trust-domains.mjs'
     find = 'if (present.length === 0) continue;'
     replace = ''
     test = 'tests/unit/intelligence/rollup-trust-domains.test.mjs' }

  # The duplicate-dimension check itself moved to dimension-score.mjs in
  # the HCI_RISK_SPEC.md refactor (2026-09-06, extracted for a second
  # consumer) -- covered there by dimension-score-drop-duplicate-check
  # below. This entry now targets rollup-trust-domains.mjs's own remaining
  # logic (coverage derivation) instead of re-testing the moved check.
  @{ id = 'rollup-hardcode-full-coverage'
     file = 'packages/intelligence/rollup-trust-domains.mjs'
     find = "const coverage = present.length === assigned.length ? 'FULL' : 'PARTIAL';"
     replace = "const coverage = 'FULL';"
     test = 'tests/unit/intelligence/rollup-trust-domains.test.mjs' }

  @{ id = 'band-scale-force-round-up-tie-break'
     file = 'packages/intelligence/band-scale.mjs'
     find = 'return fractional > 0.5 ? Math.ceil(mean) : Math.floor(mean);'
     replace = 'return Math.ceil(mean);'
     test = 'tests/unit/intelligence/band-scale.test.mjs' }

  @{ id = 'combine-findings-drop-duplicate-method-check'
     file = 'packages/intelligence/combine-method-findings.mjs'
     find = 'if (seenMethods.has(finding.method_id)) throw new Error(`duplicate method_id in findings: ${finding.method_id}`);'
     replace = ''
     test = 'tests/unit/intelligence/combine-method-findings.test.mjs' }

  @{ id = 'combine-findings-lower-disagreement-threshold-to-zero'
     file = 'packages/intelligence/combine-method-findings.mjs'
     find = 'const DISAGREEMENT_SPREAD_THRESHOLD = 2;'
     replace = 'const DISAGREEMENT_SPREAD_THRESHOLD = 0;'
     test = 'tests/unit/intelligence/combine-method-findings.test.mjs' }

  @{ id = 'combine-findings-weaken-disagreement-boundary'
     file = 'packages/intelligence/combine-method-findings.mjs'
     find = 'const disagreement = spread >= DISAGREEMENT_SPREAD_THRESHOLD;'
     replace = 'const disagreement = spread > DISAGREEMENT_SPREAD_THRESHOLD;'
     test = 'tests/unit/intelligence/combine-method-findings.test.mjs' }

  @{ id = 'dimension-score-drop-duplicate-check'
     file = 'packages/intelligence/dimension-score.mjs'
     find = 'if (seen.has(entry.dimension)) throw new Error(`duplicate dimension in input: ${entry.dimension}`);'
     replace = ''
     test = 'tests/unit/intelligence/dimension-score.test.mjs' }

  @{ id = 'severity-floor-lower-threshold-to-low'
     file = 'packages/intelligence/detect-severity-floor.mjs'
     find = 'const SEVERITY_FLOOR_RANK = BAND_RANK.VERY_LOW;'
     replace = 'const SEVERITY_FLOOR_RANK = BAND_RANK.LOW;'
     test = 'tests/unit/intelligence/detect-severity-floor.test.mjs' }

  @{ id = 'severity-floor-include-self-as-sibling'
     file = 'packages/intelligence/detect-severity-floor.mjs'
     find = ".filter((other) => other !== dimension && DIMENSION_TO_DOMAIN[other] === domain)"
     replace = '.filter((other) => DIMENSION_TO_DOMAIN[other] === domain)'
     test = 'tests/unit/intelligence/detect-severity-floor.test.mjs' }
)

function New-MutationSandbox {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) "hci-node-mut-$([Guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  foreach ($dir in @('packages', 'tests', 'database', 'docs')) {
    $source = Join-Path $root $dir
    if (Test-Path -LiteralPath $source) {
      Copy-Item -Recurse -LiteralPath $source (Join-Path $tmp $dir)
    }
  }
  return $tmp
}

function Invoke-NodeMutation {
  param([Parameter(Mandatory)]$Mutation)

  $tmp = New-MutationSandbox
  $targetPath = Join-Path $tmp $Mutation.file
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $content = [IO.File]::ReadAllText($targetPath)
  if (-not $content.Contains($Mutation.find)) {
    Remove-Item -Recurse -Force -LiteralPath $tmp -ErrorAction SilentlyContinue
    throw "Mutation '$($Mutation.id)': find text not found in $($Mutation.file) -- fixture is stale, update it to match the current source"
  }
  $mutated = $content.Replace($Mutation.find, $Mutation.replace)
  [IO.File]::WriteAllText($targetPath, $mutated, $utf8NoBom)

  $testPath = Join-Path $tmp $Mutation.test
  node --test $testPath *> $null
  $exitCode = $LASTEXITCODE

  Remove-Item -Recurse -Force -LiteralPath $tmp -ErrorAction SilentlyContinue
  return $exitCode
}

# Baseline gate (critic review, 2026-09-06 M5): run every unique target test
# file once, unmutated, in the same kind of fresh sandbox the real
# mutations use. A non-zero exit here means the sandbox itself is
# incomplete (a missing directory, a stale path) -- not that any control is
# broken -- and every mutation sharing that test file would otherwise be
# misreported as "killed" for the wrong reason.
Write-Host 'Baseline check: every target test file must pass unmutated in a fresh sandbox...'
$uniqueTestFiles = $mutations.test | Select-Object -Unique
foreach ($testFile in $uniqueTestFiles) {
  $tmp = New-MutationSandbox
  node --test (Join-Path $tmp $testFile) *> $null
  $baselineExit = $LASTEXITCODE
  Remove-Item -Recurse -Force -LiteralPath $tmp -ErrorAction SilentlyContinue
  if ($baselineExit -ne 0) {
    throw "Baseline FAILED for $testFile in an unmutated sandbox (exit $baselineExit) -- the sandbox is missing something this test needs (check for a path outside packages/tests/database/docs), not a real mutation result."
  }
  Write-Host "  $testFile : baseline OK"
}

Write-Host 'Node-level gate mutation check (packages/contracts + packages/intelligence)...'
$results = @()
foreach ($mutation in $mutations) {
  $exitCode = Invoke-NodeMutation -Mutation $mutation
  $killed = $exitCode -ne 0
  $results += [PSCustomObject]@{ Id = $mutation.id; Killed = $killed }
  $status = if ($killed) { 'killed' } else { 'VACUOUS -- suite stayed green' }
  Write-Host "  $($mutation.id): $status"
}

$vacuous = $results | Where-Object { -not $_.Killed }
if ($vacuous.Count -gt 0) {
  Write-Host "$($vacuous.Count) vacuous mutation(s): $($vacuous.Id -join ', ')"
  throw "$($vacuous.Count) of $($results.Count) Node-gate mutations did not kill anything -- the corresponding check is not load-bearing."
}
Write-Host "All $($results.Count)/$($results.Count) Node-gate mutations killed."
