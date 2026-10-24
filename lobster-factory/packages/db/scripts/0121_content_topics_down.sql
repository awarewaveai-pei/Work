-- Back to 0120. Refused once a topic exists or a schedule uses every_5m: topics are operator work (approvals, drafts,
-- published links) and a schedule row would break the restored check, so after that the fix is forward.
-- content_trends is a cache of public trending items and is dropped with its rows. Revert the app first, then this.
begin;
set local lock_timeout = '5s';
-- held to commit: no topic or every_5m row can arrive between the check and the drop
lock table public.content_topics, public.client_schedules in access exclusive mode;
do $$
begin
  if exists (select 1 from public.content_topics) then
    raise exception 'content_topics has rows: 0121 is rolled forward, not down';
  end if;
  if exists (select 1 from public.client_schedules where frequency = 'every_5m') then
    raise exception 'client_schedules uses every_5m: 0121 is rolled forward, not down';
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0121_content_topics.sql';
  end if;
end $$;
alter table public.client_schedules drop constraint if exists client_schedules_frequency_check;
alter table public.client_schedules
  add constraint client_schedules_frequency_check check (frequency in ('daily', 'weekly'));
drop function if exists public.content_topics_start(uuid, uuid, integer, date, integer);
drop function if exists public.content_trends_top(text, date, integer);
drop table if exists public.content_topics;
drop table if exists public.content_trends;
notify pgrst, 'reload schema';
commit;
