-- 0087 — links a cs_knowledge_sources row to the Cognitive OS Project it has been sent to (operator:
-- "送去後，我再選擇工具" — closing the /ops/collect -> Cognitive OS -> Knowledge loop, 2026-09-18).
--
-- Written by lib/cognitive-os/import-sources.ts's importOrganizationSources() right after each
-- successful POST .../sources call to Cognitive OS (ai_lego/apps/api/main.py create_source) --
-- never guessed/backfilled, since the only source of truth for "was this actually imported" is that
-- HTTP call's own success, not anything derivable from data already in this table.
--
-- Nullable, no backfill: every row imported before today has never made that call, so NULL correctly
-- means "not sent yet", not "sent, status unknown".
--
-- cognitive_os_project_id is the Cognitive OS Project's own uuid (ai_lego's project_id, a DIFFERENT
-- id space from anything in this database -- typed uuid, not a foreign key, since Cognitive OS's
-- Postgres is a separate database entirely and cannot be referenced by a real FK constraint; the two
-- systems are joined only by this value. uuid (not text) because the value is always a real UUID at
-- the source (ai_lego/core/domain/project.py + source.py both require_uuid() it, db-expert review
-- 2026-09-18) and this column is empty today -- changing text->uuid after real rows exist would force
-- a full-table ACCESS EXCLUSIVE rewrite; free now, expensive later.
--
-- APPLY WITH (Low risk -- additive, nullable, no existing query/RPC touched):
--   node scripts/apply-db-migration.mjs 0087
-- Down migration: packages/db/scripts/0087_kb_cognitive_os_link_down.sql

BEGIN;

ALTER TABLE public.cs_knowledge_sources
  ADD COLUMN IF NOT EXISTS cognitive_os_project_id uuid,
  ADD COLUMN IF NOT EXISTS cognitive_os_imported_at timestamptz;

COMMIT;
