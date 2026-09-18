-- Down migration for 0088. Reversible ONLY while nothing reads/writes these columns (db-expert
-- review 2026-09-18) -- once lib/hci/import-sources.ts's importOrganizationSourcesToHci() ships and
-- runs for real, this becomes a breaking rollback (app code would write to columns that no longer
-- exist) unless that code path is undeployed first. Same caveat 0087's own down-script already lives
-- with silently today for cognitive_os_project_id.

BEGIN;

ALTER TABLE public.cs_knowledge_sources
  DROP COLUMN IF EXISTS hci_source_id,
  DROP COLUMN IF EXISTS hci_imported_at;

COMMIT;
