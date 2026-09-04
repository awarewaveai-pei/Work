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
$upMig3   = Join-Path $root 'database/migrations/0003_wave1_regulatory_market_scope_up.sql'
$upMig4   = Join-Path $root 'database/migrations/0004_wave1_source_provenance_up.sql'
$upMig5   = Join-Path $root 'database/migrations/0005_wave1_bitemporal_history_up.sql'
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
     # REG-NEG-10b joined this mutation's expect list 2026-09-05: it expects
     # H1001 specifically (not merely "rejected"), and H1001 is this exact
     # trigger. Without it, 10b's insert reaches the tenant_id FK instead and
     # gets 23503 - still rejected, but not the SQLSTATE the assertion names,
     # so it (correctly) flips to FAIL under this mutation too.
     expect = @('CONSENT-NEG-04a','CONSENT-NEG-05e','REG-NEG-10b') }

  @{ id = 'drop-dsr-lifecycle-trigger'
     sql = 'DROP TRIGGER data_subject_requests_lifecycle ON hci.data_subject_requests;'
     expect = @('DSR-LIFECYCLE-01','DSR-LIFECYCLE-03','DSR-LIFECYCLE-06','DSR-IMMUTABLE-01','DSR-IMMUTABLE-02') }

  @{ id = 'regrant-append-only-writes'
     sql = 'GRANT UPDATE, DELETE ON hci.data_subject_request_events, hci.subject_records TO hci_app_test_a;'
     # BITEMP-IMMUTABLE-01 joined this mutation's expect list 2026-09-05 (ADR-
     # 0017 landing): it UPDATEs hci.subject_records too, so restoring the
     # table-level UPDATE grant lets it reach the still-present append-only
     # TRIGGER, which rejects with H1003 instead of the 42501 the assertion
     # names - still rejected, wrong code, correctly flips to FAIL here, same
     # reasoning already documented above for the original four.
     expect = @('APPEND-ONLY-GRANT-01','APPEND-ONLY-GRANT-02','APPEND-ONLY-GRANT-03','APPEND-ONLY-GRANT-04','BITEMP-IMMUTABLE-01') }

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
  #
  # TRUNCATE-02-FK dropped from this mutation's expect list 2026-09-05 (real
  # mutation-check run, not reasoning alone - it reported WEAK/missing when
  # 0004 added hci.source_relationships.claim_id, a SECOND FK into
  # subject_records). TRUNCATE hci.subject_records is blocked by "any FK
  # anywhere referencing this table exists", not by this specific one - with
  # two such FKs now, dropping only this one no longer changes that outcome.
  # TRUNCATE-02-FK's own coverage (that subject_records is FK-blocked at all,
  # not merely by this one specific FK) is instead exercised by
  # 'drop-all-subject-records-referencing-fks' below, which drops both
  # referencing FKs together.
  @{ id = 'drop-typed-target-fk'
     sql = 'DO $$ DECLARE c text; BEGIN SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.data_subject_request_targets''::regclass AND contype = ''f'' AND array_length(conkey,1) = 3; EXECUTE format(''ALTER TABLE hci.data_subject_request_targets DROP CONSTRAINT %I'', c); END $$;'
     expect = @('TARGET-KIND-01b') }

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

  # ADR-0012 (Regulatory market scope, HD-20) gate 1/2 - 2026-09-05. Only two
  # mutations, not the three the ADR's gate 4 originally asked for: there is
  # no H1012 trigger to drop (see 0003's "Gate 3 disposition" comment for why
  # it was never built), so only the two CHECK constraints are mutation-
  # covered here.
  # Constraint name hardcoded, not resolved via LIKE (2026-09-05 db-expert
  # review): the constraint is explicitly named in 0003_up.sql specifically so
  # this mutation - and any future one - has a stable target; a LIKE lookup
  # with a non-STRICT SELECT INTO would silently pick an arbitrary match (and
  # drop the wrong constraint) the moment a second CHECK mentioning
  # 'jurisdiction' is ever added to this table.
  @{ id = 'drop-jurisdiction-check'
     sql = 'ALTER TABLE hci.tenants DROP CONSTRAINT tenants_jurisdiction_denylist;'
     expect = @('REG-NEG-01','REG-NEG-02','REG-NEG-03','REG-NEG-10a','REG-NEG-11','REG-NEG-12') }
  @{ id = 'drop-purpose-allowlist-check'
     sql = 'ALTER TABLE hci.cases DROP CONSTRAINT cases_purpose_allowlist;'
     expect = @('REG-NEG-04','REG-NEG-05','REG-NEG-06','REG-NEG-07','REG-NEG-09') }

  # ADR-0001 gate 2 / ADR-0002 gate 1 (reused) / ADR-0005 gate 1 - 2026-09-05.
  # The exact mutation both ADRs name for this gate.
  @{ id = 'enable-dblink-extension'
     sql = 'CREATE EXTENSION dblink;'
     expect = @('ARCH-PEER-02') }

  # ADR-0002 gate 3. A role name matching the naming convention a future
  # cognitive-engineering-os integration would plausibly use. Cleaned up by
  # Reset-Schema (not here) since roles outlive DROP SCHEMA - see that
  # function's comment.
  @{ id = 'create-cognitive-named-role'
     sql = 'CREATE ROLE cognitive_os_reader NOLOGIN;'
     expect = @('ARCH-PEER-02b') }

  # ADR-0026 (Claim/Source tenant ownership, HD-16) - 2026-09-05.
  @{ id = 'disable-rls-on-sources'
     sql = 'ALTER TABLE hci.sources NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.sources DISABLE ROW LEVEL SECURITY;'
     expect = @('SOURCE-RLS-01') }
  @{ id = 'disable-rls-on-source-snapshots'
     sql = 'ALTER TABLE hci.source_snapshots NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.source_snapshots DISABLE ROW LEVEL SECURITY;'
     expect = @('SOURCE-RLS-01') }
  # Proves TRUNCATE-02-FK is still load-bearing now that two independent FKs
  # reference subject_records (data_subject_request_targets's typed FK, and
  # this migration's own source_relationships.claim_id) - dropping either
  # alone leaves the other still blocking TRUNCATE, so only dropping both
  # together can turn it red. See 'drop-typed-target-fk' above for the run
  # that found this coupling.
  @{ id = 'drop-all-subject-records-referencing-fks'
     sql = 'DO $$ DECLARE c text; BEGIN SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.data_subject_request_targets''::regclass AND contype = ''f'' AND array_length(conkey,1) = 3; EXECUTE format(''ALTER TABLE hci.data_subject_request_targets DROP CONSTRAINT %I'', c); SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.source_relationships''::regclass AND contype = ''f'' AND confrelid = ''hci.subject_records''::regclass; EXECUTE format(''ALTER TABLE hci.source_relationships DROP CONSTRAINT %I'', c); END $$;'
     expect = @('TARGET-KIND-01b','TRUNCATE-02-FK') }
  @{ id = 'drop-source-relationships-ownership-fk'
     sql = 'DO $$ DECLARE c text; BEGIN SELECT conname INTO STRICT c FROM pg_constraint WHERE conrelid = ''hci.source_relationships''::regclass AND contype = ''f'' AND confrelid = ''hci.sources''::regclass; EXECUTE format(''ALTER TABLE hci.source_relationships DROP CONSTRAINT %I'', c); END $$;'
     expect = @('RLS-CLAIM-01') }
  @{ id = 'regrant-source-provenance-writes'
     sql = 'GRANT UPDATE, DELETE ON hci.source_snapshots, hci.source_relationships TO hci_app_test_a;'
     expect = @('APPEND-ONLY-GRANT-05','APPEND-ONLY-GRANT-06','APPEND-ONLY-GRANT-07','APPEND-ONLY-GRANT-08') }
  @{ id = 'drop-source-provenance-triggers'
     sql = 'DROP TRIGGER source_snapshots_append_only ON hci.source_snapshots; DROP TRIGGER source_relationships_append_only ON hci.source_relationships;'
     expect = @('APPEND-ONLY-TRIGGER-03','APPEND-ONLY-TRIGGER-04') }
  # Only source_relationships' guard is provable by TRUNCATE: source_snapshots
  # is FK-referenced by source_relationships.source_snapshot_id, so
  # TRUNCATE-03-FK is already blocked by that FK regardless of whether
  # source_snapshots' own no_truncate trigger exists (the same reason
  # subject_records' no_truncate trigger has no dedicated mutation either -
  # TRUNCATE-02-FK is the FK layer, not the trigger layer, and TRUNCATE-01 is
  # what proves the trigger for the one table that has none referencing it).
  @{ id = 'drop-source-provenance-truncate-guards'
     sql = 'DROP TRIGGER source_relationships_no_truncate ON hci.source_relationships;'
     expect = @('TRUNCATE-04') }

  # ADR-0010 (Consent-class separation, HD-02) - 2026-09-05. Both tables use
  # 0001's declarative loop's generated policy name ('tenant_isolation'), same
  # as every other table in that loop.
  @{ id = 'disable-rls-on-subject-lawful-basis-records'
     sql = 'ALTER TABLE hci.subject_lawful_basis_records NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.subject_lawful_basis_records DISABLE ROW LEVEL SECURITY;'
     expect = @('CONSENT-RLS-01') }
  @{ id = 'disable-rls-on-source-terms-records'
     sql = 'ALTER TABLE hci.source_terms_records NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.source_terms_records DISABLE ROW LEVEL SECURITY;'
     expect = @('CONSENT-RLS-02') }

  # ADR-0017 (Bitemporal scope, HD-06) - 2026-09-05. Constraint names below
  # are explicit (0005 migration, post-db-expert-review) rather than resolved
  # via pg_constraint LIKE matching: subject_records_reason_paired and
  # _reason_nonblank both matched the original LIKE '%corrected_reason%'
  # pattern once the single reason-required CHECK split into two, which
  # would have made an INTO STRICT resolver error "more than one row" - named
  # constraints avoid that class of fragility outright.
  @{ id = 'drop-bitemporal-window-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_valid_window;'
     expect = @('BITEMP-WINDOW-01') }
  @{ id = 'drop-bitemporal-reason-paired-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_reason_paired;'
     expect = @('BITEMP-REASON-01') }
  @{ id = 'drop-bitemporal-reason-nonblank-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_reason_nonblank;'
     expect = @('BITEMP-REASON-02') }
  # Without the composite (tenant_id, supersedes_id) FK, the cross-tenant
  # INSERT no longer fails at 23503 - it reaches hci.mark_superseded(),
  # whose UPDATE ... WHERE tenant_id = <A> AND id = <tenant B's row> matches
  # zero rows (that exact combination never exists), so it raises H1008
  # instead. Still rejected, wrong code, correctly flips to FAIL.
  @{ id = 'drop-supersedes-tenant-fk'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_supersedes_fk;'
     expect = @('BITEMP-CROSSTENANT-01') }
  # Column-level, not table-level (critic review): 0005's INSERT grant on
  # subject_records withholds BOTH system_recorded_at and
  # system_superseded_at, but a single table-level regrant proved only the
  # first was load-bearing - the second could have been silently un-withheld
  # and no assertion would have caught it. Split into one mutation per
  # withheld column, matching this file's own established one-mutation-per-
  # withheld-column convention (regrant-created-at-column, regrant-case-
  # opened-at, etc.).
  @{ id = 'regrant-subject-records-recorded-at'
     sql = 'GRANT INSERT (system_recorded_at) ON hci.subject_records TO hci_app_test_a;'
     expect = @('BITEMP-CLOCK-01') }
  @{ id = 'regrant-subject-records-superseded-at'
     sql = 'GRANT INSERT (system_superseded_at) ON hci.subject_records TO hci_app_test_a;'
     expect = @('BITEMP-CLOCK-01b') }
  # ADR-0017 gate 3's explicitly-required mutation ("dropping mark_superseded
  # must turn BITEMP-ASOF-01 and BITEMP-SUPERSEDE-01 red"). Real-Docker run
  # additionally kills the decisions-side tests, since hci.mark_superseded()
  # is the one generic function driving both tables - broader than the ADR
  # text anticipated, not narrower, so nothing here weakens that requirement.
  # BITEMP-SUPERSEDE-02 (23505) and BITEMP-SUPERSEDE-SETUP-B (INSERT succeeds
  # regardless of whether the AFTER trigger later fires) are unaffected -
  # both are independent of this trigger, per the file's own comment there.
  @{ id = 'drop-mark-superseded-triggers'
     sql = 'DROP TRIGGER subject_records_mark_superseded ON hci.subject_records; DROP TRIGGER decisions_mark_superseded ON hci.decisions;'
     expect = @('BITEMP-SUPERSEDE-01','BITEMP-ASOF-01','BITEMP-DECISION-03','BITEMP-DECISION-04') }
  # Proves BITEMP-SUPERSEDE-02's real rejection path (subject_records_
  # supersedes_unique, gate 1's UNIQUE(tenant_id, supersedes_id)) is load-bearing, AND
  # that hci.mark_superseded()'s own H1008 "already superseded" check is not
  # dead code: without this UNIQUE constraint, the second supersession
  # attempt reaches the trigger and gets H1008 instead of 23505 - still
  # rejected, wrong code, correctly flips to FAIL. See the test's own comment
  # in wave1-negative-tests.sql for the real-Docker discovery this documents.
  @{ id = 'drop-supersedes-unique-constraint'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_supersedes_unique;'
     expect = @('BITEMP-SUPERSEDE-02') }

  # hci.decisions' own RLS/append-only/security_invoker coverage (db-expert
  # review, 2026-09-05): the BITEMP-DECISION-0x happy-path tests never
  # exercised any of these controls, so 118/118 stayed green under every one
  # of the six mutations below before this review pass added the tests they
  # kill.
  @{ id = 'regrant-decisions-writes'
     sql = 'GRANT UPDATE, DELETE ON hci.decisions TO hci_app_test_a;'
     expect = @('APPEND-ONLY-GRANT-09','APPEND-ONLY-GRANT-10') }
  @{ id = 'drop-decisions-append-only-trigger'
     sql = 'DROP TRIGGER decisions_append_only ON hci.decisions;'
     expect = @('APPEND-ONLY-TRIGGER-05') }
  @{ id = 'drop-decisions-no-truncate'
     sql = 'DROP TRIGGER decisions_no_truncate ON hci.decisions;'
     expect = @('TRUNCATE-05') }
  @{ id = 'regrant-decisions-recorded-at'
     sql = 'GRANT INSERT (system_recorded_at) ON hci.decisions TO hci_app_test_a;'
     expect = @('BITEMP-CLOCK-02') }
  @{ id = 'regrant-decisions-superseded-at'
     sql = 'GRANT INSERT (system_superseded_at) ON hci.decisions TO hci_app_test_a;'
     expect = @('BITEMP-CLOCK-02b') }
  # Kills both RLS-LEAK-04 (direct table read) and BITEMP-VIEWRLS-01's
  # decisions_current half: security_invoker on the view only matters if the
  # base table's own RLS is enabled to begin with.
  @{ id = 'disable-rls-on-decisions'
     sql = 'ALTER TABLE hci.decisions NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.decisions DISABLE ROW LEVEL SECURITY;'
     expect = @('RLS-LEAK-04','BITEMP-VIEWRLS-01') }
  # All four views, not just two (critic review): BITEMP-VIEWRLS-01 now
  # checks all four, so all four must be mutated together to prove none of
  # them is silently exempt from the "one code shape" assumption.
  @{ id = 'disable-security-invoker-views'
     sql = 'ALTER VIEW hci.evidence_current SET (security_invoker = false); ALTER VIEW hci.claims_current SET (security_invoker = false); ALTER VIEW hci.assessments_current SET (security_invoker = false); ALTER VIEW hci.decisions_current SET (security_invoker = false);'
     expect = @('BITEMP-VIEWRLS-01') }
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
  # Roles are cluster-wide and extensions are database-wide (not
  # schema-wide), so DROP SCHEMA (the down migration above) never removes
  # either - unlike every other mutation in this file, 'enable-dblink-
  # extension' and 'create-cognitive-named-role' create objects that would
  # otherwise persist into every mutation that runs after them in the same
  # container lifetime, corrupting their baselines. Found for real, not
  # reasoned about: the first run of this file after adding both mutations
  # reported 'enable-dblink-extension' killed correctly, then
  # 'create-cognitive-named-role' WEAK with ARCH-PEER-02 (not
  # ARCH-PEER-02b) as the unexpected failure - the still-installed dblink
  # extension from the PRIOR mutation, not the role this mutation actually
  # adds. Defensive cleanup here (not inside either mutation's own SQL, which
  # only runs once) keeps every Reset-Schema call - including the initial
  # baseline run - starting from a truly clean cluster regardless of
  # mutation order.
  if ((Invoke-Sql -Sql 'DROP ROLE IF EXISTS cognitive_os_reader;') -ne 0) { throw 'mutation harness: role cleanup failed' }
  if ((Invoke-Sql -Sql 'DROP EXTENSION IF EXISTS dblink;') -ne 0) { throw 'mutation harness: extension cleanup failed' }
  if ((Invoke-SqlFile -Path $upMig)    -ne 0) { throw 'mutation harness: 0001 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig2)   -ne 0) { throw 'mutation harness: 0002 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig3)   -ne 0) { throw 'mutation harness: 0003 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig4)   -ne 0) { throw 'mutation harness: 0004 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig5)   -ne 0) { throw 'mutation harness: 0005 up migration failed' }
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
