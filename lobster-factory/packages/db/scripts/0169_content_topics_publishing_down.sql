-- Back to 0168: no 'publishing'. Revert the app first, then this -- REQUIRED, not optional: the pre-0169 app breaks on a
-- 'publishing' row (TopicsBoard's status table has no entry for it; store.ts NEXT has no key). A topic still
-- 'publishing' is moved to 'failed' with a reason (its artifacts, publish steps included, are kept): part of it may
-- already be out, so a person checks artifacts.publish -- YouTube taken down / the article back to draft by hand
-- (plan §9) -- before 重試. Re-runnable: a second run updates nothing.
begin;
set local lock_timeout = '5s';

update public.content_topics
   set status = 'failed', version = version + 1, updated_at = now(),
       last_error = '發布到一半時系統回退（0169 down）：先看 artifacts.publish 哪些已送出，再決定重試'
 where status = 'publishing';

alter table public.content_topics drop constraint if exists content_topics_status_check;
alter table public.content_topics add constraint content_topics_status_check
  check (status in ('proposed', 'approved', 'rejected', 'generating', 'drafted', 'waiting_video', 'embedded',
                    'reviewed', 'scheduled', 'published', 'failed'));

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0169_content_topics_publishing.sql';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
