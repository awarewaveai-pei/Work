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
# packages/ and tests/ trees to a fresh temp directory, edits the target
# file's copy, and runs node --test against the copied test file.
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

  @{ id = 'rollup-drop-duplicate-dimension-check'
     file = 'packages/intelligence/rollup-trust-domains.mjs'
     find = 'if (seenDimensions.has(entry.dimension)) throw new Error(`duplicate dimension in input: ${entry.dimension}`);'
     replace = ''
     test = 'tests/unit/intelligence/rollup-trust-domains.test.mjs' }

  @{ id = 'rollup-force-round-up-tie-break'
     file = 'packages/intelligence/rollup-trust-domains.mjs'
     find = 'return fractional > 0.5 ? Math.ceil(mean) : Math.floor(mean);'
     replace = 'return Math.ceil(mean);'
     test = 'tests/unit/intelligence/rollup-trust-domains.test.mjs' }
)

function Invoke-NodeMutation {
  param([Parameter(Mandatory)]$Mutation)

  $tmp = Join-Path ([IO.Path]::GetTempPath()) "hci-node-mut-$([Guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  Copy-Item -Recurse -LiteralPath (Join-Path $root 'packages') (Join-Path $tmp 'packages')
  Copy-Item -Recurse -LiteralPath (Join-Path $root 'tests') (Join-Path $tmp 'tests')

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
