BEGIN;

ALTER TABLE public.cs_knowledge_sources
  DROP COLUMN IF EXISTS cognitive_os_project_id,
  DROP COLUMN IF EXISTS cognitive_os_imported_at;

do $$ begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0087_kb_cognitive_os_link.sql';
  end if;
end $$;
COMMIT;
