-- 0157: Outbound OS v2 (operator 2026-11-03): a draft-mode mailbox (the main free mailbox) may auto-send for a limited time,
-- but only to a short list of test recipients (the operator's own addresses). test_send_until is compared with now() when
-- read (send-adapter), so an expired window needs no job to close it. It never puts the mailbox in the pool: inPool still
-- reads send_mode='auto' only (SPEC I10). Additive; existing rows are off (null) with an empty list.
begin;
set local lock_timeout = '5s';
alter table public.co_sender_accounts add column if not exists test_send_until timestamptz;
alter table public.co_sender_accounts add column if not exists test_recipients text[] not null default '{}';
alter table public.co_sender_accounts drop constraint if exists co_sender_accounts_test_recipients_max;
alter table public.co_sender_accounts add constraint co_sender_accounts_test_recipients_max
  check (coalesce(array_length(test_recipients, 1), 0) <= 10);
comment on column public.co_sender_accounts.test_send_until is
  'Draft-mode mailbox: until this instant its queued mail to test_recipients is sent automatically. Null or past = off. Ignored for send_mode=auto.';
comment on column public.co_sender_accounts.test_recipients is
  'Lower-case addresses (max 10) the test-send window may send to; mail to anyone else stays a Gmail draft.';
notify pgrst, 'reload schema';
commit;
