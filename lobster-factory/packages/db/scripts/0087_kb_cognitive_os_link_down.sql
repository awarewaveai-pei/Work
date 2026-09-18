BEGIN;

ALTER TABLE public.cs_knowledge_sources
  DROP COLUMN IF EXISTS cognitive_os_project_id,
  DROP COLUMN IF EXISTS cognitive_os_imported_at;

COMMIT;
