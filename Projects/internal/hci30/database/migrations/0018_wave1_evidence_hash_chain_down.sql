-- Reverses 0018_wave1_evidence_hash_chain_up.sql only. Does not touch
-- 0001-0017. Drop order: trigger before its function, both functions before
-- the table they reference, table before the columns they were computed
-- from.
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP TRIGGER subject_records_content_hash ON hci.subject_records;
DROP FUNCTION hci.compute_subject_record_hash();
DROP FUNCTION hci.verify_subject_record_chain(uuid, uuid);
DROP TABLE hci.subject_record_chain_tips;
ALTER TABLE hci.subject_records
  DROP COLUMN content_hash,
  DROP COLUMN prev_hash;

COMMIT;
