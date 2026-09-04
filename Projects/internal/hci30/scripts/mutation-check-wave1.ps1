[CmdletBinding()]
param()

# ============================================================================
# Wave 1 mutation check - proves the negative suite is not vacuous.
# ============================================================================
# A negative suite that always passes is worse than no suite: it reports a
# closed gate that was never verified. The original Wave 1 suite had exactly
# that defect - four assertions caught their own failure signal with the same
# handler that caught the control's rejection (both SQLSTATE P0001), so they
# could not fail.
#
# Fixing those four assertions is not enough on its own, because nothing would
# stop the next one from being written the same way. This script closes the
# class: it deliberately breaks each control in turn and requires the suite to
# go red, and to go red on the SPECIFIC assertions that cover that control.
#
# A mutation that does not produce its expected failures is a hard error here,
# whether that is because the assertion is vacuous, because it asserts the
# wrong thing, or because the control was never load-bearing to begin with.
#
# Synthetic-only, same isolation guarantees as test-wave1-local.ps1.
# ============================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$db = 'hci_wave1_synthetic'

$compose  = Join-Path $root 'infra/local/compose.test.yml'
$upMig    = Join-Path $root 'database/migrations/0001_wave1_synthetic_up.sql'
$downMig  = Join-Path $root 'database/migrations/0001_wave1_synthetic_down.sql'
$upMig2   = Join-Path $root 'database/migrations/0002_wave1_case_aggregate_up.sql'
$fixtures = Join-Path $root 'database/fixtures/0001_synthetic.sql'
$harness  = Join-Path $root 'database/tests/00_test_harness.sql'
$sqlTests = Join-Path $root 'database/tests/wave1-negative-tests.sql'

# Windows PowerShell 5.1 pipes native stdin as ASCII by default, which would
# silently replace any non-ASCII byte in a .sql file with '?' and still exit 0.
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$dockerEndpoint = docker context inspect --format '{{.Endpoints.docker.Host}}'
if ($LASTEXITCODE -ne 0 -or $dockerEndpoint -notmatch '^(npipe|unix)://') { throw "Refusing non-local Docker endpoint: $dockerEndpoint" }

# Each mutation names the assertions that MUST fail once the control is broken.
$mutations = @(
  @{ id = 'drop-authorization-trigger'
     sql = 'DROP TRIGGER research_workflows_require_active_authorization ON hci.research_workflows;'
     expect = @('CONSENT-NEG-04a','CONSENT-NEG-05e') }

  @{ id = 'drop-dsr-lifecycle-trigger'
     sql = 'DROP TRIGGER data_subject_requests_lifecycle ON hci.data_subject_requests;'
     expect = @('DSR-LIFECYCLE-01','DSR-LIFECYCLE-03','DSR-LIFECYCLE-06','DSR-IMMUTABLE-01','DSR-IMMUTABLE-02') }

  @{ id = 'regrant-append-only-writes'
     sql = 'GRANT UPDATE, DELETE ON hci.data_subject_request_events, hci.subject_records TO hci_app_test_a;'
     expect = @('APPEND-ONLY-GRANT-01','APPEND-ONLY-GRANT-02','APPEND-ONLY-GRANT-03','APPEND-ONLY-GRANT-04') }

  @{ id = 'drop-append-only-triggers'
     sql = 'DROP TRIGGER data_subject_request_events_append_only ON hci.data_subject_request_events; DROP TRIGGER subject_records_append_only ON hci.subject_records;'
     expect = @('APPEND-ONLY-TRIGGER-01','APPEND-ONLY-TRIGGER-02') }

  @{ id = 'drop-identity-evidence-gate'
     sql = 'DROP TRIGGER identity_candidates_require_evidence ON hci.identity_candidates;'
     expect = @('IDENTITY-NEG-01c','IDENTITY-NEG-05') }

  @{ id = 'drop-identity-evidence-protection'
     sql = 'DROP TRIGGER identity_verifications_protect_evidence ON hci.identity_verifications;'
     expect = @('IDENTITY-NEG-03','IDENTITY-NEG-04') }

  # Resolved from the catalog rather than hardcoded: PostgreSQL truncates
  # generated constraint names at 63 characters, and this one is longer.
  @{ id = 'drop-typed-target-fk'
     sql = 'DO $$ DECLARE c text; BEGIN SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.data_subject_request_targets''::regclass AND contype = ''f'' AND array_length(conkey,1) = 3; EXECUTE format(''ALTER TABLE hci.data_subject_request_targets DROP CONSTRAINT %I'', c); END $$;'
     expect = @('TARGET-KIND-01b','TRUNCATE-02-FK') }

  @{ id = 'disable-rls-on-persons'
     sql = 'ALTER TABLE hci.persons NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.persons DISABLE ROW LEVEL SECURITY;'
     expect = @('RLS-LEAK-01') }

  @{ id = 'allow-person-repoint-after-confirm'
     sql = 'CREATE OR REPLACE FUNCTION hci.require_identity_verification() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF NEW.match_state = ''MATCH_CONFIRMED'' AND NOT EXISTS (SELECT 1 FROM hci.identity_verifications v WHERE v.tenant_id = NEW.tenant_id AND v.candidate_id = NEW.id AND v.method IN (''DETERMINISTIC'',''HUMAN'') AND v.evidence_ref IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE = ''H1004'', MESSAGE = ''x''; END IF; RETURN NEW; END $fn$;'
     expect = @('IDENTITY-NEG-05') }

  @{ id = 'drop-truncate-guards'
     sql = 'DROP TRIGGER data_subject_request_events_no_truncate ON hci.data_subject_request_events; DROP TRIGGER subject_records_no_truncate ON hci.subject_records;'
     expect = @('TRUNCATE-01') }

  @{ id = 'regrant-created-at-column'
     sql = 'GRANT INSERT (created_at) ON hci.data_subject_request_events TO hci_app_test_a;'
     expect = @('CREATED-AT-01') }

  @{ id = 'drop-tenant-immutability'
     sql = 'DROP TRIGGER persons_tenant_immutable ON hci.persons;'
     expect = @('TENANT-IMMUTABLE-01') }

  @{ id = 'regrant-dsr-delete'
     sql = 'DROP TRIGGER data_subject_requests_no_delete ON hci.data_subject_requests; GRANT DELETE ON hci.data_subject_requests TO hci_app_test_a;'
     expect = @('DSR-NODELETE-01') }

  @{ id = 'allow-blank-evidence-ref'
     sql = 'DO $x$ DECLARE c text; BEGIN SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.identity_verifications''::regclass AND contype = ''c'' AND pg_get_constraintdef(oid) LIKE ''%evidence_ref%''; EXECUTE format(''ALTER TABLE hci.identity_verifications DROP CONSTRAINT %I'', c); END $x$;'
     expect = @('NONEMPTY-01') }

  @{ id = 'weaken-subject-type-check'
     sql = 'DO $$ DECLARE c text; BEGIN SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.subject_records''::regclass AND contype = ''c'' AND pg_get_constraintdef(oid) LIKE ''%subject_type%''; EXECUTE format(''ALTER TABLE hci.subject_records DROP CONSTRAINT %I'', c); END $$;'
     expect = @('SUBJECT-NEG-02') }

  # ADR-0020 (Case/Engagement aggregate, HD-10) gate 2's explicitly-required
  # mutation: dropping the whole lifecycle trigger removes both its INSERT
  # branch (2026-09-04: was CASE-LIFECYCLE-TRIGGER-01's own protection) and
  # its CLOSED-immutability branch (CASE-CLOSED-IMMUTABLE-01), in addition to
  # the original UPDATE-side FSM. Without the trigger at all, closed_at is
  # never auto-set, so CASE-LIFECYCLE-02's UPDATE now also fails the table's
  # own bidirectional CHECK ((status='CLOSED') = (closed_at IS NOT NULL)) -
  # the CHECK constraint independently backstops the missing trigger here,
  # which is why CASE-LIFECYCLE-02 (an expect_success) is in this mutation's
  # expected-failure list even though the trigger, not the CHECK, is what is
  # actually being removed. CASE-LIFECYCLE-01 is unaffected: OPEN->ACTIVE
  # never touches closed_at either way.
  @{ id = 'drop-case-lifecycle-trigger'
     sql = 'DROP TRIGGER cases_lifecycle ON hci.cases;'
     expect = @('CASE-LIFECYCLE-02','CASE-LIFECYCLE-02b','CASE-LIFECYCLE-03','CASE-LIFECYCLE-04','CASE-CLOSED-IMMUTABLE-01','CASE-LIFECYCLE-TRIGGER-01') }

  # Gate 2's "no direct UPDATE privilege on closed_at" is a grant-layer
  # control independent of the trigger above; this proves it is load-bearing
  # on its own, the same defense-in-depth reasoning already applied to
  # append-only tables elsewhere in this schema.
  @{ id = 'regrant-case-closed-at'
     sql = 'GRANT UPDATE (closed_at) ON hci.cases TO hci_app_test_a;'
     expect = @('CASE-CLOSEDAT-DIRECT-01') }

  # ADR-0020 gate 4's explicitly-required mutation, split in two (2026-09-04
  # critic review): the original single mutation dropped both triggers at
  # once, so dropping only the subject_records half was structurally
  # invisible to the suite - CASE-CLOSED-GUARD-01 alone was enough to kill it.
  @{ id = 'drop-case-closed-guard-workflows'
     sql = 'DROP TRIGGER research_workflows_require_open_or_active_case ON hci.research_workflows;'
     expect = @('CASE-CLOSED-GUARD-01') }
  @{ id = 'drop-case-closed-guard-subjects'
     sql = 'DROP TRIGGER subject_records_require_open_or_active_case ON hci.subject_records;'
     expect = @('CASE-CLOSED-GUARD-02') }

  # Gate 3's ownership-binding FK, resolved from the catalog like
  # 'drop-typed-target-fk' above: PostgreSQL truncates generated composite FK
  # names, so the constraint name is not a fixed literal.
  @{ id = 'drop-case-ownership-fk'
     sql = 'DO $$ DECLARE c text; BEGIN SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.research_workflows''::regclass AND contype = ''f'' AND confrelid = ''hci.cases''::regclass; EXECUTE format(''ALTER TABLE hci.research_workflows DROP CONSTRAINT %I'', c); END $$;'
     expect = @('CASE-OWNS-02') }

  # 2026-09-04 critic review (C1/C2/M1/M2/M5 fixes) - new invariants below.

  # 'status' was originally in the INSERT grant, letting the app role INSERT
  # directly into ACTIVE/CLOSED. Proves the withholding is load-bearing on
  # its own, same reasoning as regrant-created-at-column.
  @{ id = 'regrant-case-status'
     sql = 'GRANT INSERT (status) ON hci.cases TO hci_app_test_a;'
     expect = @('CASE-LIFECYCLE-05') }
  @{ id = 'regrant-case-opened-at'
     sql = 'GRANT INSERT (opened_at) ON hci.cases TO hci_app_test_a;'
     expect = @('CASE-OPENEDAT-01') }

  # case_id's immutability trigger (C2): without it, an already-bound
  # research_workflows row could be repointed onto a different case via a
  # plain UPDATE, including a CLOSED one, bypassing the terminal-state guard
  # entirely (the guard only ever fires BEFORE INSERT).
  @{ id = 'drop-case-ownership-immutable-trigger'
     sql = 'DROP TRIGGER research_workflows_case_immutable ON hci.research_workflows;'
     expect = @('CASE-OWNS-03') }

  # Only the CLOSED-immutability IF block is removed here (not the whole
  # trigger, which 'drop-case-lifecycle-trigger' above already covers) so this
  # mutation isolates that one invariant rather than reproducing a broader
  # mutation's failure set.
  @{ id = 'weaken-case-closed-immutable'
     sql = 'CREATE OR REPLACE FUNCTION hci.enforce_case_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF TG_OP = ''INSERT'' THEN IF NEW.status <> ''OPEN'' THEN RAISE EXCEPTION USING ERRCODE = ''H1010'', MESSAGE = ''x''; END IF; RETURN NEW; END IF; IF NEW.status IS DISTINCT FROM OLD.status THEN IF NOT ((OLD.status = ''OPEN'' AND NEW.status = ''ACTIVE'') OR (OLD.status = ''ACTIVE'' AND NEW.status = ''CLOSED'')) THEN RAISE EXCEPTION USING ERRCODE = ''H1010'', MESSAGE = ''x''; END IF; IF NEW.status = ''CLOSED'' THEN NEW.closed_at := now(); END IF; END IF; RETURN NEW; END $fn$;'
     expect = @('CASE-CLOSED-IMMUTABLE-01') }

  # M2: hci.cases originally had the grant layer only. These reuse
  # hci.reject_update_delete(), so a break-glass/table-owner session could
  # previously DELETE or TRUNCATE a case with no reaction at either layer.
  @{ id = 'drop-case-no-delete-trigger'
     sql = 'DROP TRIGGER cases_no_delete ON hci.cases;'
     expect = @('CASE-NODELETE-TRIGGER-01') }

  # M5: hci.cases had a tenant_isolation policy from creation, but nothing in
  # the suite would previously have gone red if it were dropped.
  @{ id = 'disable-rls-on-cases'
     sql = 'ALTER TABLE hci.cases NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.cases DISABLE ROW LEVEL SECURITY;'
     expect = @('RLS-LEAK-03') }
)

$project = "hcimut$PID"
$envFile = Join-Path ([IO.Path]::GetTempPath()) "$project.env"
$password = [Convert]::ToBase64String([Guid]::NewGuid().ToByteArray())
[IO.File]::WriteAllText($envFile, "HCI_WAVE1_DB_PASSWORD=$password`n", (New-Object System.Text.UTF8Encoding($false)))
$composeArgs = @('compose', '--project-name', $project, '--env-file', $envFile, '-f', $compose)

# These capture native stderr on purpose (psql is deliberately noisy here), so
# each one must locally relax $ErrorActionPreference. Under 'Stop', PowerShell
# turns any captured native stderr - including a harmless psql NOTICE - into a
# terminating NativeCommandError. Success is decided by $LASTEXITCODE, which is
# the only meaningful signal from a native command.
function Invoke-SqlFile {
  param([Parameter(Mandatory)][string]$Path)
  # Checked before EAP is relaxed. With EAP='Continue' a missing file makes
  # Get-Content non-terminating, psql then reads empty stdin and exits 0, and
  # a renamed test file would report a green baseline having run nothing.
  if (-not (Test-Path -LiteralPath $Path)) { throw "missing SQL file: $Path" }
  $ErrorActionPreference = 'Continue'
  Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | & docker @composeArgs exec -T db psql -q -v ON_ERROR_STOP=1 -U hci_owner -d $db 2>&1 | Out-Null
  return $LASTEXITCODE
}
function Invoke-Sql {
  param([Parameter(Mandatory)][string]$Sql)
  $ErrorActionPreference = 'Continue'
  & docker @composeArgs exec -T db psql -q -v ON_ERROR_STOP=1 -U hci_owner -d $db -c $Sql 2>&1 | Out-Null
  return $LASTEXITCODE
}
function Get-FailedAssertions {
  $ErrorActionPreference = 'Continue'
  $out = & docker @composeArgs exec -T db psql -tAq -U hci_owner -d $db -c "SELECT COALESCE(string_agg(test_id, ',' ORDER BY id), '') FROM hci_test.results WHERE outcome = 'FAIL'" 2>$null
  return ($out | Out-String).Trim()
}
function Reset-Schema {
  if ((Invoke-SqlFile -Path $downMig)  -ne 0) { throw 'mutation harness: down migration failed' }
  if ((Invoke-SqlFile -Path $upMig)    -ne 0) { throw 'mutation harness: 0001 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig2)   -ne 0) { throw 'mutation harness: 0002 up migration failed' }
  if ((Invoke-SqlFile -Path $fixtures) -ne 0) { throw 'mutation harness: fixtures failed' }
  if ((Invoke-SqlFile -Path $harness)  -ne 0) { throw 'mutation harness: harness failed' }
}

$problems = @()
try {
  & docker @composeArgs up -d --wait
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic PostgreSQL did not become healthy.' }

  # Control run: unmutated schema must be fully green. If this is red, every
  # mutation result below would be meaningless.
  Reset-Schema
  if ((Invoke-SqlFile -Path $sqlTests) -ne 0) {
    throw "baseline suite failed on an unmutated schema; failing assertions: $(Get-FailedAssertions)"
  }
  Write-Host 'baseline: suite green on unmutated schema'

  foreach ($m in $mutations) {
    Reset-Schema
    if ((Invoke-Sql -Sql $m.sql) -ne 0) { throw "mutation '$($m.id)' could not be applied; its SQL no longer matches the schema" }

    $exit = Invoke-SqlFile -Path $sqlTests
    $failed = Get-FailedAssertions
    $failedList = @($failed -split ',' | Where-Object { $_ -ne '' })

    if ($exit -eq 0) {
      $problems += "$($m.id): suite still PASSED with the control removed (assertions are vacuous)"
      Write-Host "  VACUOUS  $($m.id)"
      continue
    }
    # Set equality, not subset: a mutation that reddens half the suite would
    # otherwise count as killed, hiding which assertion actually constrains the
    # control from the collateral damage around it.
    $missing = @($m.expect | Where-Object { $failedList -notcontains $_ })
    $extra   = @($failedList | Where-Object { $m.expect -notcontains $_ })
    if ($missing.Count -gt 0 -or $extra.Count -gt 0) {
      $problems += "$($m.id): expected exactly [$($m.expect -join ', ')] to fail; missing=[$($missing -join ', ')] unexpected=[$($extra -join ', ')]"
      Write-Host "  WEAK     $($m.id) - missing: [$($missing -join ', ')] unexpected: [$($extra -join ', ')]"
    } else {
      Write-Host "  killed   $($m.id) -> $failed"
    }
  }
}
finally {
  & docker @composeArgs down --volumes --remove-orphans | Out-Null
  Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
}

if ($problems.Count -gt 0) {
  Write-Host ''
  $problems | ForEach-Object { Write-Host "MUTATION SURVIVED: $_" }
  throw "$($problems.Count) mutation(s) survived; the negative suite does not actually constrain the schema."
}
Write-Host ''
Write-Host "All $($mutations.Count) mutations killed. The Wave 1 negative suite is non-vacuous."
