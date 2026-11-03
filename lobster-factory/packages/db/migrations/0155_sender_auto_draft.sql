-- 0155: Outbound OS v2 (operator 2026-11-03): the pipeline may draft for a draft-mode mailbox the operator switched on.
-- auto_draft lives on the mailbox, not in the Gmail connector's settings (an OAuth reconnect rewrites those). It never
-- lets a mailbox send: send-adapter reads only send_mode='auto' (SPEC I10). Additive; existing rows default false.
begin;
set local lock_timeout = '5s';
alter table public.co_sender_accounts add column if not exists auto_draft boolean not null default false;
comment on column public.co_sender_accounts.auto_draft is
  'Draft-mode mailbox: the outreach pipeline creates its Gmail drafts (a person sends). Ignored for send_mode=auto.';
commit;
