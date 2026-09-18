-- 0089 — links a cs_knowledge_folders row to the Cognitive OS Project it sends into (operator:
-- "為什麼不延續需搜尋時新增的資料夾", 2026-09-18). Cognitive OS's own data model has no folder/tag/
-- collection concept below a Project (checked directly against
-- Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py's CreateSourceRequest fields
-- and its /projects/{id}/sources routes: title/media_type/data_classification/content/doi/authors/
-- venue/published_at, nothing else) -- so "one Project per organization" was the only unit available
-- until now, and every organization's imports piled into one undifferentiated Project regardless of
-- how many distinct research topics/folders it actually contained.
--
-- Same shape and same reasoning as migration 0087's organizations-level Cognitive OS link, one level
-- down the hierarchy: an id-anchored pointer, not a name-derived match, for the identical reason
-- lib/cognitive-os/import-sources.ts's ensureProjectForOrganization was rewritten on 2026-09-18 (a
-- critic-caught cross-tenant merge risk from matching Projects by a human-editable display name
-- instead of an immutable id). A folder's own `name` changes routinely (there is a dedicated
-- 重新命名 button right next to it in ClientHubTabs.tsx), which would make name-based matching even
-- MORE fragile here than it was for organizations -- a stored id sidesteps that entirely.
--
-- Nullable, no backfill: no folder has ever been sent to Cognitive OS before this column exists.
--
-- Not a foreign key: this uuid is Cognitive OS's own Project id, a separate product's identifier
-- space (same cross-instance-uuid reasoning as 0087/0088's own header comments -- no real FK can
-- span two separate systems).
--
-- No index: the only planned access pattern is a point read/write against an already-identified
-- folder row (lib/cognitive-os/import-sources.ts's importFolderSources resolves by folder id via
-- lib/kb/folders.ts's getFolderCognitiveOsProjectId/setFolderCognitiveOsProjectId, never scans
-- folders by project id).
--
-- APPLY WITH (Low risk -- additive, nullable, no existing query/RPC touched):
--   node scripts/apply-db-migration.mjs 0089
-- Down migration: packages/db/scripts/0089_kb_folder_cognitive_os_link_down.sql

BEGIN;

ALTER TABLE public.cs_knowledge_folders
  ADD COLUMN IF NOT EXISTS cognitive_os_project_id uuid;

COMMIT;
