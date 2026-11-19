-- 0069 down: remove only the dedicated video-worker queue introduced by 0069.
begin;
drop table if exists public.media_transcription_jobs;
notify pgrst, 'reload schema';
do $$ begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0069_media_transcription_jobs.sql';
  end if;
end $$;
commit;
