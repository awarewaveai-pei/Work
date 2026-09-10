-- 0069 down: remove only the dedicated video-worker queue introduced by 0069.
begin;
drop table if exists public.media_transcription_jobs;
notify pgrst, 'reload schema';
commit;
