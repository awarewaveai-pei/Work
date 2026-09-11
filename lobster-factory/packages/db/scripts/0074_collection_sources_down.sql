-- Down migration for 0074_collection_sources.sql.
--
-- Drops the source list and the run→source link. What is lost is the configuration itself: which
-- sources a tenant had chosen, and who approved them. Collected documents are untouched — they live
-- in the knowledge base and never depended on this table.
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0074_collection_sources_down.sql

BEGIN;

DROP INDEX IF EXISTS public.idx_collection_runs_source;
ALTER TABLE public.collection_runs DROP COLUMN IF EXISTS source_id;

DROP TABLE IF EXISTS public.collection_sources;

NOTIFY pgrst, 'reload schema';

COMMIT;
