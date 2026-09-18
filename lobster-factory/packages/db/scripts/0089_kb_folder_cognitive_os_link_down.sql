-- Down migration for 0089. Reversible ONLY while nothing reads/writes this column -- once
-- ensureProjectForFolder (lib/cognitive-os/import-sources.ts) ships and runs for real, this becomes
-- a breaking rollback (app code would write to a column that no longer exists) unless that code path
-- is undeployed first. Same caveat 0087/0088's own down-scripts already live with.

BEGIN;

ALTER TABLE public.cs_knowledge_folders
  DROP COLUMN IF EXISTS cognitive_os_project_id;

COMMIT;
