-- HCI-30 Wave 1 - Key issuance primitive for EVIDENCE/CLAIM creation.
-- Extends 0001-0012; must run after all twelve, before fixtures/harness/
-- negative-test files.
--
-- Real gap found while wiring the first actual create-Evidence/Claim flow
-- (ADR-0034, migration 0012): hci.data_encryption_keys deliberately grants
-- hci_app_test_a/b NOTHING (0007_wave1_crypto_shredding_up.sql:82-83,
-- "not SELECT, not INSERT, nothing") -- correct for erasure (only
-- hci.tombstone_evidence(), SECURITY DEFINER, may touch it), but that same
-- lockdown means NO application-role path exists to mint a NEW key either.
-- The only place a data_encryption_keys row has ever been created is
-- database/fixtures/0001_synthetic.sql, run as the schema owner during
-- setup -- not a real application code path. This is the P1-04 "Key
-- architecture" gap (21_HCI_TOP_TIER_GAP_ANALYSIS.md, 0% done) surfacing
-- concretely: without this, EVIDENCE/CLAIM cannot be created through any
-- application role at all, by design, not by oversight.
--
-- Minimal fix, same shape as hci.tombstone_evidence() (0007): one narrow
-- SECURITY DEFINER function, callable by the app roles, that does exactly
-- one thing -- mint a key row scoped to the CALLER's own tenant (via
-- hci.current_tenant_id(), the same function RLS itself uses, not a
-- caller-supplied tenant_id that could target another tenant) -- and
-- nothing else. This is Wave 1's minimum key-ISSUANCE primitive, not P1-04's
-- full envelope-encryption/KEK-rotation/BYOK architecture, exactly the same
-- "gate 1 vs gates 2-5" scoping ADR-0022's key-rotation runbook already
-- applies. key_material itself is unchanged: still a raw DEK behind the
-- table's own DEFAULT gen_random_bytes(32), not wrapped by anything -- this
-- migration does not touch that, only who may create a row.
--
-- DEFINER-RLS-FAILCLOSED-01 caught a real gap in the first draft: "same
-- shape as tombstone_evidence()" was true for SET search_path but not for
-- tombstone_evidence()'s ALSO-required `SET row_security = off`
-- (0009_wave1_adr0019_hardening_up.sql:204) -- every SECURITY DEFINER
-- function in this schema must fail closed under FORCE RLS with a
-- non-superuser owner, not merely happen to work under the test
-- container's superuser hci_owner. Added below, in the same migration
-- rather than as a follow-up, since the negative suite caught it before
-- this was ever committed.

BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE FUNCTION hci.mint_encryption_key() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = hci, pg_temp AS $$
DECLARE v_tenant_id uuid; v_id uuid;
BEGIN
  v_tenant_id := hci.current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'H1001', MESSAGE = 'tenant authorization is not ACTIVE / not currently valid';
  END IF;
  v_id := gen_random_uuid();
  INSERT INTO hci.data_encryption_keys (id, tenant_id) VALUES (v_id, v_tenant_id);
  RETURN v_id;
END $$;
ALTER FUNCTION hci.mint_encryption_key() SET row_security = off;
REVOKE ALL ON FUNCTION hci.mint_encryption_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hci.mint_encryption_key() TO hci_app_test_a, hci_app_test_b;

COMMIT;
