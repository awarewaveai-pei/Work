[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$db = 'hci_wave1_synthetic'

$compose   = Join-Path $root 'infra/local/compose.test.yml'
$upMig     = Join-Path $root 'database/migrations/0001_wave1_synthetic_up.sql'
$downMig   = Join-Path $root 'database/migrations/0001_wave1_synthetic_down.sql'
$upMig2    = Join-Path $root 'database/migrations/0002_wave1_case_aggregate_up.sql'
$upMig3    = Join-Path $root 'database/migrations/0003_wave1_regulatory_market_scope_up.sql'
$upMig4    = Join-Path $root 'database/migrations/0004_wave1_source_provenance_up.sql'
$upMig5    = Join-Path $root 'database/migrations/0005_wave1_bitemporal_history_up.sql'
$upMig6    = Join-Path $root 'database/migrations/0006_wave1_bitemporal_scope_fence_up.sql'
$upMig7    = Join-Path $root 'database/migrations/0007_wave1_crypto_shredding_up.sql'
$upMig8    = Join-Path $root 'database/migrations/0008_wave1_field_author_class_policy_up.sql'
$upMig9    = Join-Path $root 'database/migrations/0009_wave1_adr0019_hardening_up.sql'
$upMig10   = Join-Path $root 'database/migrations/0010_wave1_epistemic_label_up.sql'
$upMig11   = Join-Path $root 'database/migrations/0011_wave1_trust_domain_scope_up.sql'
$upMig12   = Join-Path $root 'database/migrations/0012_wave1_subject_record_payload_up.sql'
$upMig13   = Join-Path $root 'database/migrations/0013_wave1_key_issuance_up.sql'
$upMig14   = Join-Path $root 'database/migrations/0014_wave1_decision_recording_up.sql'
$upMig15   = Join-Path $root 'database/migrations/0015_wave1_case_reopen_up.sql'
$upMig16   = Join-Path $root 'database/migrations/0016_wave1_case_report_snapshots_up.sql'
$upMig17   = Join-Path $root 'database/migrations/0017_wave1_rule_engine_auto_promote_up.sql'
$upMig18   = Join-Path $root 'database/migrations/0018_wave1_evidence_hash_chain_up.sql'
$upMig19   = Join-Path $root 'database/migrations/0019_wave1_case_auto_promote_audit_up.sql'
$upMig20   = Join-Path $root 'database/migrations/0020_wave1_source_admission_state_up.sql'
$fixtures  = Join-Path $root 'database/fixtures/0001_synthetic.sql'
$harness   = Join-Path $root 'database/tests/00_test_harness.sql'
$sqlTests  = Join-Path $root 'database/tests/wave1-negative-tests.sql'

node --test (Join-Path $root 'tests/unit/contracts/validate-request.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Request-policy validator tests failed.' }

# ADR-0004 (all gates): TRUST_DOMAINS (packages/contracts/trust-domains.mjs)
# must stay verbatim-identical to migration 0011's domain CHECK constraint --
# a critic review found this drift was previously silent (added/removed/
# renamed a domain all left the suite green). Node-level, Docker-free.
node --test (Join-Path $root 'tests/unit/contracts/trust-domains.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Trust-domain enum drift check failed (ADR-0004, JS vs SQL).' }

# ADR-0004 gate 4 (TRUST-NEG-03): any Person-trust read response must be a
# domains: [] vector, never a bare top-level trust_score/overall_trust (or
# semantic equivalent). Node-level, Docker-free -- there is no real
# trust-read endpoint yet, though the roll-up formula that would feed one
# (P0-04, HCI_TRUST_DOMAIN_SPEC.md) has been specified since 2026-09-06
# (critic review, same day, which caught this comment stale the moment the
# formula shipped); this validator exists so the first real endpoint built
# cannot introduce the forbidden shape unnoticed.
node --test (Join-Path $root 'tests/unit/contracts/validate-trust-domain-response.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Trust-domain response validator tests failed (ADR-0004 gate 4).' }

# ADR-0004 gate 5 (METHOD-CONTRACT-NEG-01): a method whose outputs touch
# more than one Trust Domain must express decision_weight per-domain, not
# as a single scalar. Node-level, Docker-free.
node --test (Join-Path $root 'tests/unit/contracts/validate-method-contract.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Method-contract registry validator tests failed (ADR-0004 gate 5).' }

# P0-04 Trust-Domain roll-up formula (docs/intelligence/HCI_TRUST_DOMAIN_SPEC.md):
# the 14-dimension-to-7-domain partition and its aggregation function.
# Node-level, Docker-free.
node --test (Join-Path $root 'tests/unit/intelligence/assessment-dimensions.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Assessment-dimension partition test failed (P0-04 Trust-Domain spec).' }

node --test (Join-Path $root 'tests/unit/intelligence/rollup-trust-domains.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Trust-domain roll-up formula tests failed (P0-04 Trust-Domain spec).' }

node --test (Join-Path $root 'tests/unit/intelligence/band-scale.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Shared band-rank arithmetic tests failed (packages/intelligence/band-scale.mjs).' }

# HCI_CONFIDENCE_SPEC.md (partial): combining multiple methods' findings
# about one Assessment Dimension without silently averaging disagreement
# away. Node-level, Docker-free.
node --test (Join-Path $root 'tests/unit/intelligence/combine-method-findings.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Method-finding-to-dimension combination tests failed (HCI_CONFIDENCE_SPEC.md).' }

node --test (Join-Path $root 'tests/unit/intelligence/dimension-score.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Shared dimension-score validator tests failed (packages/intelligence/dimension-score.mjs).' }

# Shared evidence_refs validator (extracted from dimension-score.mjs and
# combine-method-findings.mjs, 2026-09-06 -- was missing from this runner
# entirely until this line, a real gap found while wiring in a later file).
node --test (Join-Path $root 'tests/unit/intelligence/evidence-refs.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Shared evidence_refs validator tests failed (packages/intelligence/evidence-refs.mjs).' }

# HCI_RISK_SPEC.md (partial): severity-floor detection -- a VERY_LOW
# dimension is surfaced as a parallel signal, never used to override a
# Trust Domain average. Node-level, Docker-free.
node --test (Join-Path $root 'tests/unit/intelligence/detect-severity-floor.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Severity-floor detection tests failed (HCI_RISK_SPEC.md).' }

# HCI_EVIDENCE_QUALITY_SPEC.md (partial): per-dimension evidence-quality
# classification by distinct evidence-ref count -- SINGLE_SOURCE vs
# MULTIPLE_SOURCES, never a corroboration claim this codebase cannot
# verify. Node-level, Docker-free.
node --test (Join-Path $root 'tests/unit/intelligence/classify-evidence-quality.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Evidence-quality classification tests failed (HCI_EVIDENCE_QUALITY_SPEC.md).' }

# 04_HCI30_PRODUCT_SPEC.md:138's blocking precondition (bias-check required
# before finalizing EXIT/PROCEED_WITH_CONTROLS at Stage 4+) -- NOT a P0-04
# spec and NOT HCI_PERMISSION_SPEC.md itself (see that file for why); a
# separate, already-fully-specified, previously-unimplemented gate.
node --test (Join-Path $root 'tests/unit/intelligence/bias-check-gate.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Bias-check blocking-gate tests failed (04_HCI30_PRODUCT_SPEC.md:138).' }

# HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 8: sink/hci-discovered
# write path (mocked query -- the real-Postgres proof is the dedicated
# tests/architecture/sink-hci-discovered-write-path.test.ps1). Node-level,
# Docker-free.
node --test (Join-Path $root 'tests/unit/public-intelligence/source-registry/sink-hci-discovered.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'sink/hci-discovered write-path tests failed (Task 8).' }

# HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Tasks 4/5/6/7: isolated
# fetch-runner (SSRF guard, DNS pinning, object storage, seed governance,
# content-isolation scan, job-processing state machine). Found orphaned from
# this runner entirely while wiring Task 8's own new test file in (critic
# review, 2026-09-17) -- same failure class this file's own
# evidence-refs.test.mjs comment above already flagged once, recurred here.
# Node-level, Docker-free (the real-Docker proof for this subsystem is the
# three tests/architecture/fetch-runner-*.test.ps1 files, not run from here
# since this script's own scope is otherwise Docker-free until the Postgres
# section below).
node --test (Join-Path $root 'tests/unit/fetch-runner/ssrf-guard.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'fetch-runner SSRF guard tests failed (Task 4).' }
node --test (Join-Path $root 'tests/unit/fetch-runner/pinned-http-client.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'fetch-runner pinned HTTP client tests failed (Task 4).' }
node --test (Join-Path $root 'tests/unit/fetch-runner/ssrf-payload-corpus.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'fetch-runner SSRF payload corpus tests failed (Task 4).' }
node --test (Join-Path $root 'tests/unit/fetch-runner/content-isolation/scan.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'fetch-runner content-isolation scan tests failed (Task 7).' }
node --test (Join-Path $root 'tests/unit/fetch-runner/retrieval/http-html-fetch.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'fetch-runner fetch+extract tests failed (Task 7).' }
node --test (Join-Path $root 'tests/unit/fetch-runner/server.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'fetch-runner job-processing state-machine tests failed (Task 6/7).' }

# ARCH-PEER-01 (ADR-0001 gate 1): source-tree boundary against AI LEGO
# Cognitive OS. Node-level, not SQL - runs regardless of whether Docker is
# available, same as the request-policy validator above.
node --test (Join-Path $root 'tests/architecture/peer-boundary.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Peer-boundary architecture test failed.' }

# WAVE1-EPISTEMIC-ANNOTATION-01 (ADR-0013 gate 5): every epistemic/risk
# classification column in a Wave 1 migration must cite ADR-0013 inline.
# Source-level, Docker-free, runs its own self-test first (see the script).
& (Join-Path $PSScriptRoot 'verify-epistemic-annotation.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Epistemic-annotation check (ADR-0013 gate 5) failed.' }

# ADR-0004 gate 1: no column matching overall_score|composite_trust|
# aggregate_trust|universal_trust|^trust_score$ may exist on a table with no
# domain column. Source-level, Docker-free, runs its own self-test first.
& (Join-Path $PSScriptRoot 'check-no-universal-trust-column.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Universal-trust-column check (ADR-0004 gate 1) failed.' }

# Windows PowerShell 5.1 pipes native stdin as ASCII by default, which would
# silently replace any non-ASCII byte in a .sql file with '?' and still exit 0.
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$dockerEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $dockerEndpoint -notmatch '^(npipe|unix)://') { throw "Refusing non-local Docker endpoint: $dockerEndpoint" }
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not available; PostgreSQL negative tests were not run.' }

$project = "hciwave1$PID"
$envFile = Join-Path ([IO.Path]::GetTempPath()) "$project.env"
$password = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
# Written as explicit BOM-less UTF-8 bytes rather than via -Encoding. The
# 'utf8NoBOM' enum value exists only in PowerShell 7+, so this script could not
# run under Windows PowerShell 5.1; and 5.1's -Encoding UTF8 emits a BOM, which
# Docker Compose would read as part of the first variable name. Writing the
# bytes directly removes the host-version dependency entirely.
[IO.File]::WriteAllText($envFile, "HCI_WAVE1_DB_PASSWORD=$password`n", (New-Object System.Text.UTF8Encoding($false)))
$composeArgs = @('compose', '--project-name', $project, '--env-file', $envFile, '-f', $compose)

# Every step must be able to fail the run on its own. Checking $LASTEXITCODE
# only after the final psql call lets an earlier failure either vanish or
# surface as a misleading error attributed to the wrong step.
function Invoke-SqlFile {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Label)
  Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | & docker @composeArgs exec -T db psql -v ON_ERROR_STOP=1 -U hci_owner -d $db
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (psql exit $LASTEXITCODE): $Path" }
  Write-Host "  ok: $Label"
}

try {
  & docker @composeArgs up -d --wait
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic PostgreSQL did not become healthy.' }

  Write-Host 'Applying schema and running the negative suite...'
  Invoke-SqlFile -Path $upMig    -Label 'migration 0001 up'
  Invoke-SqlFile -Path $upMig2   -Label 'migration 0002 up (case aggregate)'
  Invoke-SqlFile -Path $upMig3   -Label 'migration 0003 up (regulatory market scope)'
  Invoke-SqlFile -Path $upMig4   -Label 'migration 0004 up (source provenance)'
  Invoke-SqlFile -Path $upMig5   -Label 'migration 0005 up (bitemporal history)'
  Invoke-SqlFile -Path $upMig6   -Label 'migration 0006 up (bitemporal scope fence)'
  Invoke-SqlFile -Path $upMig7   -Label 'migration 0007 up (crypto shredding)'
  Invoke-SqlFile -Path $upMig8   -Label 'migration 0008 up (field author class policy)'
  Invoke-SqlFile -Path $upMig9   -Label 'migration 0009 up (ADR-0019 hardening)'
  Invoke-SqlFile -Path $upMig10  -Label 'migration 0010 up (epistemic label)'
  Invoke-SqlFile -Path $upMig11  -Label 'migration 0011 up (trust domain scope)'
  Invoke-SqlFile -Path $upMig12  -Label 'migration 0012 up (subject record payload)'
  Invoke-SqlFile -Path $upMig13  -Label 'migration 0013 up (key issuance)'
  Invoke-SqlFile -Path $upMig14  -Label 'migration 0014 up (decision recording)'
  Invoke-SqlFile -Path $upMig15  -Label 'migration 0015 up (case reopen)'
  Invoke-SqlFile -Path $upMig16  -Label 'migration 0016 up (case report snapshots)'
  Invoke-SqlFile -Path $upMig17  -Label 'migration 0017 up (rule engine auto-promote)'
  Invoke-SqlFile -Path $upMig18  -Label 'migration 0018 up (evidence hash chain)'
  Invoke-SqlFile -Path $upMig19  -Label 'migration 0019 up (case auto-promote audit)'
  Invoke-SqlFile -Path $upMig20  -Label 'migration 0020 up (source admission state)'
  Invoke-SqlFile -Path $fixtures -Label 'synthetic fixtures'
  Invoke-SqlFile -Path $harness  -Label 'test harness'
  Invoke-SqlFile -Path $sqlTests -Label 'negative test suite'

  # Reversibility is an acceptance criterion in docs/HCI30_DELIVERY_PLAN.md
  # Phase 0, so it is exercised rather than assumed. Tearing down a populated
  # schema is the case that actually catches dependency mistakes.
  #
  # A single 'down' (0001_wave1_synthetic_down.sql) is sufficient here even
  # though fifteen migrations are now applied: it DROPs the whole hci schema,
  # which removes everything 0002-0015 added along with everything 0001
  # added, since all fifteen live in the same schema. The rebuild afterwards
  # must therefore re-apply all fifteen up migrations, in order, to return to
  # the same state this test run started from. (0002_wave1_case_aggregate_down.sql,
  # 0003_wave1_regulatory_market_scope_down.sql,
  # 0004_wave1_source_provenance_down.sql,
  # 0005_wave1_bitemporal_history_down.sql,
  # 0006_wave1_bitemporal_scope_fence_down.sql,
  # 0007_wave1_crypto_shredding_down.sql,
  # 0008_wave1_field_author_class_policy_down.sql,
  # 0009_wave1_adr0019_hardening_down.sql,
  # 0010_wave1_epistemic_label_down.sql, and
  # 0011_wave1_trust_domain_scope_down.sql exist for the narrower,
  # not-exercised-here case of rolling back one migration alone against a
  # schema where the others stay applied.) 0012_wave1_subject_record_payload_down.sql,
  # 0013_wave1_key_issuance_down.sql, 0014_wave1_decision_recording_down.sql, and
  # 0015_wave1_case_reopen_down.sql are the same narrower case for migrations
  # 0012, 0013, 0014, and 0015. 0016_wave1_case_report_snapshots_down.sql and
  # 0017_wave1_rule_engine_auto_promote_down.sql are the same narrower case
  # for migrations 0016 and 0017. 0018_wave1_evidence_hash_chain_down.sql and
  # 0019_wave1_case_auto_promote_audit_down.sql are the same narrower case
  # for migrations 0018 and 0019. 0020_wave1_source_admission_state_down.sql
  # is the same narrower case for migration 0020.
  Write-Host 'Verifying the migration is reversible...'
  Invoke-SqlFile -Path $downMig -Label 'migration down (populated schema, drops 0001-0020 together)'
  Invoke-SqlFile -Path $upMig   -Label 'migration 0001 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig2  -Label 'migration 0002 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig3  -Label 'migration 0003 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig4  -Label 'migration 0004 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig5  -Label 'migration 0005 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig6  -Label 'migration 0006 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig7  -Label 'migration 0007 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig8  -Label 'migration 0008 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig9  -Label 'migration 0009 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig10 -Label 'migration 0010 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig11 -Label 'migration 0011 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig12 -Label 'migration 0012 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig13 -Label 'migration 0013 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig14 -Label 'migration 0014 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig15 -Label 'migration 0015 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig16 -Label 'migration 0016 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig17 -Label 'migration 0017 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig18 -Label 'migration 0018 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig19 -Label 'migration 0019 up (clean rebuild after down)'
  Invoke-SqlFile -Path $upMig20 -Label 'migration 0020 up (clean rebuild after down)'

  Write-Host 'HCI Wave 1 local suite PASSED.'
}
finally {
  & docker @composeArgs down --volumes --remove-orphans
  Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
}
