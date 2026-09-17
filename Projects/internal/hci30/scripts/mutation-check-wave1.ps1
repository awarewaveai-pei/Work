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
$upMig2   = Join-Path $root 'database/migrations/0002_wave1_case_aggregate_up.sql'
$upMig3   = Join-Path $root 'database/migrations/0003_wave1_regulatory_market_scope_up.sql'
$upMig4   = Join-Path $root 'database/migrations/0004_wave1_source_provenance_up.sql'
$upMig5   = Join-Path $root 'database/migrations/0005_wave1_bitemporal_history_up.sql'
$upMig6   = Join-Path $root 'database/migrations/0006_wave1_bitemporal_scope_fence_up.sql'
$upMig7   = Join-Path $root 'database/migrations/0007_wave1_crypto_shredding_up.sql'
$upMig8   = Join-Path $root 'database/migrations/0008_wave1_field_author_class_policy_up.sql'
$upMig9   = Join-Path $root 'database/migrations/0009_wave1_adr0019_hardening_up.sql'
$upMig10  = Join-Path $root 'database/migrations/0010_wave1_epistemic_label_up.sql'
$upMig11  = Join-Path $root 'database/migrations/0011_wave1_trust_domain_scope_up.sql'
$upMig12  = Join-Path $root 'database/migrations/0012_wave1_subject_record_payload_up.sql'
$upMig13  = Join-Path $root 'database/migrations/0013_wave1_key_issuance_up.sql'
$upMig14  = Join-Path $root 'database/migrations/0014_wave1_decision_recording_up.sql'
$upMig15  = Join-Path $root 'database/migrations/0015_wave1_case_reopen_up.sql'
$upMig16  = Join-Path $root 'database/migrations/0016_wave1_case_report_snapshots_up.sql'
$upMig17  = Join-Path $root 'database/migrations/0017_wave1_rule_engine_auto_promote_up.sql'
$upMig18  = Join-Path $root 'database/migrations/0018_wave1_evidence_hash_chain_up.sql'
$upMig19  = Join-Path $root 'database/migrations/0019_wave1_case_auto_promote_audit_up.sql'
$upMig20  = Join-Path $root 'database/migrations/0020_wave1_source_admission_state_up.sql'
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
     # CRYPTO-TOMBSTONE-01 (ADR-0018) joined 2026-09-05 for the identical
     # reason: it also UPDATEs subject_records.tombstoned_at as app role -
     # with UPDATE regranted, the shape check still rejects it (app role is
     # not a member of hci_owner), but now via H1003, not the 42501 named.
     expect = @('APPEND-ONLY-GRANT-01','APPEND-ONLY-GRANT-02','APPEND-ONLY-GRANT-03','APPEND-ONLY-GRANT-04','BITEMP-IMMUTABLE-01','CRYPTO-TOMBSTONE-01') }

  # CRYPTO-TOMBSTONE-SHAPE-01 (ADR-0018) joined 2026-09-05: with
  # subject_records_append_only gone entirely, its owner-run
  # tombstoned_at+case_id UPDATE has nothing left to reject it, and
  # unexpectedly succeeds - the same collateral-hit reasoning already
  # documented for BITEMP-IMMUTABLE-01/CRYPTO-TOMBSTONE-01 elsewhere in this
  # file, just via the missing trigger instead of a restored grant.
  @{ id = 'drop-append-only-triggers'
     sql = 'DROP TRIGGER data_subject_request_events_append_only ON hci.data_subject_request_events; DROP TRIGGER subject_records_append_only ON hci.subject_records;'
     expect = @('APPEND-ONLY-TRIGGER-01','APPEND-ONLY-TRIGGER-02','CRYPTO-TOMBSTONE-SHAPE-01') }

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
     # RLS-COMPLETENESS-01 joined every disable-rls-on-* mutation's expect
     # list 2026-09-06 (P0-09): it is a whole-schema catalog gate, so it
     # correctly fires alongside each table's own named RLS-LEAK-NN test,
     # not instead of it. Real-Docker run confirmed the exact addition per
     # mutation, not estimated.
     expect = @('RLS-LEAK-01','RLS-COMPLETENESS-01') }

  @{ id = 'allow-person-repoint-after-confirm'
     sql = 'CREATE OR REPLACE FUNCTION hci.require_identity_verification() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF NEW.match_state = ''MATCH_CONFIRMED'' AND NOT EXISTS (SELECT 1 FROM hci.identity_verifications v WHERE v.tenant_id = NEW.tenant_id AND v.candidate_id = NEW.id AND v.method IN (''DETERMINISTIC'',''HUMAN'') AND v.evidence_ref IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE = ''H1004'', MESSAGE = ''x''; END IF; RETURN NEW; END $fn$;'
     expect = @('IDENTITY-NEG-05')
     repin = @('hci.require_identity_verification()') }

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
  # 2026-09-10 (0015, case reopen): CASE-REOPEN-SETUP-03 sets -218 to CLOSED,
  # same closed_at-never-auto-set mechanism as CASE-LIFECYCLE-02 above (the
  # CHECK constraint backstops the missing trigger and rejects the row, which
  # rolls that statement back) -- real-Docker run corrected two assumptions
  # a purely theoretical trace got wrong: since SETUP-03 rolls back, -218
  # stays ACTIVE (from SETUP-02), so the repurposed CASE-LIFECYCLE-03
  # (UPDATE ... SET status='ACTIVE') is an ACTIVE->ACTIVE no-op that succeeds
  # trivially with no trigger needed at all, and CASE-REOPEN-CLOSEDAT-CLEARED-01
  # then reads a closed_at that was NULL all along (never actually closed) --
  # neither one fails here. SETUP-04 (ACTIVE->CLOSED, the real transition)
  # fails the same way SETUP-03 did, and CASE-REOPEN-SKIP-01 (expects H1010)
  # instead succeeds trivially with no trigger present at all to reject it.
  @{ id = 'drop-case-lifecycle-trigger'
     sql = 'DROP TRIGGER cases_lifecycle ON hci.cases;'
     # CASE-AUTO-PROMOTE-CLOSED-SETUP-02 joined 2026-09-11 (migration 0017):
     # without this trigger nothing ever sets closed_at, so the OPEN/ACTIVE
     # transition to CLOSED trips the table's own
     # `(status = 'CLOSED') = (closed_at IS NOT NULL)` CHECK instead --
     # found by this exact mutation run, not assumed in advance.
     expect = @('CASE-LIFECYCLE-02','CASE-LIFECYCLE-02b','CASE-LIFECYCLE-04','CASE-CLOSED-IMMUTABLE-01','CASE-LIFECYCLE-TRIGGER-01','CASE-REOPEN-SETUP-03','CASE-REOPEN-SETUP-04','CASE-REOPEN-SKIP-01','CASE-AUTO-PROMOTE-CLOSED-SETUP-02') }

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
  # mutation's failure set. Transition list updated for 0015 (CLOSED->ACTIVE
  # reopen) so this mutation stays isolated to the immutability guard alone --
  # otherwise, applying the pre-0015 transition list here would also
  # incidentally break CASE-LIFECYCLE-03/CASE-REOPEN-* (a second, unrelated
  # invariant this mutation was never meant to test).
  @{ id = 'weaken-case-closed-immutable'
     sql = 'CREATE OR REPLACE FUNCTION hci.enforce_case_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path = hci, pg_temp AS $fn$ BEGIN IF TG_OP = ''INSERT'' THEN IF NEW.status <> ''OPEN'' THEN RAISE EXCEPTION USING ERRCODE = ''H1010'', MESSAGE = ''x''; END IF; RETURN NEW; END IF; IF NEW.status IS DISTINCT FROM OLD.status THEN IF NOT ((OLD.status = ''OPEN'' AND NEW.status = ''ACTIVE'') OR (OLD.status = ''ACTIVE'' AND NEW.status = ''CLOSED'') OR (OLD.status = ''CLOSED'' AND NEW.status = ''ACTIVE'')) THEN RAISE EXCEPTION USING ERRCODE = ''H1010'', MESSAGE = ''x''; END IF; IF NEW.status = ''CLOSED'' THEN NEW.closed_at := now(); ELSIF OLD.status = ''CLOSED'' AND NEW.status = ''ACTIVE'' THEN NEW.closed_at := NULL; END IF; END IF; RETURN NEW; END $fn$;'
     expect = @('CASE-CLOSED-IMMUTABLE-01')
     repin = @('hci.enforce_case_lifecycle()') }

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
     # RLS-COMPLETENESS-01 joined 2026-09-06 (P0-09), see 'disable-rls-on-persons'.
     expect = @('RLS-LEAK-03','RLS-COMPLETENESS-01') }

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
  # CRYPTO-NOEXTERNAL-01 (ADR-0018) joined 2026-09-05: it also checks for
  # dblink specifically (broader list, plus a prosrc scan), so installing it
  # flips that assertion red too, alongside ARCH-PEER-02's own reason.
  @{ id = 'enable-dblink-extension'
     sql = 'CREATE EXTENSION dblink;'
     expect = @('ARCH-PEER-02','CRYPTO-NOEXTERNAL-01') }

  # ADR-0002 gate 3. A role name matching the naming convention a future
  # cognitive-engineering-os integration would plausibly use. Needs no
  # cleanup of its own: this engine wraps every mutation's application and
  # assertion run in one transaction that always ROLLBACKs (Test-Mutation),
  # and CREATE ROLE - a global, non-schema-scoped object that used to outlive
  # the old engine's per-mutation DROP SCHEMA reset - does not survive that
  # ROLLBACK either (real-Docker check, 2026-09-06).
  @{ id = 'create-cognitive-named-role'
     sql = 'CREATE ROLE cognitive_os_reader NOLOGIN;'
     expect = @('ARCH-PEER-02b') }

  # ADR-0026 (Claim/Source tenant ownership, HD-16) - 2026-09-05.
  @{ id = 'disable-rls-on-sources'
     sql = 'ALTER TABLE hci.sources NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.sources DISABLE ROW LEVEL SECURITY;'
     # RLS-COMPLETENESS-01 joined 2026-09-06 (P0-09), see 'disable-rls-on-persons'.
     # hci.upsert_discovered_source (migrations/0020) does NOT need adding
     # here (critic follow-up, 2026-09-17 corrected the original draft, which
     # took a caller-supplied p_tenant_id and relied on RLS alone): tenant
     # scoping is now enforced by sources_tenant_ref_unique's (tenant_id,
     # source_ref) columns plus hci.current_tenant_id()-derived tenant_id,
     # independent of RLS visibility - disabling RLS here does not change
     # that function's behavior, verified by real-Docker rerun after the fix.
     expect = @('SOURCE-RLS-01','RLS-COMPLETENESS-01') }
  @{ id = 'disable-rls-on-source-snapshots'
     sql = 'ALTER TABLE hci.source_snapshots NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.source_snapshots DISABLE ROW LEVEL SECURITY;'
     expect = @('SOURCE-RLS-01','RLS-COMPLETENESS-01') }
  # Proves TRUNCATE-02-FK is still load-bearing now that THREE independent
  # FKs reference subject_records (data_subject_request_targets's typed FK,
  # source_relationships.claim_id, and - since migration 0008 -
  # hci.decision_claims.claim_id) - dropping any subset alone leaves at
  # least one other still blocking TRUNCATE, so only dropping all three
  # together can turn it red. See 'drop-typed-target-fk' above for the run
  # that found the first coupling; 0008's real-Docker run found the third
  # (mutation-check-wave1.ps1 2026-09-05).
  @{ id = 'drop-all-subject-records-referencing-fks'
     sql = 'DO $$ DECLARE c text; BEGIN SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.data_subject_request_targets''::regclass AND contype = ''f'' AND array_length(conkey,1) = 3; EXECUTE format(''ALTER TABLE hci.data_subject_request_targets DROP CONSTRAINT %I'', c); SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.source_relationships''::regclass AND contype = ''f'' AND confrelid = ''hci.subject_records''::regclass; EXECUTE format(''ALTER TABLE hci.source_relationships DROP CONSTRAINT %I'', c); SELECT conname INTO c FROM pg_constraint WHERE conrelid = ''hci.decision_claims''::regclass AND contype = ''f'' AND confrelid = ''hci.subject_records''::regclass; EXECUTE format(''ALTER TABLE hci.decision_claims DROP CONSTRAINT %I'', c); END $$;'
     expect = @('TARGET-KIND-01b','TRUNCATE-02-FK','DECISION-CLAIMS-CROSSTENANT-01-FK','DECISION-CLAIMS-KIND-01-FK') }
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
     # RLS-COMPLETENESS-01 joined 2026-09-06 (P0-09), see 'disable-rls-on-persons'.
     expect = @('CONSENT-RLS-01','RLS-COMPLETENESS-01') }
  @{ id = 'disable-rls-on-source-terms-records'
     sql = 'ALTER TABLE hci.source_terms_records NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.source_terms_records DISABLE ROW LEVEL SECURITY;'
     # RLS-COMPLETENESS-01 joined 2026-09-06 (P0-09), see 'disable-rls-on-persons'.
     expect = @('CONSENT-RLS-02','RLS-COMPLETENESS-01') }

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
  # No dedicated mutation for decisions_no_truncate (real-Docker correction,
  # ADR-0019 landing): TRUNCATE-05-FK now expects 0A000 - hci.decision_claims
  # (migrations/0008) references hci.decisions, so PostgreSQL refuses the
  # TRUNCATE on the FK alone before this trigger is ever reached, the same
  # reason subject_records' own no_truncate trigger has no dedicated
  # mutation either (see TRUNCATE-02-FK's comment above). Dropping this
  # trigger now changes nothing TRUNCATE-05-FK can observe.
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
     # RLS-COMPLETENESS-01 joined 2026-09-06 (P0-09), see 'disable-rls-on-persons'.
     expect = @('RLS-LEAK-04','BITEMP-VIEWRLS-01','RLS-COMPLETENESS-01') }
  # All four views, not just two (critic review): BITEMP-VIEWRLS-01 now
  # checks all four, so all four must be mutated together to prove none of
  # them is silently exempt from the "one code shape" assumption.
  @{ id = 'disable-security-invoker-views'
     sql = 'ALTER VIEW hci.evidence_current SET (security_invoker = false); ALTER VIEW hci.claims_current SET (security_invoker = false); ALTER VIEW hci.assessments_current SET (security_invoker = false); ALTER VIEW hci.decisions_current SET (security_invoker = false);'
     expect = @('BITEMP-VIEWRLS-01') }

  # ADR-0017 gate 4 (Bitemporal scope fence, migration 0006) - 2026-09-05.
  # CREATEDAT-SCOPE-01/02 join this mutation's expect list (real run):
  # dropping the column outright makes their own INSERT/UPDATE statements
  # (which name created_at explicitly) fail with 42703 "column does not
  # exist" instead of the 42501 they assert - still rejected, wrong reason,
  # correctly flips to FAIL, same reasoning as every other collateral-hit
  # case already documented in this file.
  @{ id = 'drop-scope-fence-created-at'
     sql = 'ALTER TABLE hci.persons DROP COLUMN created_at;'
     expect = @('BITEMP-SCOPE-01','CREATEDAT-SCOPE-01','CREATEDAT-SCOPE-02') }
  # Proves the check's OTHER half - a bitemporal column populated outside
  # subject_records/decisions must also be caught, not just a missing
  # created_at.
  @{ id = 'add-stray-bitemporal-column'
     sql = 'ALTER TABLE hci.persons ADD COLUMN valid_from timestamptz;'
     expect = @('BITEMP-SCOPE-01') }
  @{ id = 'regrant-createdat-scope-insert'
     sql = 'GRANT INSERT ON hci.persons TO hci_app_test_a;'
     expect = @('CREATEDAT-SCOPE-01') }
  @{ id = 'regrant-createdat-scope-update'
     sql = 'GRANT UPDATE ON hci.persons TO hci_app_test_a;'
     expect = @('CREATEDAT-SCOPE-02') }

  # ADR-0018 (Crypto-shredding for erasure, HD-07) - 2026-09-05.
  @{ id = 'grant-key-table-select'
     sql = 'GRANT SELECT ON hci.data_encryption_keys TO hci_app_test_a;'
     # RLS-COMPLETENESS-01/02 both joined 2026-09-06 (P0-09): this table's own
     # zero-RLS design (migration 0007 gate 1) is deliberately safe only
     # because it also holds zero grants -- the moment this mutation grants
     # SELECT, the table becomes visible to hci_app_test_a's
     # information_schema.columns view with tenant_id present, zero RLS, and
     # zero policy, correctly tripping both completeness checks alongside
     # CRYPTO-KEYGRANT-01 rather than being masked by it. Real-Docker run
     # confirmed both, not estimated.
     expect = @('CRYPTO-KEYGRANT-01','RLS-COMPLETENESS-01','RLS-COMPLETENESS-02') }
  @{ id = 'drop-key-required-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_key_required_for_evidence_claim;'
     expect = @('CRYPTO-KEYREQ-01') }
  @{ id = 'drop-key-scope-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_key_scoped_to_evidence_claim;'
     expect = @('CRYPTO-SCOPE-01') }
  @{ id = 'drop-key-ref-tenant-fk'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_key_ref_fk;'
     expect = @('CRYPTO-CROSSTENANT-KEYREF-01') }
  # Removes only the tombstoned_at branch's "nothing else changed" clause -
  # the system_superseded_at branch (0005) and the reaudit_required branch
  # (0008) are reproduced verbatim so this mutation cannot be confused with,
  # or collaterally break, any bitemporal-history or reaudit-cascade
  # mutation/test. An earlier version of this literal predated 0008 and
  # silently dropped the reaudit_required branch entirely (rather than just
  # its own target clause), which turned NEG-HD08-02-ELEVATE/-FLAGGED/-02
  # red as an unrelated collateral hit - found by real-Docker run
  # (mutation-check-wave1.ps1 2026-09-05); fixed by keeping this mutation's
  # rewrite in sync with hci.reject_update_delete()'s actual current shape.
  @{ id = 'weaken-tombstone-shape-check'
     sql = 'CREATE OR REPLACE FUNCTION hci.reject_update_delete() RETURNS trigger LANGUAGE plpgsql AS $fn$ DECLARE o jsonb; n jsonb; BEGIN IF TG_OP = ''UPDATE'' THEN o := to_jsonb(OLD); n := to_jsonb(NEW); IF o ? ''system_superseded_at'' AND o->>''system_superseded_at'' IS NULL AND n->>''system_superseded_at'' IS NOT NULL AND (o - ''system_superseded_at'') = (n - ''system_superseded_at'') AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), ''MEMBER'') THEN RETURN NEW; END IF; IF o ? ''tombstoned_at'' AND o->>''tombstoned_at'' IS NULL AND n->>''tombstoned_at'' IS NOT NULL AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), ''MEMBER'') THEN RETURN NEW; END IF; IF o ? ''reaudit_required'' AND o->>''reaudit_required'' = ''false'' AND n->>''reaudit_required'' = ''true'' AND (o - ''reaudit_required'') = (n - ''reaudit_required'') AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), ''MEMBER'') THEN RETURN NEW; END IF; END IF; RAISE EXCEPTION USING ERRCODE = ''H1003'', MESSAGE = format(''%s.%s is append-only (%s rejected)'', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP); END $fn$;'
     expect = @('CRYPTO-TOMBSTONE-SHAPE-01')
     repin = @('hci.reject_update_delete()') }

  # ADR-0019 (Field/transition author-class policy, HD-08) - 2026-09-05.
  @{ id = 'drop-author-class-triggers'
     sql = 'DROP TRIGGER subject_records_author_class ON hci.subject_records; DROP TRIGGER decisions_author_class ON hci.decisions;'
     expect = @('AUTHORCLASS-NEG-01','AUTHORCLASS-NEG-02','AUTHORCLASS-NEG-03','AUTHORCLASS-NEG-04') }
  # Keeps the reaudit_required defaulting half of the trigger body intact,
  # INCLUDING the supersede-inheritance branch added by the C2 fix below
  # (dropping the WHOLE trigger would make every CLAIM insert in the suite,
  # including fixtures, violate subject_records_reaudit_required_default;
  # dropping only the inheritance branch, not this mutation's target, would
  # collaterally break NEG-HD08-05 - real-Docker run found this, 2026-09-05) -
  # removes only the ASSESSMENT_CANDIDATE/human_spotcheck_status gate itself.
  # Real-Docker correction (migration 0010): this literal must mirror the
  # function's CURRENT full body, now including 0010's epistemic default/
  # inherit/redline - the pre-0010 version of this literal silently dropped
  # epistemic defaulting entirely and collaterally broke ~18 unrelated
  # CLAIM-insert tests across the suite (2026-09-05).
  @{ id = 'weaken-claim-state-admission-gate'
     sql = 'CREATE OR REPLACE FUNCTION hci.enforce_claim_state_admission() RETURNS trigger LANGUAGE plpgsql SET search_path = hci, pg_temp AS $fn$ DECLARE v_predecessor_reaudit boolean; v_predecessor_label text; v_predecessor_verifier uuid; BEGIN IF NEW.kind = ''CLAIM'' AND NEW.supersedes_id IS NOT NULL THEN SELECT reaudit_required, epistemic_label, epistemic_verifier_principal_id INTO v_predecessor_reaudit, v_predecessor_label, v_predecessor_verifier FROM hci.subject_records WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_id; END IF; IF NEW.kind = ''CLAIM'' AND NEW.reaudit_required IS NULL THEN NEW.reaudit_required := COALESCE(v_predecessor_reaudit, false); END IF; IF NEW.kind = ''CLAIM'' AND NEW.epistemic_label IS NULL THEN NEW.epistemic_label := COALESCE(v_predecessor_label, ''UNKNOWN''); IF NEW.epistemic_verifier_principal_id IS NULL THEN NEW.epistemic_verifier_principal_id := v_predecessor_verifier; END IF; END IF; IF NEW.kind = ''CLAIM'' AND NEW.epistemic_label = ''SOURCE_FACT'' AND v_predecessor_label IN (''UNKNOWN'',''HYPOTHESIS'') AND NEW.epistemic_verifier_principal_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = ''H1019'', MESSAGE = ''x''; END IF; RETURN NEW; END $fn$;'
     expect = @('NEG-HD08-01')
     repin = @('hci.enforce_claim_state_admission()') }
  # Dropping the WHOLE cascade trigger also breaks every downstream
  # assertion that depends on it having actually flagged a claim earlier in
  # the run: NEG-HD08-05 (supersession-inheritance test, reads '...916''s
  # flag set by NEG-HD08-02-ELEVATE) and NEG-HD08-07 (link-then-elevate
  # test, whose own elevation UPDATE is this same trigger's own H1017 path) -
  # both legitimate collateral hits of one trigger removal, not separate
  # controls (real-Docker run found this, 2026-09-05).
  @{ id = 'drop-risk-elevation-cascade-trigger'
     sql = 'DROP TRIGGER cases_flag_claims_on_risk_elevation ON hci.cases;'
     expect = @('NEG-HD08-02-FLAGGED','NEG-HD08-02','NEG-HD08-05','NEG-HD08-07') }
  # Dropping the WHOLE link gate trigger also removes the H1016
  # claim_state/human_spotcheck_status check it now carries (C1 fix), so
  # NEG-HD08-06 collaterally succeeds instead of raising H1016 - real-Docker
  # run found this, 2026-09-05.
  # With the gate trigger gone, the two claim-side '-GATE' tests (migration
  # 0009's M8 pair) fall through to the composite FK and get 23503 instead
  # of the H1016 they assert - the FK layer catching what the gate layer
  # used to, which is exactly the defense-in-depth split they document.
  @{ id = 'drop-decision-reaudit-gate-trigger'
     sql = 'DROP TRIGGER decision_claims_reaudit_gate ON hci.decision_claims;'
     expect = @('NEG-HD08-02','NEG-HD08-06','DECISION-CLAIMS-CROSSTENANT-01-GATE','DECISION-CLAIMS-KIND-01-GATE') }
  @{ id = 'disable-rls-on-principals'
     sql = 'ALTER TABLE hci.principals NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.principals DISABLE ROW LEVEL SECURITY;'
     # RLS-COMPLETENESS-01 joined 2026-09-06 (P0-09), see 'disable-rls-on-persons'.
     expect = @('RLS-LEAK-05','RLS-COMPLETENESS-01') }
  @{ id = 'drop-principals-tenant-immutable-trigger'
     sql = 'DROP TRIGGER principals_tenant_immutable ON hci.principals;'
     expect = @('TENANT-IMMUTABLE-02') }
  @{ id = 'regrant-principals-tenant-id-update'
     sql = 'GRANT UPDATE (tenant_id) ON hci.principals TO hci_app_test_a;'
     expect = @('PRINCIPAL-SCOPE-01') }
  @{ id = 'regrant-decision-claims-writes'
     sql = 'GRANT UPDATE, DELETE ON hci.decision_claims TO hci_app_test_a;'
     expect = @('APPEND-ONLY-GRANT-11','APPEND-ONLY-GRANT-12') }
  @{ id = 'drop-decision-claims-append-only-trigger'
     sql = 'DROP TRIGGER decision_claims_append_only ON hci.decision_claims;'
     expect = @('APPEND-ONLY-TRIGGER-06','APPEND-ONLY-TRIGGER-07') }
  @{ id = 'drop-decision-claims-truncate-guard'
     sql = 'DROP TRIGGER decision_claims_no_truncate ON hci.decision_claims;'
     expect = @('TRUNCATE-06') }
  @{ id = 'disable-rls-on-decision-claims'
     sql = 'ALTER TABLE hci.decision_claims NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.decision_claims DISABLE ROW LEVEL SECURITY;'
     # RLS-COMPLETENESS-01 joined 2026-09-06 (P0-09), see 'disable-rls-on-persons'.
     expect = @('RLS-LEAK-06','RLS-COMPLETENESS-01') }

  # hci.case_report_snapshots (migrations/0016, operator-requested "產生信任
  # 評估報告") -- structural posture copied byte-for-byte from decision_claims
  # above, so this table gets the identical 4-mutation set, not a subset.
  @{ id = 'regrant-report-snapshots-writes'
     sql = 'GRANT UPDATE, DELETE ON hci.case_report_snapshots TO hci_app_test_a;'
     expect = @('APPEND-ONLY-GRANT-13','APPEND-ONLY-GRANT-14') }
  @{ id = 'drop-report-snapshots-append-only-trigger'
     sql = 'DROP TRIGGER case_report_snapshots_append_only ON hci.case_report_snapshots;'
     expect = @('APPEND-ONLY-TRIGGER-08','APPEND-ONLY-TRIGGER-09') }
  @{ id = 'drop-report-snapshots-truncate-guard'
     sql = 'DROP TRIGGER case_report_snapshots_no_truncate ON hci.case_report_snapshots;'
     expect = @('TRUNCATE-07') }
  @{ id = 'disable-rls-on-report-snapshots'
     sql = 'ALTER TABLE hci.case_report_snapshots NO FORCE ROW LEVEL SECURITY; ALTER TABLE hci.case_report_snapshots DISABLE ROW LEVEL SECURITY;'
     expect = @('RLS-LEAK-07','RLS-COMPLETENESS-01') }

  # hci.cases.auto_promote_rule_findings (migrations/0017) -- a plain
  # updatable column, no trigger/RLS control of its own beyond the grant
  # itself, so the grant is the only real thing to mutate.
  # Real-Docker correction (2026-09-12, adding hci.set_case_auto_promote_
  # rule_findings() for C5's atomicity fix): the function is SECURITY
  # INVOKER, so its internal UPDATE runs under the CALLING role's own
  # grants -- revoking this column's UPDATE grant breaks the function's
  # UPDATE exactly like it breaks the two direct-UPDATE tests, cascading
  # into every FN-AUTOPROMOTE-* test that depends on the function actually
  # being able to change the value (NOOP-01/NOOP-NOAUDIT-01 assert on state
  # CHANGE-01 was supposed to set up).
  @{ id = 'revoke-case-auto-promote-grant'
     sql = 'REVOKE UPDATE (auto_promote_rule_findings) ON hci.cases FROM hci_app_test_a, hci_app_test_b;'
     expect = @('CASE-AUTO-PROMOTE-UPDATE-01','CASE-AUTO-PROMOTE-CLOSED-01','FN-AUTOPROMOTE-CHANGE-01','FN-AUTOPROMOTE-CHANGE-AUDIT-01','FN-AUTOPROMOTE-NOOP-01','FN-AUTOPROMOTE-NOOP-NOAUDIT-01') }

  # db-expert review (2026-09-05) findings C1/C2/C3/M2 - each mutation below
  # is a surgical CREATE OR REPLACE reproducing the current real function
  # minus only the one behaviour it targets, matching this file's own
  # established discipline (see 'weaken-tombstone-shape-check' above) rather
  # than dropping the whole trigger and risking unrelated collateral hits.
  # Real-Docker correction (migration 0010): re-includes epistemic default/
  # inherit/redline unchanged, so only the reaudit-inheritance behaviour
  # this mutation targets is removed (the pre-0010 literal dropped
  # epistemic defaulting entirely and collaterally broke ~18 tests,
  # 2026-09-05).
  @{ id = 'remove-supersede-reaudit-inheritance'
     sql = 'CREATE OR REPLACE FUNCTION hci.enforce_claim_state_admission() RETURNS trigger LANGUAGE plpgsql SET search_path = hci, pg_temp AS $fn$ DECLARE v_predecessor_label text; v_predecessor_verifier uuid; BEGIN IF NEW.kind = ''CLAIM'' AND NEW.supersedes_id IS NOT NULL THEN SELECT epistemic_label, epistemic_verifier_principal_id INTO v_predecessor_label, v_predecessor_verifier FROM hci.subject_records WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_id; END IF; IF NEW.kind = ''CLAIM'' AND NEW.reaudit_required IS NULL THEN NEW.reaudit_required := false; END IF; IF NEW.kind = ''CLAIM'' AND NEW.epistemic_label IS NULL THEN NEW.epistemic_label := COALESCE(v_predecessor_label, ''UNKNOWN''); IF NEW.epistemic_verifier_principal_id IS NULL THEN NEW.epistemic_verifier_principal_id := v_predecessor_verifier; END IF; END IF; IF NEW.kind = ''CLAIM'' AND NEW.epistemic_label = ''SOURCE_FACT'' AND v_predecessor_label IN (''UNKNOWN'',''HYPOTHESIS'') AND NEW.epistemic_verifier_principal_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = ''H1019'', MESSAGE = ''x''; END IF; IF NEW.kind = ''CLAIM'' AND NEW.claim_state = ''ASSESSMENT_CANDIDATE'' AND NEW.human_spotcheck_status IS DISTINCT FROM ''APPROVED'' THEN RAISE EXCEPTION USING ERRCODE = ''H1014'', MESSAGE = ''x''; END IF; RETURN NEW; END $fn$;'
     expect = @('NEG-HD08-05')
     repin = @('hci.enforce_claim_state_admission()') }
  # CREATE OR REPLACE FUNCTION does not carry forward attributes omitted from
  # the new definition - LANGUAGE plpgsql SECURITY DEFINER SET search_path
  # must be repeated here, or this mutation would ALSO silently revert to
  # SECURITY INVOKER and collaterally break DECISION-CLAIMS-INSERT-01 (the
  # app-role FOR SHARE privilege regression this file's own header comment
  # on the real function documents finding, 2026-09-05).
  @{ id = 'weaken-decision-reaudit-gate-claimstate-check'
     sql = 'CREATE OR REPLACE FUNCTION hci.enforce_decision_reaudit_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = hci, pg_temp AS $fn$ DECLARE v_outcome text; v_reaudit boolean; BEGIN SELECT outcome INTO v_outcome FROM hci.decisions WHERE tenant_id = NEW.tenant_id AND id = NEW.decision_id; SELECT reaudit_required INTO v_reaudit FROM hci.subject_records WHERE tenant_id = NEW.tenant_id AND id = NEW.claim_id FOR SHARE; IF v_outcome IN (''PROCEED'',''PROCEED_WITH_CONTROLS'',''EXIT'') AND v_reaudit IS TRUE THEN RAISE EXCEPTION USING ERRCODE = ''H1015'', MESSAGE = ''cannot link a reaudit-required Claim to a PROCEED/PROCEED_WITH_CONTROLS/EXIT decision''; END IF; RETURN NEW; END $fn$;'
     expect = @('NEG-HD08-06','DECISION-CLAIMS-CROSSTENANT-01-GATE','DECISION-CLAIMS-KIND-01-GATE')
     repin = @('hci.enforce_decision_reaudit_gate()') }
  # Regression guard for the exact bug found while fixing C3 (2026-09-05):
  # reverting this function to SECURITY INVOKER (the default CREATE OR
  # REPLACE falls back to when the clause is omitted) makes its FOR SHARE
  # lock require UPDATE privilege the application role does not have, so
  # every app-role link attempt 42501s instead of succeeding.
  @{ id = 'regress-decision-reaudit-gate-to-invoker'
     sql = 'CREATE OR REPLACE FUNCTION hci.enforce_decision_reaudit_gate() RETURNS trigger LANGUAGE plpgsql AS $fn$ DECLARE v_outcome text; v_reaudit boolean; v_claim_state text; v_spotcheck text; BEGIN SELECT outcome INTO v_outcome FROM hci.decisions WHERE tenant_id = NEW.tenant_id AND id = NEW.decision_id; SELECT reaudit_required, claim_state, human_spotcheck_status INTO v_reaudit, v_claim_state, v_spotcheck FROM hci.subject_records WHERE tenant_id = NEW.tenant_id AND id = NEW.claim_id FOR SHARE; IF v_claim_state IS DISTINCT FROM ''ASSESSMENT_CANDIDATE'' OR v_spotcheck IS DISTINCT FROM ''APPROVED'' THEN RAISE EXCEPTION USING ERRCODE = ''H1016'', MESSAGE = ''x''; END IF; IF v_outcome IN (''PROCEED'',''PROCEED_WITH_CONTROLS'',''EXIT'') AND v_reaudit IS TRUE THEN RAISE EXCEPTION USING ERRCODE = ''H1015'', MESSAGE = ''x''; END IF; RETURN NEW; END $fn$;'
     expect = @('DECISION-CLAIMS-INSERT-01','DECISION-CLAIMS-CROSSTENANT-01-GATE','DECISION-CLAIMS-KIND-01-GATE','DECISION-CLAIMS-CROSSTENANT-02')
     repin = @('hci.enforce_decision_reaudit_gate()') }
  @{ id = 'remove-elevation-conflict-check'
     sql = 'CREATE OR REPLACE FUNCTION hci.flag_claims_on_risk_elevation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = hci, pg_temp AS $fn$ DECLARE v_old_rank int; v_new_rank int; BEGIN v_old_rank := array_position(ARRAY[''R0'',''R1'',''R2'',''R3'',''R4''], OLD.risk_tier); v_new_rank := array_position(ARRAY[''R0'',''R1'',''R2'',''R3'',''R4''], NEW.risk_tier); IF v_old_rank IS NULL OR v_new_rank IS NULL THEN RAISE EXCEPTION USING ERRCODE = ''H1018'', MESSAGE = format(''unrecognized risk_tier in elevation rank comparison (old=%s, new=%s)'', OLD.risk_tier, NEW.risk_tier); END IF; IF v_new_rank > v_old_rank THEN UPDATE hci.subject_records SET reaudit_required = true WHERE tenant_id = NEW.tenant_id AND case_id = NEW.id AND kind = ''CLAIM'' AND reaudit_required = false AND system_superseded_at IS NULL AND tombstoned_at IS NULL; END IF; RETURN NEW; END $fn$;'
     expect = @('NEG-HD08-07')
     repin = @('hci.flag_claims_on_risk_elevation()') }
  @{ id = 'regrant-decision-claims-createdat'
     sql = 'GRANT INSERT (created_at) ON hci.decision_claims TO hci_app_test_a;'
     expect = @('DECISION-CLAIMS-CREATEDAT-01') }

  # ADR-0019 hardening, migration 0009 (M4/M7/M8 closures) - 2026-09-05.
  @{ id = 'drop-spotcheck-principal-required-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_spotcheck_principal_required;'
     expect = @('SPOTCHECK-PRINCIPAL-REQUIRED-01') }
  @{ id = 'drop-spotcheck-principal-scope-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_spotcheck_principal_scoped;'
     expect = @('SPOTCHECK-PRINCIPAL-SCOPE-01') }
  @{ id = 'drop-spotcheck-principal-fk'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_spotcheck_principal_fk;'
     expect = @('SPOTCHECK-PRINCIPAL-CROSSTENANT-01') }
  # Composite -> single-column: the tenant half is what the composite shape
  # exists for. NO ACTION is unchanged, so PRINCIPAL-DELETE-RI-01 keeps
  # passing here - only the cross-tenant proof goes red (the RI barrier is
  # proven separately by 'drop-all-principals-referencing-fks' below).
  @{ id = 'weaken-decisions-principal-fk'
     sql = 'ALTER TABLE hci.decisions DROP CONSTRAINT decisions_principal_fk, ADD CONSTRAINT decisions_principal_fk_weak FOREIGN KEY (principal_id) REFERENCES hci.principals (id);'
     expect = @('DECISION-PRINCIPAL-CROSSTENANT-01') }
  # Removing the FKs entirely also removes the RI barrier that blocks
  # deleting a still-referenced principal. Since 0009 TWO independent FKs
  # reference hci.principals (decisions_principal_fk and
  # subject_records_spotcheck_principal_fk), so - exactly like
  # 'drop-all-subject-records-referencing-fks' above - dropping either alone
  # leaves the other still blocking the DELETE, and only dropping both can
  # turn PRINCIPAL-DELETE-RI-01 red (real-Docker run found the coupling,
  # 2026-09-05). Both cross-tenant proofs go red with it - three controls
  # behind two constraints.
  @{ id = 'drop-all-principals-referencing-fks'
     sql = 'ALTER TABLE hci.decisions DROP CONSTRAINT decisions_principal_fk; ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_spotcheck_principal_fk;'
     expect = @('DECISION-PRINCIPAL-CROSSTENANT-01','SPOTCHECK-PRINCIPAL-CROSSTENANT-01','PRINCIPAL-DELETE-RI-01') }
  # decision_claims' two FKs are declared inline (unnamed) in 0008, so they
  # are located via pg_constraint by referenced table, the same way
  # 'drop-typed-target-fk' does. A single-column replacement strips BOTH
  # the tenant half and the claim_kind pin at once, so both tests go red.
  # Only the owner-run '-FK' pair (trigger stripped) can go red here: the
  # app-role '-GATE' pair is rejected by enforce_decision_reaudit_gate()
  # before the FK is ever evaluated, so weakening the FK alone cannot
  # change what they observe (real-Docker correction, 2026-09-05).
  @{ id = 'weaken-decision-claims-claim-fk'
     sql = 'DO $$ DECLARE c text; BEGIN SELECT conname INTO STRICT c FROM pg_constraint WHERE conrelid = ''hci.decision_claims''::regclass AND contype = ''f'' AND confrelid = ''hci.subject_records''::regclass; EXECUTE format(''ALTER TABLE hci.decision_claims DROP CONSTRAINT %I'', c); ALTER TABLE hci.decision_claims ADD CONSTRAINT decision_claims_claim_fk_weak FOREIGN KEY (claim_id) REFERENCES hci.subject_records (id); END $$;'
     expect = @('DECISION-CLAIMS-CROSSTENANT-01-FK','DECISION-CLAIMS-KIND-01-FK') }
  @{ id = 'weaken-decision-claims-decision-fk'
     sql = 'DO $$ DECLARE c text; BEGIN SELECT conname INTO STRICT c FROM pg_constraint WHERE conrelid = ''hci.decision_claims''::regclass AND contype = ''f'' AND confrelid = ''hci.decisions''::regclass; EXECUTE format(''ALTER TABLE hci.decision_claims DROP CONSTRAINT %I'', c); ALTER TABLE hci.decision_claims ADD CONSTRAINT decision_claims_decision_fk_weak FOREIGN KEY (decision_id) REFERENCES hci.decisions (id); END $$;'
     expect = @('DECISION-CLAIMS-CROSSTENANT-02') }
  # m2: 0008's six paired CHECK constraints, one mutation each.
  @{ id = 'drop-claimstate-scoped-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_claim_state_scoped;'
     expect = @('CHECK-CLAIMSTATE-SCOPED-01') }
  @{ id = 'drop-claimstate-required-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_claim_state_required;'
     expect = @('CHECK-CLAIMSTATE-REQUIRED-01') }
  @{ id = 'drop-spotcheck-scoped-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_spotcheck_scoped;'
     expect = @('CHECK-SPOTCHECK-SCOPED-01') }
  @{ id = 'drop-spotcheck-required-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_spotcheck_required;'
     expect = @('CHECK-SPOTCHECK-REQUIRED-01') }
  @{ id = 'drop-reaudit-scoped-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_reaudit_scoped;'
     expect = @('CHECK-REAUDIT-SCOPED-01') }
  @{ id = 'drop-reaudit-required-default-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_reaudit_required_default;'
     expect = @('CHECK-REAUDIT-DEFAULT-01') }
  # M4 / search_path: the generic pg_proc assertions must notice a single
  # function losing its config.
  @{ id = 'reset-definer-row-security'
     sql = 'ALTER FUNCTION hci.flag_claims_on_risk_elevation() RESET row_security;'
     expect = @('DEFINER-RLS-FAILCLOSED-01') }
  @{ id = 'reset-function-search-path'
     sql = 'ALTER FUNCTION hci.enforce_claim_state_admission() RESET search_path;'
     expect = @('FUNCTION-SEARCHPATH-01') }

  # Epistemic-label promotion redline (ADR-0019 gate 5 second half,
  # migration 0010) - 2026-09-05. The value-set CHECK is the unnamed column
  # CHECK, so PostgreSQL's generated name is used.
  @{ id = 'drop-epistemic-valueset-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_epistemic_label_check;'
     expect = @('EPISTEMIC-VALUESET-01') }
  @{ id = 'drop-epistemic-scoped-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_epistemic_scoped;'
     expect = @('EPISTEMIC-SCOPED-01') }
  @{ id = 'drop-epistemic-required-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_epistemic_required;'
     expect = @('EPISTEMIC-REQUIRED-01') }
  @{ id = 'drop-epistemic-verifier-scoped-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_epistemic_verifier_scoped;'
     expect = @('EPISTEMIC-VERIFIER-SCOPED-01') }
  @{ id = 'drop-source-fact-verified-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_source_fact_verified;'
     expect = @('EPISTEMIC-SOURCEFACT-VERIFIER-01') }
  @{ id = 'drop-epistemic-verifier-fk'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_epistemic_verifier_fk;'
     expect = @('EPISTEMIC-VERIFIER-CROSSTENANT-01') }
  # Removes only the H1019 promotion branch; default/inherit, reaudit and
  # H1014 stay. Both NEG-HD08-04 tests then fall through to the
  # source_fact_verified CHECK (23514, not the H1019 they assert).
  @{ id = 'weaken-epistemic-redline'
     sql = 'CREATE OR REPLACE FUNCTION hci.enforce_claim_state_admission() RETURNS trigger LANGUAGE plpgsql SET search_path = hci, pg_temp AS $fn$ DECLARE v_predecessor_reaudit boolean; v_predecessor_label text; v_predecessor_verifier uuid; BEGIN IF NEW.kind = ''CLAIM'' AND NEW.supersedes_id IS NOT NULL THEN SELECT reaudit_required, epistemic_label, epistemic_verifier_principal_id INTO v_predecessor_reaudit, v_predecessor_label, v_predecessor_verifier FROM hci.subject_records WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_id; END IF; IF NEW.kind = ''CLAIM'' AND NEW.reaudit_required IS NULL THEN NEW.reaudit_required := COALESCE(v_predecessor_reaudit, false); END IF; IF NEW.kind = ''CLAIM'' AND NEW.epistemic_label IS NULL THEN NEW.epistemic_label := COALESCE(v_predecessor_label, ''UNKNOWN''); IF NEW.epistemic_verifier_principal_id IS NULL THEN NEW.epistemic_verifier_principal_id := v_predecessor_verifier; END IF; END IF; IF NEW.kind = ''CLAIM'' AND NEW.claim_state = ''ASSESSMENT_CANDIDATE'' AND NEW.human_spotcheck_status IS DISTINCT FROM ''APPROVED'' THEN RAISE EXCEPTION USING ERRCODE = ''H1014'', MESSAGE = ''x''; END IF; RETURN NEW; END $fn$;'
     expect = @('NEG-HD08-04','NEG-HD08-04b')
     repin = @('hci.enforce_claim_state_admission()') }
  # Removes only the label default/inherit branch; the redline, reaudit and
  # H1014 stay. Every unlabelled Claim insert then hits
  # subject_records_epistemic_required, and everything downstream of those
  # rows goes with it.
  # Real-Docker correction: removing the default/inherit branch entirely
  # (rather than the narrower "no predecessor -> UNKNOWN" half alone, which
  # would hit the identical set - virtually every CLAIM insert in this
  # suite is a standalone row, not a superseding one) leaves
  # epistemic_label NULL on every CLAIM that does not set it explicitly,
  # which is most of the suite: this fails subject_records_epistemic_required
  # (23514) at the insert itself, and every assertion that reads a row an
  # earlier failed setup would have created cascades with it. The full
  # list below is exactly what one real run reported - not an estimate.
  # TRUST-EVIDENCE-CLAIM-01 (ADR-0004) joined this mutation's expect list
  # 2026-09-05: it references CLAIM row '...916' by id rather than creating
  # its own, so when this mutation collaterally fails that row's own INSERT
  # (NEG-HD08-02-SETUP-CLAIM, already in this list), the FK it depends on
  # has nothing to point at and correctly flips to 23503 instead of success.
  @{ id = 'remove-epistemic-default-inherit'
     sql = 'CREATE OR REPLACE FUNCTION hci.enforce_claim_state_admission() RETURNS trigger LANGUAGE plpgsql SET search_path = hci, pg_temp AS $fn$ DECLARE v_predecessor_reaudit boolean; v_predecessor_label text; v_predecessor_verifier uuid; BEGIN IF NEW.kind = ''CLAIM'' AND NEW.supersedes_id IS NOT NULL THEN SELECT reaudit_required, epistemic_label, epistemic_verifier_principal_id INTO v_predecessor_reaudit, v_predecessor_label, v_predecessor_verifier FROM hci.subject_records WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_id; END IF; IF NEW.kind = ''CLAIM'' AND NEW.reaudit_required IS NULL THEN NEW.reaudit_required := COALESCE(v_predecessor_reaudit, false); END IF; IF NEW.kind = ''CLAIM'' AND NEW.epistemic_label = ''SOURCE_FACT'' AND v_predecessor_label IN (''UNKNOWN'',''HYPOTHESIS'') AND NEW.epistemic_verifier_principal_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = ''H1019'', MESSAGE = ''x''; END IF; IF NEW.kind = ''CLAIM'' AND NEW.claim_state = ''ASSESSMENT_CANDIDATE'' AND NEW.human_spotcheck_status IS DISTINCT FROM ''APPROVED'' THEN RAISE EXCEPTION USING ERRCODE = ''H1014'', MESSAGE = ''x''; END IF; RETURN NEW; END $fn$;'
     expect = @('EPISTEMIC-DEFAULT-SETUP-01','EPISTEMIC-DEFAULT-01','NEG-HD08-04','EPISTEMIC-INHERIT-SETUP-01','EPISTEMIC-INHERIT-01',
                'CLAIM-FIXTURE-01','RLS-CLAIM-02','DECISION-CLAIMS-CREATEDAT-SETUP-01','DECISION-CLAIMS-INSERT-01',
                'SPOTCHECK-PRINCIPAL-CROSSTENANT-01','DECISION-CLAIMS-CROSSTENANT-02','APPEND-ONLY-TRIGGER-04',
                'DECISION-CLAIMS-SETUP-01','APPEND-ONLY-TRIGGER-06','NEG-HD08-02-SETUP-CLAIM','NEG-HD08-02-FLAGGED',
                'NEG-HD08-02','NEG-HD08-05-SUPERSEDE-SETUP','NEG-HD08-05','NEG-HD08-06-SETUP-CLAIM',
                'NEG-HD08-07-SETUP-CLAIM','NEG-HD08-07-SETUP-LINK','NEG-HD08-07',
                'TRUST-EVIDENCE-CLAIM-01')
     repin = @('hci.enforce_claim_state_admission()') }

  # ADR-0004 (No Universal Human Trust Score, Wave 1 gates 1-3) - 2026-09-05.
  # critic review M3: gate 3's own proof (TRUST-NEG-02, "a Person may hold
  # more than one TrustDomain at once") had no mutation - the one-slot-per-
  # Person shape the ADR forbids was never actually installed and shown to
  # turn the suite red. Expect list is exactly what one real probe run
  # reported (same discipline as every mutation in this file, e.g. the
  # comment at line 680): collapsing the unique index also collaterally
  # hits TRUST-EVIDENCE-CROSSTENANT-01/-TYPEDPIN-01/-CLAIM-01, because all
  # three insert a THIRD/FOURTH TRUST_DOMAIN row for the same Person who
  # already holds row '...109' - once the index no longer distinguishes by
  # domain, any second TRUST_DOMAIN row for that Person collides on the
  # index itself (23505) before whichever check each test actually names
  # gets a chance to fire.
  @{ id = 'collapse-trust-domain-to-one-slot'
     sql = 'DROP INDEX hci.subject_records_trust_domain_unique; CREATE UNIQUE INDEX subject_records_trust_domain_unique ON hci.subject_records (tenant_id, person_id) WHERE kind = ''TRUST_DOMAIN'';'
     expect = @('TRUST-NEG-02-SETUP-A','TRUST-NEG-02-SETUP-B','TRUST-NEG-02','TRUST-EVIDENCE-CROSSTENANT-01','TRUST-EVIDENCE-TYPEDPIN-01','TRUST-EVIDENCE-CLAIM-01') }
  @{ id = 'drop-trust-domain-scoped'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_domain_scoped;'
     expect = @('TRUST-DOMAIN-SCOPE-01') }
  @{ id = 'drop-trust-domain-required'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_domain_required;'
     expect = @('TRUST-NEG-01') }
  @{ id = 'drop-trust-domain-value-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_domain_check;'
     expect = @('TRUST-DOMAIN-ENUM-01') }
  @{ id = 'drop-trust-domain-unique-index'
     sql = 'DROP INDEX hci.subject_records_trust_domain_unique;'
     expect = @('TRUST-DOMAIN-UNIQUE-01') }
  @{ id = 'drop-evidence-ref-id-scoped'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_evidence_ref_id_scoped;'
     expect = @('TRUST-EVIDENCE-SCOPE-01') }
  @{ id = 'drop-evidence-ref-id-required'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_evidence_ref_id_required;'
     expect = @('TRUST-EVIDENCE-REQ-01') }
  @{ id = 'drop-evidence-ref-kind-scoped'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_evidence_ref_kind_scoped;'
     expect = @('TRUST-EVIDENCE-KIND-SCOPE-01') }
  @{ id = 'drop-evidence-ref-kind-required'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_evidence_ref_kind_required;'
     expect = @('TRUST-EVIDENCE-KIND-REQ-01') }
  # TRUST-EVIDENCE-CHAIN-01 joined this mutation's expect list 2026-09-05:
  # it also depends on this exact enum CHECK (its evidence_ref_kind='TRUST_DOMAIN'
  # is rejected by the enum, not by the FK - '...109' really is a TRUST_DOMAIN
  # row, so the FK alone would accept it once the enum is gone).
  @{ id = 'drop-evidence-ref-kind-value-check'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_evidence_ref_kind_check;'
     expect = @('TRUST-EVIDENCE-KINDVALUE-01','TRUST-EVIDENCE-CHAIN-01') }
  # CROSSTENANT/TYPEDPIN/CROSSPERSON all target the same composite FK -
  # CROSSTENANT via its tenant_id leg (a real tenant-B row, right kind, wrong
  # tenant), TYPEDPIN via its kind leg (a real tenant-A row, right tenant,
  # wrong claimed kind), CROSSPERSON via its person_id leg (M2, db-expert
  # 2026-09-05: right tenant, right kind, wrong Person). Without the FK none
  # of the three has anything left to reject them.
  @{ id = 'drop-evidence-ref-fk'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_evidence_ref_fk;'
     expect = @('TRUST-EVIDENCE-CROSSTENANT-01','TRUST-EVIDENCE-TYPEDPIN-01','TRUST-EVIDENCE-CROSSPERSON-01') }
  # M2 regression guard (db-expert, 2026-09-05): proves the person_id leg
  # specifically is load-bearing, not merely "some FK exists" - regresses to
  # the ORIGINAL 3-column pin (tenant_id, id, kind) this migration shipped
  # with before the review, which still passes CROSSTENANT/TYPEDPIN (both
  # still caught by the narrower FK) but no longer catches CROSSPERSON.
  @{ id = 'regress-evidence-ref-fk-drop-person'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_evidence_ref_fk; ALTER TABLE hci.subject_records ADD CONSTRAINT subject_records_evidence_ref_fk FOREIGN KEY (tenant_id, evidence_ref_id, evidence_ref_kind) REFERENCES hci.subject_records (tenant_id, id, kind);'
     expect = @('TRUST-EVIDENCE-CROSSPERSON-01') }
  # M1 (db-expert, 2026-09-05): TrustDomain rows cannot use this table's only
  # correction mechanism (bitemporal supersession) - see migration 0011's own
  # header comment for the full account. This CHECK is the only thing making
  # that an explicit, tested rule instead of a silently-unreachable trigger
  # path.
  @{ id = 'drop-trust-domain-no-supersede'
     sql = 'ALTER TABLE hci.subject_records DROP CONSTRAINT subject_records_trust_domain_no_supersede;'
     expect = @('TRUST-NEG-NOSUPERSEDE-01') }
  # C1 (db-expert, 2026-09-05): TRUST-NO-AGGREGATE-COLUMN-01 is a live
  # DB-catalog assertion, not backed by any single DROPpable constraint - its
  # mutation instead ADDS the exact forbidden shape ADR-0004 names, proving
  # the assertion actually notices.
  @{ id = 'add-universal-trust-column'
     sql = 'ALTER TABLE hci.subject_records ADD COLUMN overall_score numeric;'
     expect = @('TRUST-NO-AGGREGATE-COLUMN-01') }
  # P0-09: RLS-COMPLETENESS-01/02 (21_HCI_TOP_TIER_GAP_ANALYSIS.md). db-expert
  # review (2026-09-06) found 'disable-cases-rls' (DISABLE alone) and the
  # pre-existing 'disable-rls-on-cases' (NO FORCE + DISABLE) are behaviorally
  # identical here - hci_owner is superuser, so FORCE is a no-op either way -
  # making the newer one zero-signal duplication. Replaced with NO FORCE
  # alone, which isolates COMPLETENESS-01 on its own (app-role visibility is
  # unaffected, so RLS-LEAK-03 stays green) - real-Docker verified.
  @{ id = 'noforce-cases-rls'
     sql = 'ALTER TABLE hci.cases NO FORCE ROW LEVEL SECURITY;'
     expect = @('RLS-COMPLETENESS-01') }
  # Isolates COMPLETENESS-02 alone: source_terms_records has only one
  # positive-or-negative reader (CONSENT-RLS-02, a NOT EXISTS), which fails
  # closed and stays green - unlike hci.cases below, nothing else touches
  # this table. Real-Docker verified.
  @{ id = 'drop-source-terms-rls-policy'
     sql = 'DROP POLICY tenant_isolation ON hci.source_terms_records;'
     expect = @('RLS-COMPLETENESS-02') }
  # The one mutation that actually exercises P0-09's headline claim: a brand
  # new tenant-scoped table with a real grant and zero RLS, the exact shape a
  # future migration could introduce. Without this, "a future table that
  # forgets RLS gets caught" was an assertion, not evidence - db-expert
  # review (2026-09-06) named this gap directly. created_at must default via
  # literal `now()`, not clock_timestamp() (the review's own suggestion,
  # which real-Docker caught as wrong): BITEMP-SCOPE-01 requires
  # `column_default LIKE 'now()%'` specifically, so clock_timestamp()
  # collided with that unrelated gate instead of avoiding it.
  @{ id = 'add-tenant-table-without-rls'
     sql = 'CREATE TABLE hci.rls_probe_table (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()); GRANT SELECT ON hci.rls_probe_table TO hci_app_test_a;'
     expect = @('RLS-COMPLETENESS-01','RLS-COMPLETENESS-02') }
  # RLS left enabled+forced with the policy itself gone fails CLOSED (denies
  # every row, including the owning tenant's), so every later assertion that
  # inserts/updates/reads hci.cases affects zero rows instead of erroring,
  # cascading into this real, observed 15-assertion blast radius alongside
  # RLS-COMPLETENESS-02 itself. Real-Docker verified, not estimated.
  @{ id = 'drop-cases-rls-policy'
     sql = 'DROP POLICY tenant_isolation ON hci.cases;'
     # RECORD-DECISION-HAPPY-01/-CROSSTENANT-PRINCIPAL-01 joined this
     # mutation's blast radius 2026-09-08 (hci.record_decision(), migration
     # 0014): both read hci.cases under RLS as part of the function's own
     # case_id ownership check, so losing that policy cascades into them too
     # -- found by this exact mutation run flagging them as unexpected
     # rather than assumed in advance.
     # 2026-09-10 (0015 case-reopen tests): CASE-LIFECYCLE-03 no longer
     # belongs here -- it now targets -218, and with -218's own
     # CASE-REOPEN-SETUP-01 INSERT rejected (FORCE RLS + no policy denies
     # writes too, not only reads), CASE-LIFECYCLE-03's UPDATE against a
     # never-created row matches zero rows and succeeds trivially instead of
     # failing. CASE-REOPEN-SETUP-01 itself (the rejected INSERT) and
     # CASE-REOPEN-CLOSEDAT-CLEARED-01/-SKIP-01 (both read/act on that same
     # nonexistent row) join the blast radius instead -- real-Docker
     # flagged all four, not assumed in advance.
     # 2026-09-11 (migration 0017): CASE-AUTO-PROMOTE-SETUP-01 (its own INSERT
     # rejected, same FORCE-RLS-denies-writes-too reasoning) and
     # CASE-AUTO-PROMOTE-DEFAULT-01 (reads that same never-created row, finds
     # zero rows, expect_true fails) join for the identical reason -- the
     # CLOSED-SETUP/CLOSED-01 UPDATEs against that same nonexistent row match
     # zero rows and succeed trivially instead, same as CASE-LIFECYCLE-03's
     # own precedent above, so they do NOT join this list.
     # 2026-09-12 (migration 0018): CHAIN-CASE-SETUP-01's own case-239 INSERT
     # is rejected (app-role, same FORCE-RLS-denies-writes-too reasoning);
     # CHAIN-GENESIS-01/CHAIN-LINK-SETUP-01 then fail their own FK against a
     # case row that was never created; CHAIN-GENESIS-02/CHAIN-LINK-01 read
     # rows that were never inserted (0 rows, predicate false);
     # CHAIN-VERIFY-VALID-01 finds zero records for case 239 so bool_and()
     # over no rows is NULL, not true; CHAIN-VERIFY-TAMPER-01 likewise finds
     # no record 990 to match its EXISTS check. Real-Docker flagged all
     # seven as unexpected, not assumed in advance. CHAIN-TAMPER-SETUP-01
     # does NOT join: its UPDATE against the never-created record 990
     # matches zero rows and succeeds trivially, same pattern as CASE-
     # LIFECYCLE-03's own precedent. Nothing under case 238 (CHAIN-DELETE-*/
     # CHAIN-VERIFY-DELETE-01) joins either: those setup statements run as
     # hci_owner (after this test's block's own RESET ROLE), which bypasses
     # RLS regardless of the dropped policy, and CHAIN-VERIFY-DELETE-01's
     # verify call only reads subject_records/subject_record_chain_tips,
     # neither of which this mutation touches.
     # 2026-09-12 (hci.set_case_auto_promote_rule_findings(), C5 atomicity
     # fix): the function's own case-visibility check
     # (`EXISTS (SELECT 1 FROM hci.cases WHERE tenant_id = ... AND id = ...)`)
     # reads hci.cases under RLS just like hci.record_decision() does above,
     # so losing the policy makes case -231 invisible to the function too --
     # CHANGE-01 then returns NULL (not TRUE) since the function can't see
     # the case, cascading into CHANGE-AUDIT-01 (no row to find) and
     # NOOP-01/NOOP-NOAUDIT-01 (their preconditions never held). CROSSTENANT-
     # PRINCIPAL-01 also flips: the case-visibility check now fails FIRST
     # (returns NULL) instead of reaching the principal check that would
     # raise H1021, so expect_sqlstate's exact match fails too. Real-Docker
     # flagged all five as unexpected, not assumed in advance.
     expect = @('CASE-LIFECYCLE-SETUP-01','CASE-LIFECYCLE-02b','CASE-CLOSED-IMMUTABLE-01','CASE-LIFECYCLE-SETUP-02','CASE-LIFECYCLE-04','CASE-OWNS-03-SETUP','CASE-CLOSED-GUARD-01','CASE-CLOSED-GUARD-02','CASE-PROJECTREF-02','REG-NEG-04','REG-NEG-05','REG-NEG-06','REG-NEG-07','REG-NEG-08','RLS-COMPLETENESS-02','RECORD-DECISION-HAPPY-01','RECORD-DECISION-CROSSTENANT-PRINCIPAL-01','CASE-REOPEN-SETUP-01','CASE-REOPEN-CLOSEDAT-CLEARED-01','CASE-REOPEN-SKIP-01','CASE-AUTO-PROMOTE-SETUP-01','CASE-AUTO-PROMOTE-DEFAULT-01','CHAIN-CASE-SETUP-01','CHAIN-GENESIS-01','CHAIN-GENESIS-02','CHAIN-LINK-SETUP-01','CHAIN-LINK-01','CHAIN-VERIFY-VALID-01','CHAIN-VERIFY-TAMPER-01','FN-AUTOPROMOTE-CHANGE-01','FN-AUTOPROMOTE-CHANGE-AUDIT-01','FN-AUTOPROMOTE-NOOP-01','FN-AUTOPROMOTE-NOOP-NOAUDIT-01','FN-AUTOPROMOTE-CROSSTENANT-PRINCIPAL-01') }
  # RLS-OWN-02 (db-expert M2): hci.tenants is scoped by `id`, not `tenant_id`,
  # so it is invisible to every mutation above. Dropping its own policy fails
  # CLOSED - RLS-LEAK-02 (tenant B invisible) stays green - which is exactly
  # the blind spot RLS-OWN-02's positive same-tenant read exists to catch.
  @{ id = 'drop-tenants-rls-policy'
     sql = 'DROP POLICY tenant_registry_isolation ON hci.tenants;'
     expect = @('RLS-OWN-02') }

  # hci.record_decision() (migration 0014, db-expert review 2026-09-08):
  # each mutation drops ONE of the function's two EXISTS checks. Either way
  # the composite FK on hci.decisions (case_id/principal_id, 0005/0008)
  # still independently rejects the cross-tenant id -- just with 23503
  # instead of the function's own H1020/H1021 -- so expect_sqlstate's exact
  # SQLSTATE match still correctly flips to FAIL, proving the assertion
  # depends on the function's own check, not merely on "something rejects
  # this eventually." No `repin` key (unlike line 129's sibling): that
  # function's search_path pin was bolted on LATER via a separate ALTER
  # FUNCTION (0009), so CREATE OR REPLACE there wipes it. record_decision()'s
  # `SET search_path = hci, pg_temp` was authored inline in its original
  # CREATE FUNCTION (0014) and is restated identically in both mutations
  # below, so nothing is lost - confirmed by critic review, 2026-09-08.
  @{ id = 'drop-record-decision-case-check'
     sql = 'CREATE OR REPLACE FUNCTION hci.record_decision(p_case_id uuid, p_principal_id uuid, p_outcome text, p_rationale text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = hci, pg_temp AS $fn$ DECLARE v_tenant_id uuid; v_id uuid; BEGIN v_tenant_id := hci.current_tenant_id(); IF v_tenant_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = ''H1001'', MESSAGE = ''x''; END IF; IF NOT EXISTS (SELECT 1 FROM hci.principals WHERE tenant_id = v_tenant_id AND id = p_principal_id) THEN RAISE EXCEPTION USING ERRCODE = ''H1021'', MESSAGE = ''x''; END IF; v_id := gen_random_uuid(); INSERT INTO hci.decisions (id, tenant_id, case_id, outcome, rationale, author_class, principal_id) VALUES (v_id, v_tenant_id, p_case_id, p_outcome, p_rationale, ''HUMAN_ONLY'', p_principal_id); RETURN v_id; END $fn$;'
     expect = @('RECORD-DECISION-CROSSTENANT-CASE-01') }
  @{ id = 'drop-record-decision-principal-check'
     sql = 'CREATE OR REPLACE FUNCTION hci.record_decision(p_case_id uuid, p_principal_id uuid, p_outcome text, p_rationale text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = hci, pg_temp AS $fn$ DECLARE v_tenant_id uuid; v_id uuid; BEGIN v_tenant_id := hci.current_tenant_id(); IF v_tenant_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = ''H1001'', MESSAGE = ''x''; END IF; IF NOT EXISTS (SELECT 1 FROM hci.cases WHERE tenant_id = v_tenant_id AND id = p_case_id) THEN RAISE EXCEPTION USING ERRCODE = ''H1020'', MESSAGE = ''x''; END IF; v_id := gen_random_uuid(); INSERT INTO hci.decisions (id, tenant_id, case_id, outcome, rationale, author_class, principal_id) VALUES (v_id, v_tenant_id, p_case_id, p_outcome, p_rationale, ''HUMAN_ONLY'', p_principal_id); RETURN v_id; END $fn$;'
     expect = @('RECORD-DECISION-CROSSTENANT-PRINCIPAL-01') }

  # Evidence hash-chain (migrations/0018): without this trigger, content_hash/
  # prev_hash stay NULL (no column DEFAULT computes them), so both the
  # genesis/linkage checks and the whole-chain verify go red.
  @{ id = 'drop-content-hash-trigger'
     sql = 'DROP TRIGGER subject_records_content_hash ON hci.subject_records;'
     expect = @('CHAIN-GENESIS-02','CHAIN-LINK-01','CHAIN-VERIFY-VALID-01') }

  # Case auto-promote audit (migrations/0019): trigger-layer defense is the
  # whole point of an audit trail (an editable audit row is not an audit
  # trail) -- proves it independently of the grant-layer REVOKE.
  @{ id = 'drop-case-auto-promote-audit-trigger'
     sql = 'DROP TRIGGER case_auto_promote_audit_append_only ON hci.case_auto_promote_audit;'
     expect = @('APPEND-ONLY-TRIGGER-10','APPEND-ONLY-TRIGGER-11') }

  # hci.set_case_auto_promote_rule_findings() (migrations/0019, critic
  # follow-up 2026-09-12): folds the hci.cases UPDATE + audit INSERT into
  # one atomic call. First mutation proves the function itself is what the
  # FN-AUTOPROMOTE-* assertions depend on; second proves the no-op dedup
  # (skip the audit INSERT when the value didn't actually change) is real,
  # not just an untested claim in a comment.
  @{ id = 'drop-set-auto-promote-function'
     sql = 'DROP FUNCTION hci.set_case_auto_promote_rule_findings(uuid, boolean, uuid);'
     expect = @('FN-AUTOPROMOTE-CHANGE-01','FN-AUTOPROMOTE-CHANGE-AUDIT-01','FN-AUTOPROMOTE-NOOP-01','FN-AUTOPROMOTE-NOOP-NOAUDIT-01','FN-AUTOPROMOTE-MISSING-CASE-01','FN-AUTOPROMOTE-CROSSTENANT-PRINCIPAL-01') }
  @{ id = 'weaken-set-auto-promote-noop-check'
     sql = 'CREATE OR REPLACE FUNCTION hci.set_case_auto_promote_rule_findings(p_case_id uuid, p_new_value boolean, p_principal_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = hci, pg_temp AS $fn$ DECLARE v_tenant_id uuid; v_changed boolean; BEGIN v_tenant_id := hci.current_tenant_id(); IF v_tenant_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = ''H1001'', MESSAGE = ''x''; END IF; IF NOT EXISTS (SELECT 1 FROM hci.cases WHERE tenant_id = v_tenant_id AND id = p_case_id) THEN RETURN NULL; END IF; IF NOT EXISTS (SELECT 1 FROM hci.principals WHERE tenant_id = v_tenant_id AND id = p_principal_id) THEN RAISE EXCEPTION USING ERRCODE = ''H1021'', MESSAGE = ''x''; END IF; UPDATE hci.cases SET auto_promote_rule_findings = p_new_value WHERE id = p_case_id AND tenant_id = v_tenant_id; v_changed := true; INSERT INTO hci.case_auto_promote_audit (id, tenant_id, case_id, changed_by_principal_id, new_value) VALUES (gen_random_uuid(), v_tenant_id, p_case_id, p_principal_id, p_new_value); RETURN v_changed; END $fn$;'
     expect = @('FN-AUTOPROMOTE-NOOP-01','FN-AUTOPROMOTE-NOOP-NOAUDIT-01')
     repin = @('hci.set_case_auto_promote_rule_findings(uuid,boolean,uuid)') }

  # hci.sources admission_state lifecycle (migrations/0020): trigger-layer
  # defense proves the state machine itself, independent of the grant-layer
  # REVOKE the next mutation exercises -- same two-layer pattern as
  # drop-case-auto-promote-audit-trigger above.
  @{ id = 'drop-source-admission-trigger'
     sql = 'DROP TRIGGER sources_admission_lifecycle ON hci.sources;'
     expect = @('SRC-ADMIT-INSERT-REJECT-01','SRC-ADMIT-SKIP-REJECT-01','SRC-ADMIT-TERMINAL-REJECT-01','SRC-ADMIT-TRIGGER-BYPASS-01','SRC-ADMIT-REJECTED-TERMINAL-01') }
  # Cascading expect list (real-Docker discovered, same recurring pattern as
  # drop-cases-rls-policy below): SRC-ADMIT-FORWARD-01..04 and -REJECT-PATH-01
  # fail directly (grant denied at INSERT/UPDATE time). Because those never
  # actually advance the -310/bbbbbbbb-310 fixture rows past DISCOVERED, every
  # later assertion in the same stateful sequence that expects those rows to
  # already be MATCHED/VERIFIED/ACCEPTED/ACTIVE also goes red, just with a
  # different failure shape (a legal-from-DISCOVERED transition unexpectedly
  # succeeding, or a state-value check finding DISCOVERED instead of ACTIVE)
  # rather than being independently "killed" by this mutation.
  @{ id = 'revoke-source-admission-state-update-grant'
     sql = 'REVOKE UPDATE (admission_state) ON hci.sources FROM hci_app_test_a, hci_app_test_b;'
     expect = @('SRC-ADMIT-FORWARD-01','SRC-ADMIT-FORWARD-02','SRC-ADMIT-FORWARD-03','SRC-ADMIT-FORWARD-04','SRC-ADMIT-SKIP-REJECT-01','SRC-ADMIT-TERMINAL-REJECT-01','SRC-ADMIT-TRIGGER-BYPASS-01','SRC-ADMIT-REJECT-PATH-01','SRC-ADMIT-REJECTED-TERMINAL-01','SRC-UPSERT-NO-REGRESS-02') }
  # sources_tenant_ref_unique backs hci.upsert_discovered_source's ON
  # CONFLICT ON CONSTRAINT clause by name -- dropping it does not silently
  # allow duplicates, it makes every call to the function raise
  # undefined_object (42704). SRC-UPSERT-NO-REGRESS-02 is NOT in this list
  # (real-Docker discovered): it only checks a state VALUE that NO-REGRESS-01's
  # now-failing call never touched, so the value is untouched and the
  # assertion keeps passing -- correctly, not vacuously, since nothing wrote
  # to that row in this mutated run.
  @{ id = 'drop-sources-tenant-ref-unique'
     sql = 'ALTER TABLE hci.sources DROP CONSTRAINT sources_tenant_ref_unique;'
     expect = @('SRC-UPSERT-IDEMPOTENT-01','SRC-UPSERT-NEW-01','SRC-UPSERT-NEW-DEFAULT-STATE-01','SRC-UPSERT-NO-REGRESS-01','SRC-UPSERT-TENANT-SCOPED-01','SRC-UPSERT-TENANT-SCOPED-02') }
  # Intended to reintroduce the DISCOVERED-regression SRC-UPSERT-NO-REGRESS-02
  # exists to catch, but real-Docker run showed a more interesting result:
  # the -310 fixture row is ACTIVE (terminal) by the time this upsert call
  # runs, so hci.enforce_source_admission_transition() (migrations/0020)
  # independently rejects the ACTIVE->DISCOVERED write with H1022 before it
  # can commit - true defense-in-depth, the trigger backstops the upsert
  # function's own carefulness rather than only the reverse. The observable
  # kill is SRC-UPSERT-NO-REGRESS-01 (its upsert call now raises H1022
  # instead of returning cleanly), not -02 (which keeps passing because the
  # rejected write never touched the row).
  @{ id = 'weaken-upsert-resets-admission-state'
     sql = 'CREATE OR REPLACE FUNCTION hci.upsert_discovered_source(p_id uuid, p_source_ref text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = hci, pg_temp AS $fn$ DECLARE v_tenant_id uuid; v_id uuid; BEGIN v_tenant_id := hci.current_tenant_id(); IF v_tenant_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = ''H1001'', MESSAGE = ''x''; END IF; INSERT INTO hci.sources (id, tenant_id, source_ref) VALUES (p_id, v_tenant_id, p_source_ref) ON CONFLICT ON CONSTRAINT sources_tenant_ref_unique DO UPDATE SET source_ref = EXCLUDED.source_ref, admission_state = ''DISCOVERED'' RETURNING id INTO v_id; RETURN v_id; END $fn$;'
     expect = @('SRC-UPSERT-NO-REGRESS-01')
     repin = @('hci.upsert_discovered_source(uuid,text)') }
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

# ============================================================================
# Per-mutation isolation: BEGIN...ROLLBACK, not schema teardown+rebuild.
# ============================================================================
# The original engine called Reset-Schema (DROP the whole hci schema, then
# replay all 11 migrations + fixtures + harness) before EVERY one of 125+
# mutations, because each mutation's SQL and the negative-test file both ran
# as their own separately-committing `psql -c`/`psql <file` invocation - nothing
# rolled back, so only a full rebuild could return to a clean baseline for the
# next mutation. Real-Docker timing (2026-09-06, P0-09) measured that
# rebuild-per-mutation cost as the dominant cost of this entire script.
#
# Postgres DDL is transactional, including every shape this file's mutations
# use (ALTER TABLE, DROP POLICY/TRIGGER/CONSTRAINT, CREATE OR REPLACE
# FUNCTION, GRANT/REVOKE) - real-Docker check confirmed this also holds for
# the two mutations that create session/database-global objects
# ('create-cognitive-named-role', 'enable-dblink-extension'): neither survives
# a ROLLBACK, so the OLD engine's Reset-Schema no longer needs the manual
# 'DROP ROLE IF EXISTS'/'DROP EXTENSION IF EXISTS' cleanup it carried
# specifically because ITS mutations committed immediately outside any
# transaction. The baseline schema is now built exactly ONCE
# (Initialize-Baseline below); every mutation instead runs as ONE psql
# invocation shaped BEGIN; <mutation sql>; <repin sql>; <assertions>; <summary
# query>; ROLLBACK - so the database is provably back to the untouched
# baseline before the next mutation's connection even opens, with no rebuild
# in between. SET (not SET LOCAL) ROLE inside a transaction that rolls back is
# itself rolled back too (documented Postgres behavior, confirmed real-Docker)
# - the negative-test file's own `SET ROLE hci_app_test_a; ... RESET ROLE;`
# pairing needs no adjustment to run safely inside this wrapper. The
# reverse constraint (db-expert review, 2026-09-06, m3): a mutation's `sql`
# must itself run inside a transaction block, so CONCURRENTLY forms
# (CREATE/REINDEX INDEX CONCURRENTLY), VACUUM, CREATE DATABASE, and CREATE
# TABLESPACE cannot appear in one - none do today.
function Initialize-Baseline {
  if ((Invoke-SqlFile -Path $upMig)    -ne 0) { throw 'mutation harness: 0001 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig2)   -ne 0) { throw 'mutation harness: 0002 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig3)   -ne 0) { throw 'mutation harness: 0003 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig4)   -ne 0) { throw 'mutation harness: 0004 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig5)   -ne 0) { throw 'mutation harness: 0005 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig6)   -ne 0) { throw 'mutation harness: 0006 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig7)   -ne 0) { throw 'mutation harness: 0007 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig8)   -ne 0) { throw 'mutation harness: 0008 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig9)   -ne 0) { throw 'mutation harness: 0009 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig10)  -ne 0) { throw 'mutation harness: 0010 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig11)  -ne 0) { throw 'mutation harness: 0011 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig12)  -ne 0) { throw 'mutation harness: 0012 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig13)  -ne 0) { throw 'mutation harness: 0013 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig14)  -ne 0) { throw 'mutation harness: 0014 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig15)  -ne 0) { throw 'mutation harness: 0015 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig16)  -ne 0) { throw 'mutation harness: 0016 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig17)  -ne 0) { throw 'mutation harness: 0017 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig18)  -ne 0) { throw 'mutation harness: 0018 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig19)  -ne 0) { throw 'mutation harness: 0019 up migration failed' }
  if ((Invoke-SqlFile -Path $upMig20)  -ne 0) { throw 'mutation harness: 0020 up migration failed' }
  if ((Invoke-SqlFile -Path $fixtures) -ne 0) { throw 'mutation harness: fixtures failed' }
  if ((Invoke-SqlFile -Path $harness)  -ne 0) { throw 'mutation harness: harness failed' }
}

# The negative-test file itself ends in `SELECT hci_test.finish($N);`, which
# RAISEs on any failure (by design, for the standalone/CI-facing run this
# same file also serves via test-wave1-local.ps1). A RAISE inside this
# engine's wrapping transaction would abort it before the summary query
# below ever runs, so that trailing report/finish section is stripped here -
# this engine reads hci_test.results directly instead. Splitting on the
# file's own '--- assertion results ---' marker (rather than hand-copying an
# assertion count that would silently drift from the real file) keeps this
# extraction tied to the file's actual current shape.
$sqlTestsRaw = Get-Content -Raw -Encoding UTF8 -LiteralPath $sqlTests
# Anchored to the FULL `\echo '...'` line, not the bare phrase inside it - a
# bare-phrase IndexOf cuts the substring off after the phrase but before that
# line's own closing quote, leaving a genuinely unterminated quoted string
# fed to psql (found by real run, 2026-09-06: psql/Postgres itself reported
# "unterminated quoted string", surfaced as a docker.exe stderr line).
$markerIndex = $sqlTestsRaw.IndexOf("\echo '--- assertion results ---'")
if ($markerIndex -lt 0) { throw "fast mutation engine: could not find the assertion-results \echo line in $sqlTests; this engine's text-splitting assumption is stale" }
$sqlAssertionsOnly = [regex]::Replace($sqlTestsRaw.Substring(0, $markerIndex), '(?ms)(\r?\n-- -{5,}\s*)+\z', '')
$finishMatch = [regex]::Match($sqlTestsRaw, 'hci_test\.finish\((\d+)\)')
if (-not $finishMatch.Success) { throw "fast mutation engine: could not find hci_test.finish(N) in $sqlTests to determine the expected assertion count" }
$expectedTotal = [int]$finishMatch.Groups[1].Value

# Runs one mutation's isolated probe and returns @{ Applied; Total; FailedList; RawTail }.
# Applied=$false means the mutation SQL itself could not be executed against
# the current schema (a genuine authoring error, e.g. a renamed constraint) -
# distinct from, and checked before, whether the resulting assertions matched
# expectations.
function Test-Mutation {
  param($Mutation)
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('BEGIN;')
  [void]$sb.AppendLine($Mutation.sql)
  # CREATE OR REPLACE FUNCTION replaces a function's config (proconfig)
  # wholesale, so a mutation that rewrites a body silently strips the
  # search_path / row_security pins 0009 applied with ALTER FUNCTION and
  # trips the generic FUNCTION-SEARCHPATH-01 / DEFINER-RLS-FAILCLOSED-01
  # assertions as collateral - found by real run, 2026-09-05. A body-
  # rewriting mutation therefore names the function(s) it rewrites in
  # `repin`, and the config is re-applied here so the mutation removes
  # only the one behaviour it targets. search_path is re-pinned on every
  # rewritten function; row_security=off ONLY on SECURITY DEFINER ones -
  # on a SECURITY INVOKER trigger function fired by the application role
  # it is not harmless at all: the role's policy-filtered lookup becomes
  # a hard error instead ("query would be affected by row-level security
  # policy"), which real-Docker turned up as six IDENTITY-NEG collateral
  # hits on 'allow-person-repoint-after-confirm' (2026-09-05). That is the
  # same fail-closed semantics 0009 wants for definers, and exactly the
  # wrong thing for an invoker. The two mutations whose *target* is this
  # config ('reset-definer-row-security', 'reset-function-search-path')
  # carry no repin.
  foreach ($fn in @($Mutation.repin)) {
    if (-not $fn) { continue }
    [void]$sb.AppendLine("ALTER FUNCTION $fn SET search_path = hci, pg_temp; DO `$rp`$ BEGIN IF (SELECT prosecdef FROM pg_proc WHERE oid = '$fn'::regprocedure) THEN EXECUTE 'ALTER FUNCTION $fn SET row_security = off'; END IF; END `$rp`$;")
  }
  # db-expert review (2026-09-06, m2): a lone sentinel between "mutation
  # applied" and "assertions ran" turns three previously-conflated failure
  # causes (mutation SQL itself, a repin statement, or a bare non-assertion
  # statement inside the assertions block erroring under ON_ERROR_STOP) into
  # two distinguishable stages, instead of one misleading fixed message.
  [void]$sb.AppendLine("SELECT '>>>APPLIED>>>';")
  [void]$sb.Append($sqlAssertionsOnly)
  [void]$sb.AppendLine("SELECT '>>>RESULT>>>' || count(*) || '|' || coalesce(string_agg(test_id, ',' ORDER BY id) FILTER (WHERE outcome = 'FAIL'), '') FROM hci_test.results;")
  [void]$sb.AppendLine('ROLLBACK;')
  # db-expert review (2026-09-06, m1): the old engine's per-mutation schema
  # rebuild made a residue check moot; this engine's isolation is entirely
  # ROLLBACK, so this proves each run actually leaves nothing behind, in the
  # same round trip, on the same connection ROLLBACK just ran on.
  [void]$sb.AppendLine("SELECT '>>>CLEAN>>>' || count(*) FROM hci_test.results;")

  $ErrorActionPreference = 'Continue'
  $out = $sb.ToString() | & docker @composeArgs exec -T db psql -tAq -U hci_owner -d $db 2>&1
  $ErrorActionPreference = 'Stop'
  $outText = ($out | Out-String)
  # Sentinels (rather than bare patterns like '<int>|...') avoid ever
  # misreading a stray numeric line from psql/docker noise as a real summary
  # row.
  $rawTail = ($outText -split "`n" | Select-Object -Last 15) -join "`n"
  if (-not [regex]::Match($outText, '>>>APPLIED>>>').Success) {
    return @{ Applied = $false; Total = 0; FailedList = @(); RawTail = $rawTail; Stage = 'mutation-or-repin' }
  }
  $resultMatch = [regex]::Match($outText, '>>>RESULT>>>(\d+)\|([^\r\n]*)')
  if (-not $resultMatch.Success) {
    return @{ Applied = $false; Total = 0; FailedList = @(); RawTail = $rawTail; Stage = 'assertions-block' }
  }
  $cleanMatch = [regex]::Match($outText, '>>>CLEAN>>>(\d+)')
  if (-not $cleanMatch.Success -or $cleanMatch.Groups[1].Value -ne '0') {
    throw "mutation '$($Mutation.id)': rollback left $($cleanMatch.Groups[1].Value) residual row(s) in hci_test.results - isolation broken, results from here on are not trustworthy"
  }
  $failedList = @($resultMatch.Groups[2].Value -split ',' | Where-Object { $_ -ne '' })
  return @{ Applied = $true; Total = [int]$resultMatch.Groups[1].Value; FailedList = $failedList; RawTail = '' }
}

$problems = @()
try {
  & docker @composeArgs up -d --wait
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic PostgreSQL did not become healthy.' }

  Initialize-Baseline

  # Control run: unmutated schema must be fully green. If this is red, every
  # mutation result below would be meaningless.
  $baseline = Test-Mutation -Mutation @{ sql = 'SELECT 1;'; repin = @() }
  if (-not $baseline.Applied) { throw "baseline probe itself could not run:`n$($baseline.RawTail)" }
  if ($baseline.Total -ne $expectedTotal) { throw "baseline ran $($baseline.Total) assertions, expected $expectedTotal (a test was skipped, or added without updating hci_test.finish(N))" }
  if ($baseline.FailedList.Count -gt 0) {
    throw "baseline suite failed on an unmutated schema; failing assertions: $($baseline.FailedList -join ',')"
  }
  Write-Host 'baseline: suite green on unmutated schema'

  foreach ($m in $mutations) {
    $result = Test-Mutation -Mutation $m

    if (-not $result.Applied) {
      # db-expert review (2026-09-06, m2): Stage distinguishes "the mutation
      # SQL itself failed" (its SQL no longer matches the schema) from "the
      # mutation applied fine but a bare statement inside the assertions
      # block errored" (a real assertions-file bug, not a stale mutation).
      $reason = if ($result.Stage -eq 'assertions-block') { 'mutation applied, but the assertions block itself errored on a bare statement' } else { 'mutation SQL (or a repin statement) could not be applied; its SQL no longer matches the schema' }
      $problems += "$($m.id): $reason"
      Write-Host "  UNAPPLIED $($m.id) [$($result.Stage)]:`n$($result.RawTail)"
      continue
    }
    if ($result.Total -ne $expectedTotal) {
      $problems += "$($m.id): ran $($result.Total) assertions, expected $expectedTotal (this mutation changed how many assertions execute, not just their outcome)"
      Write-Host "  MISCOUNT $($m.id) - ran $($result.Total), expected $expectedTotal"
      continue
    }
    $failedList = $result.FailedList

    if ($failedList.Count -eq 0) {
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
      Write-Host "  killed   $($m.id) -> $($failedList -join ',')"
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
