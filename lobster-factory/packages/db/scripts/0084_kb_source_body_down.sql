BEGIN;

ALTER TABLE public.cs_knowledge_sources
  DROP COLUMN IF EXISTS body;

do $$ begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0084_kb_source_body.sql';
  end if;
end $$;
COMMIT;
