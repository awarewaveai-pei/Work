-- Reverses 0008_wave1_field_author_class_policy_up.sql only. Does not touch
-- 0001-0007's tables/roles/schema. Safe to run against a schema where those
-- seven are still applied and 0008 is being rolled back independently.
--
-- Not currently exercised by test-wave1-local.ps1's reversibility pass -
-- 0001_wave1_synthetic_down.sql (DROP SCHEMA hci CASCADE) already tears down
-- everything 0002-0008 add along with everything 0001 adds, in one step,
-- because all eight live in the same schema.
BEGIN;
SET LOCAL lock_timeout = '3s';
-- M3 class fix (db-expert review of migration 0011, 2026-09-05): every table
-- this guard reads is FORCE ROW LEVEL SECURITY. Under a non-superuser owner
-- the guard's SELECTs would silently match zero rows instead of erroring,
-- letting this migration destroy populated ADR-0019 state with no warning.
-- Same fix as 0005/0007/0009 (M4) - see 0005_wave1_bitemporal_history_down.sql's
-- comment for the full account.
SET LOCAL row_security = off;

-- db-expert review (2026-09-05, M5) corrected this guard in both
-- directions. (a) The original check only tested `reaudit_required IS
-- TRUE`, missing the general case: any EVIDENCE/CLAIM/ASSESSMENT row has
-- real, non-NULL data in the author_class/claim_state/human_spotcheck_status
-- columns this file drops below, even when decisions/principals/
-- decision_claims are all still empty (a case with claims but no decision
-- yet) - the narrower check would have let that data be silently destroyed,
-- and left the schema unable to re-apply 0008 up (the NOT NULL
-- *_required CHECK constraints would immediately reject the now-NULL
-- existing rows). (b) The original message's stated reason ("decisions row
-- would be orphaned") was also wrong - DROP COLUMN does not fire the
-- append-only trigger and orphans nothing, it destroys the value outright;
-- corrected below to say what actually happens.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM hci.subject_records WHERE kind <> 'TRUST_DOMAIN')
     OR EXISTS (SELECT 1 FROM hci.decision_claims)
     OR EXISTS (SELECT 1 FROM hci.decisions)
     OR EXISTS (SELECT 1 FROM hci.principals) THEN
    RAISE EXCEPTION 'refusing to drop field-author-class-policy state against a populated schema: an EVIDENCE/CLAIM/ASSESSMENT subject_records row, or a decisions/decision_claims/principals row, holds real data in the columns/tables this migration removes, which this narrow rollback does not preserve. This down migration is the empty-schema case only (undo the schema change before any ADR-0019 data is recorded) - not a general-purpose data-preserving rollback once real rows exist.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS decision_claims_reaudit_gate ON hci.decision_claims;
DROP FUNCTION IF EXISTS hci.enforce_decision_reaudit_gate();
DROP TRIGGER IF EXISTS decision_claims_append_only ON hci.decision_claims;
DROP TRIGGER IF EXISTS decision_claims_no_truncate ON hci.decision_claims;
DROP TABLE IF EXISTS hci.decision_claims;

DROP TRIGGER IF EXISTS cases_flag_claims_on_risk_elevation ON hci.cases;
DROP FUNCTION IF EXISTS hci.flag_claims_on_risk_elevation();

DROP TRIGGER IF EXISTS subject_records_claim_state_admission ON hci.subject_records;
DROP FUNCTION IF EXISTS hci.enforce_claim_state_admission();

DROP TRIGGER IF EXISTS subject_records_author_class ON hci.subject_records;
DROP TRIGGER IF EXISTS decisions_author_class ON hci.decisions;
DROP FUNCTION IF EXISTS hci.enforce_field_author_class();

-- Restore hci.reject_update_delete() to exactly 0007's two-shape-clause
-- version (system_superseded_at, tombstoned_at) - 0005/0007 are still
-- applied when this file runs narrowly, and mark_superseded()/
-- tombstone_evidence() still need those two clauses to keep working.
CREATE OR REPLACE FUNCTION hci.reject_update_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o jsonb; n jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    n := to_jsonb(NEW);
    IF o ? 'system_superseded_at'
       AND o->>'system_superseded_at' IS NULL
       AND n->>'system_superseded_at' IS NOT NULL
       AND (o - 'system_superseded_at') = (n - 'system_superseded_at')
       AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), 'MEMBER')
    THEN
      RETURN NEW;
    END IF;
    IF o ? 'tombstoned_at'
       AND o->>'tombstoned_at' IS NULL
       AND n->>'tombstoned_at' IS NOT NULL
       AND (o - 'tombstoned_at') = (n - 'tombstoned_at')
       AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = TG_RELID), 'MEMBER')
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'H1003',
    MESSAGE = format('%s.%s is append-only (%s rejected)', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP);
END $$;

-- decisions_principal_fk must be dropped before hci.principals itself - real-
-- Docker correction (2026-09-05 narrow-rollback verification): the original
-- ordering dropped hci.principals first and failed with "cannot drop table
-- hci.principals because other objects depend on it" (decisions_principal_fk).
ALTER TABLE hci.decisions
  DROP CONSTRAINT IF EXISTS decisions_principal_fk,
  DROP COLUMN IF EXISTS principal_id,
  DROP COLUMN IF EXISTS author_class;

DROP TRIGGER IF EXISTS principals_tenant_immutable ON hci.principals;
DROP TABLE IF EXISTS hci.principals;

ALTER TABLE hci.subject_records
  DROP CONSTRAINT IF EXISTS subject_records_reaudit_required_default,
  DROP CONSTRAINT IF EXISTS subject_records_reaudit_scoped,
  DROP COLUMN IF EXISTS reaudit_required,
  DROP CONSTRAINT IF EXISTS subject_records_spotcheck_required,
  DROP CONSTRAINT IF EXISTS subject_records_spotcheck_scoped,
  DROP COLUMN IF EXISTS human_spotcheck_status,
  DROP CONSTRAINT IF EXISTS subject_records_claim_state_required,
  DROP CONSTRAINT IF EXISTS subject_records_claim_state_scoped,
  DROP COLUMN IF EXISTS claim_state,
  DROP CONSTRAINT IF EXISTS subject_records_author_class_required,
  DROP COLUMN IF EXISTS author_class;

-- Restore the pre-0008 INSERT grants (0007's shape).
REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

REVOKE INSERT ON hci.decisions FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, case_id, outcome, rationale, valid_from, valid_to, supersedes_id, corrected_reason)
  ON hci.decisions TO hci_app_test_a, hci_app_test_b;

COMMIT;
