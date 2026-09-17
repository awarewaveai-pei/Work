-- Down migration for 0085_kb_folders.sql.
-- Deleting the folders table also deletes every folder assignment (folder_id FK CASCADEs on the
-- function, but the column itself just goes back to not existing) — documents themselves are never
-- touched, matching K2h's own rollback row ("移除資料夾過濾,退回平面").

BEGIN;

DROP FUNCTION IF EXISTS public.cs_folder_move(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.cs_folder_descendants(uuid, uuid);

ALTER TABLE public.cs_knowledge_sources DROP COLUMN IF EXISTS folder_id;

DROP TABLE IF EXISTS public.cs_knowledge_folders;

NOTIFY pgrst, 'reload schema';

COMMIT;
