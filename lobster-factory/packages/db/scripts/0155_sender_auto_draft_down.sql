-- Back to 0154. Revert next-admin first (pipeline-store and sender.ts read the column).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0155_sender_auto_draft.sql';
  end if;
end $$;
alter table public.co_sender_accounts drop column if exists auto_draft;
commit;
