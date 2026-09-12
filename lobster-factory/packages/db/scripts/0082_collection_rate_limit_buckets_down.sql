-- Down migration for 0082_collection_rate_limit_buckets.sql.
-- Dropping the function before the table matches creation order reversed; either order is safe here
-- since neither references the other via FK/trigger.
BEGIN;
DROP FUNCTION IF EXISTS public.collection_rate_limit_take(text, double precision, double precision, bigint, bigint);
DROP TABLE IF EXISTS public.collection_rate_limit_buckets;
NOTIFY pgrst, 'reload schema';
COMMIT;
