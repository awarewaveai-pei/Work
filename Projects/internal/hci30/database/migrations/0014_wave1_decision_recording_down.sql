-- Reverses 0014_wave1_decision_recording_up.sql only. Does not touch
-- 0001-0013. Idempotent: DROP FUNCTION IF EXISTS no-ops if 0014 was never
-- applied.
BEGIN;
SET LOCAL lock_timeout = '3s';
DROP FUNCTION IF EXISTS hci.record_decision(uuid, uuid, text, text);
COMMIT;
