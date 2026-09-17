BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE hci.source_snapshots DROP COLUMN content_epistemic_type;

DROP FUNCTION hci.upsert_discovered_source(uuid, text);

DROP TRIGGER sources_admission_lifecycle ON hci.sources;
DROP FUNCTION hci.enforce_source_admission_transition();

ALTER TABLE hci.sources
  DROP CONSTRAINT sources_tenant_ref_unique,
  DROP COLUMN admission_state;

COMMIT;
