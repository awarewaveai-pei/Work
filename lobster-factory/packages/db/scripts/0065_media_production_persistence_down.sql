-- 0065 down: only for an isolated rehearsal/rollback before any dependent data exists.
drop table if exists public.media_outcome_snapshots;
drop table if exists public.media_delivery_attempts;
drop table if exists public.media_releases;
drop table if exists public.media_qa_reports;

do $$ begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0065_media_production_persistence.sql';
  end if;
end $$;
