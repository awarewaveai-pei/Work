-- Reverses 0013_wave1_key_issuance_up.sql only. Does not touch 0001-0012.
-- Idempotent: DROP FUNCTION IF EXISTS no-ops if 0013 was never applied.
BEGIN;
SET LOCAL lock_timeout = '3s';
DROP FUNCTION IF EXISTS hci.mint_encryption_key();
COMMIT;
