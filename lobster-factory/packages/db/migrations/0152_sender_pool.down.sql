-- Back to 0151. Revert next-admin first (it writes the pool columns and calls the functions). Refused while any message
-- is 'sending' (the old CHECK has no such status): reconcile those first. The claims, the pool settings, DNS results
-- and warm-up start dates are lost; warmup_stage values stay (w1/w2/w3/full, still valid under the old free-text column).
begin;
set local lock_timeout = '5s';
do $$
begin
  if exists (select 1 from public.co_messages where status = 'sending') then
    raise exception '0152 down: messages are still sending; reconcile them to sent or needs_edit first';
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0152_sender_pool.sql';
  end if;
end $$;
drop function if exists public.co_convert_to_warm(uuid, jsonb);
drop function if exists public.co_begin_send(uuid, uuid, text, jsonb);
drop function if exists public.co_recipient_cap_key(text);
drop table if exists public.co_send_claims;
alter table public.co_messages drop constraint if exists co_messages_status_check;
alter table public.co_messages add constraint co_messages_status_check
  check (status in ('draft','approved','needs_edit','drafted','copied','sent','skipped'));
alter table public.co_sender_accounts drop constraint if exists co_sender_accounts_warmup_stage_check;
alter table public.co_sender_accounts alter column warmup_stage set default 'new';
drop index if exists public.co_sender_accounts_connector_uniq;
alter table public.co_sender_accounts drop column if exists connector_id;
alter table public.co_sender_accounts drop column if exists dns_checked_at;
alter table public.co_sender_accounts drop column if exists dns_status;
alter table public.co_sender_accounts drop column if exists warmup_started_at;
alter table public.co_sender_accounts drop column if exists send_mode;
commit;
