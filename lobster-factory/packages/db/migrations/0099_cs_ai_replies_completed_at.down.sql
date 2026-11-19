-- Down migration for 0099_cs_ai_replies_completed_at.sql
BEGIN;

DROP INDEX IF EXISTS public.cs_ai_replies_unfinished_idx;
ALTER TABLE public.cs_ai_replies DROP COLUMN IF EXISTS completed_at;

do $$ begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0099_cs_ai_replies_completed_at.sql';
  end if;
end $$;
COMMIT;
