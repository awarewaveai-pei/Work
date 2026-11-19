-- Down migration for 0082_collection_rate_limit_buckets.sql.
-- Dropping the function before the table matches creation order reversed; either order is safe here
-- since neither references the other via FK/trigger.
BEGIN;
DROP FUNCTION IF EXISTS public.collection_rate_limit_take(text, double precision, double precision, bigint, bigint);
DROP TABLE IF EXISTS public.collection_rate_limit_buckets;
NOTIFY pgrst, 'reload schema';
do $$ begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0082_collection_rate_limit_buckets.sql';
  end if;
end $$;
COMMIT;
