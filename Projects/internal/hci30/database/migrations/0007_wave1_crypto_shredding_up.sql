-- HCI-30 Wave 1 - Crypto-shredding for erasure (ADR-0018, HD-07).
-- Implements Wave 1 gates 1-3 and 6 only. Wave 4 gates (4: mediated
-- write/read once a real payload column exists; 5: hci.record_erasure()
-- wired to the DSR lifecycle) are explicitly labeled Wave 4 in the ADR's
-- own gate text - the ADR's own reasoning is that "erasure" is not a
-- meaningful concept to test against a row that never held real content
-- through the proper write path, even though gate 5's own mechanics
-- (touching only hci.data_encryption_keys and hci.tombstone_evidence(),
-- neither of which needs gate 4) do not strictly require gate 4 to exist
-- first. Respecting that explicit sequencing rather than building past it
-- on a technical loophole - not built here, not faked.
--
-- Extends 0001-0006. Must run after all six, before the fixtures/harness/
-- negative-test files.
--
-- ADR-0018's own gate 1 text says "Migration 0003 adds...", "hci.subject_records
-- (:116-126)" line references, etc. - all stale relative to the migration
-- numbering actually finalized (0003 is ADR-0012's regulatory market scope,
-- already committed). This is migration 0007; noted here rather than editing
-- the ADR's historical decision record.
--
-- ============================================================================
-- Gate 3's escape hatch: extending, not duplicating, ADR-0017's mechanism
-- ============================================================================
-- ADR-0017's own header (migrations/0005_wave1_bitemporal_history_up.sql:1-100)
-- already anticipated this exact moment: "the shape here is specific to
-- system_superseded_at, so that future migration needs its own shape clause
-- (tombstoned_at NULL -> NOT NULL, nothing else changed) in the same
-- function, not a copy of this file's rejected designs." hci.tombstone_evidence()
-- needs to UPDATE hci.subject_records.tombstoned_at past the same
-- hci.reject_update_delete() append-only trigger hci.mark_superseded() already
-- has a working exception inside. Rather than a second escape-hatch
-- mechanism, hci.reject_update_delete() gains a SECOND shape clause,
-- structurally identical to the first: "tombstoned_at moved NULL -> NOT
-- NULL, every other column byte-identical, executed by a role that is a
-- member of the table owner." No new forgery surface - the same jsonb-diff-
-- plus-role-membership authorization already proven for supersession, one
-- more column.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE actual text[]; expected text[];
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C") INTO actual
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'hci' AND c.relkind = 'r';
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO expected FROM unnest(ARRAY[
    'persons','tenant_authorizations','subject_lawful_basis_records','sources','source_terms_records',
    'research_workflows','subject_records','data_subject_requests','data_subject_request_events',
    'data_subject_request_targets','identity_candidates','identity_verifications',
    'tenants','app_tenant_bindings','cases','source_snapshots','source_relationships','decisions'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift before 0007; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

-- ============================================================================
-- Gate 1: hci.data_encryption_keys - isolated by GRANT, not by encrypting the
-- key itself (this table's own key_material is stored in the clear at Wave 1
-- - ADR-0022 wraps it under a tenant KEK at Wave 2, not built here). No RLS:
-- unlike every tenant-owned table elsewhere in this schema, the application
-- roles hold ZERO grant of any kind here (not even SELECT), so RLS would add
-- no protection they don't already lack entirely, and RLS does not apply to
-- the table owner regardless, whose SECURITY DEFINER functions are the only
-- legitimate readers/writers this Wave. The zero-grant state is deliberately
-- the whole control, matching the gate's own heading.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE hci.data_encryption_keys (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES hci.tenants(id),
  key_material bytea NOT NULL DEFAULT gen_random_bytes(32),
  created_at timestamptz NOT NULL DEFAULT now(),
  destroyed_at timestamptz,
  UNIQUE (tenant_id, id)
);
-- Deliberately no GRANT statement follows. hci_app_test_a/hci_app_test_b
-- receive nothing on this table - not SELECT, not INSERT, nothing.

-- ============================================================================
-- Gate 2: reference columns + scope fence on hci.subject_records.
-- Symmetric CHECK pair (required-for those kinds / scoped-to those kinds),
-- matching the existing subject_type/kind CHECK style in this table
-- (0001:127-129).
-- ============================================================================
ALTER TABLE hci.subject_records
  ADD COLUMN encryption_key_ref uuid,
  ADD COLUMN tombstoned_at timestamptz,
  ADD CONSTRAINT subject_records_key_required_for_evidence_claim
    CHECK (kind NOT IN ('EVIDENCE','CLAIM') OR encryption_key_ref IS NOT NULL),
  ADD CONSTRAINT subject_records_key_scoped_to_evidence_claim
    CHECK (kind IN ('EVIDENCE','CLAIM') OR encryption_key_ref IS NULL),
  ADD CONSTRAINT subject_records_key_ref_fk
    FOREIGN KEY (tenant_id, encryption_key_ref) REFERENCES hci.data_encryption_keys(tenant_id, id);

-- encryption_key_ref joins the application roles' INSERT column list
-- (Wave 1 shape - at Wave 4, gate 4 narrows this further so only
-- hci.write_evidence_payload() can populate it, once a real payload column
-- exists to populate alongside it). tombstoned_at is NOT added to the
-- INSERT grant: a row must never be born already tombstoned, matching
-- system_superseded_at's own INSERT-side exclusion (0005).
REVOKE INSERT ON hci.subject_records FROM hci_app_test_a, hci_app_test_b;
GRANT INSERT (id, tenant_id, person_id, subject_type, subject_id, kind, case_id,
              valid_from, valid_to, supersedes_id, corrected_reason, encryption_key_ref)
  ON hci.subject_records TO hci_app_test_a, hci_app_test_b;

-- ============================================================================
-- Gate 3: hci.tombstone_evidence() + reject_update_delete() extension.
-- H1009 registered per ERROR_CODE_REGISTRY.md (next free code after H1008).
-- ============================================================================
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

CREATE FUNCTION hci.tombstone_evidence(p_record_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hci, pg_temp AS $$
DECLARE v_rows int;
BEGIN
  UPDATE hci.subject_records SET tombstoned_at = now()
   WHERE id = p_record_id AND tombstoned_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  -- Unlike mark_superseded(), no composite FK already proved p_record_id
  -- exists (this function is called directly, not fired by a trigger on a
  -- row with a validated FK to its target) - zero rows here means either
  -- "already tombstoned" or "no such row in any tenant this role can see"
  -- (RLS still applies to the caller's own visibility of what id resolves
  -- to, even though the UPDATE itself runs as owner). Either way, H1009 is
  -- the correct rejection: this function never distinguishes "doesn't
  -- exist" from "already erased" for the same reason a 404-vs-410 distinction
  -- is not offered - both mean "there is nothing further to erase."
  IF v_rows = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'H1009', MESSAGE = 'record already erased (or does not exist)';
  END IF;
END $$;
REVOKE ALL ON FUNCTION hci.tombstone_evidence(uuid) FROM PUBLIC;

DO $$
DECLARE actual text[]; expected text[];
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C") INTO actual
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'hci' AND c.relkind = 'r';
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO expected FROM unnest(ARRAY[
    'persons','tenant_authorizations','subject_lawful_basis_records','sources','source_terms_records',
    'research_workflows','subject_records','data_subject_requests','data_subject_request_events',
    'data_subject_request_targets','identity_candidates','identity_verifications',
    'tenants','app_tenant_bindings','cases','source_snapshots','source_relationships','decisions',
    'data_encryption_keys'
  ]) x;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'hci table inventory drift after 0007; a new table was not classified. actual=% expected=%', actual, expected;
  END IF;
END $$;

COMMIT;
