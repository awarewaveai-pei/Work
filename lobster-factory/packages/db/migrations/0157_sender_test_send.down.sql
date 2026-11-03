-- Back to 0156. Revert next-admin first (send-adapter and the senders route read the columns).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0157_sender_test_send.sql';
  end if;
end $$;
alter table public.co_sender_accounts drop constraint if exists co_sender_accounts_test_recipients_max;
alter table public.co_sender_accounts drop column if exists test_recipients;
alter table public.co_sender_accounts drop column if exists test_send_until;
notify pgrst, 'reload schema';
commit;
