-- Reverses 0007_wave1_crypto_shredding_up.sql only. Does not touch 0001-0006's
-- tables/roles/schema. Safe to run against a schema where those six are
-- still applied and 0007 is being rolled back independently.
--
-- Not currently exercised by test-wave1-local.ps1's reversibility pass -
-- 0001_wave1_synthetic_down.sql (DROP SCHEMA hci CASCADE) already tears down
-- everything 0002-0007 add along with everything 0001 adds, in one step,
-- because all seven live in the same schema.
--
-- Per ADR-0018's own rollback note: "may drop empty encryption_key_ref/
-- tombstoned_at columns but must not resurrect a destroyed key_material
-- value or un-tombstone a legitimately erased row - reversing a completed
-- erasure is not a schema operation, it is a new incident." The guard below
-- makes "no destroyed key, no tombstoned row" a checked precondition, not
-- merely a comment - same pattern as 0005's empty-bitemporal-history guard.
BEGIN;
SET LOCAL lock_timeout = '3s';
-- M3 class fix (db-expert review of migration 0011, 2026-09-05): both tables
-- this guard reads are FORCE ROW LEVEL SECURITY. Under a non-superuser owner
-- the guard's SELECTs would silently match zero rows instead of erroring,
-- letting this migration drop populated crypto-shredding state with no
-- warning. Same fix as 0005/0009 (M4) - see 0005_wave1_bitemporal_history_down.sql's
-- comment for the full account.
SET LOCAL row_security = off;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM hci.subject_records WHERE tombstoned_at IS NOT NULL OR encryption_key_ref IS NOT NULL
  ) OR EXISTS (SELECT 1 FROM hci.data_encryption_keys) THEN
    RAISE EXCEPTION 'refusing to drop populated crypto-shredding state (ADR-0018 rollback note); this down migration is the empty-schema case only';
  END IF;
END $$;

-- Restore hci.reject_update_delete() to exactly 0005's version (the
-- system_superseded_at-only shape clause), not 0001's bare original: 0005 is
-- still applied when this file runs narrowly, and its own mark_superseded()
-- mechanism still needs that shape clause to keep working.
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
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'H1003',
    MESSAGE = format('%s.%s is append-only (%s rejected)', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP);
END $$;

DROP FUNCTION IF EXISTS hci.tombstone_evidence(uuid);

ALTER TABLE hci.subject_records
  DROP CONSTRAINT IF EXISTS subject_records_key_ref_fk,
  DROP CONSTRAINT IF EXISTS subject_records_key_scoped_to_evidence_claim,
  DROP CONSTRAINT IF EXISTS subject_records_key_required_for_evidence_claim,
  DROP COLUMN IF EXISTS tombstoned_at,
  DROP COLUMN IF EXISTS encryption_key_ref;

-- Restore the pre-0007 INSERT grant (0005's shape, minus encryption_key_ref).
REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

DROP TABLE IF EXISTS hci.data_encryption_keys;
-- pgcrypto is left installed: no other object depends on removing it, and
-- dropping an extension another future migration might also want is a
-- coordination risk this narrow rollback should not take on.

COMMIT;
