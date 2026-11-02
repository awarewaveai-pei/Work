-- Back to 0152. Revert next-admin first (it reads co_replies and calls the functions). The stored replies and their
-- classifications are lost; the events, suppression rows, timeline entries and lead changes they caused stay.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0153_co_replies.sql';
  end if;
end $$;
drop function if exists public.co_merge_gmail_sync(uuid, jsonb, int);
drop function if exists public.co_fail_reply(uuid, text, int);
drop function if exists public.co_apply_reply(uuid, text, text, text, text);
drop table if exists public.co_replies;
drop function if exists public.co_replies_stop_followups();
drop function if exists public.co_stop_followups(uuid);
drop function if exists public.co_mark_unsent(uuid, text);
drop function if exists public.co_mark_sent(uuid, timestamptz, text, text);
drop index if exists public.co_sending_events_thread;
drop index if exists public.co_sending_events_sent_gmail_message;
drop index if exists public.co_sending_events_one_sent;
commit;
