-- Down migration for 0080_collection_url_state.sql.
--
-- Drops the per-URL fetch-state cache. What is lost: every conditional-GET etag/last-modified and
-- the cached discovered-links used to survive a 304. Nothing else depends on this table -- dropping
-- it just means the NEXT crawl of any URL does a full unconditional fetch again, same as before this
-- migration existed. No collected document, chunk, or source row is touched.
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0080_collection_url_state_down.sql

BEGIN;

DROP TABLE IF EXISTS public.collection_url_state;

NOTIFY pgrst, 'reload schema';

COMMIT;
