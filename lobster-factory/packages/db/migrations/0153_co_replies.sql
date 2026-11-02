-- 0153: Outbound OS v2 card C4.1 (SPEC §4 0151 row, renumbered: 0151 is media_assets). Reply sync (SPEC §5.6):
-- co_replies and four functions, each one transaction, so a mail is counted once whatever the tick does:
--   co_mark_sent(message, sent_at, gmail message, thread): message drafted/sending -> sent + one 'sent' event + the
--     lead's contact dates (next follow-up = the next unsent follow-up's followup_delay_days). One Gmail message is
--     one co_messages row, and one row has one 'sent' event (unique indexes): a thread holding a first email and a
--     follow-up never marks the unsent follow-up as sent from the first one's message.
--   co_mark_unsent(message, reason): the Gmail draft and every sent copy are gone -> needs_edit, its send claim
--     released (0152), timeline.
--   claiming a reply (insert) stops the lead's follow-ups at once, before any classification (trigger -> co_stop_followups,
--     SPEC I5): next date cleared, unsent follow-ups skipped, one in Gmail drafts flagged for the person to delete.
--   co_apply_reply(reply, type, ...): every side effect of one reply and processed_at, or none. Lead locked first
--     (same order as co_begin_send / co_convert_to_warm). unsubscribe / reject / bounce add suppression + do_not_contact.
--   co_fail_reply(reply, error, max): one failed attempt; the max-th marks it 'unprocessed' (processed, so the sync
--     cursor moves on) and the lead 'replied': someone wrote back, whatever it said.
-- A row exists only for a mail matched to a lead (by sender address or by the thread of a mail we sent): the rest of
-- the inbox is never stored. dedupe_key = the RFC Message-ID, so one reply delivered to two of our mailboxes is one row.
begin;
set local lock_timeout = '5s';

do $$
declare v_dups text;
begin
  select string_agg(message_id::text, ', ') into v_dups
    from (select message_id from public.co_sending_events where event_type = 'sent' and message_id is not null
          group by 1 having count(*) > 1) d;
  if v_dups is not null then
    raise exception '0153: messages with more than one sent event: %. Keep one per message, then apply.', v_dups;
  end if;
end $$;

create table if not exists public.co_replies (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  lead_id            uuid not null references public.co_leads(id) on delete cascade,
  message_id         uuid references public.co_messages(id) on delete set null,
  connector_id       uuid references public.co_connector_accounts(id) on delete set null,
  kind               text not null check (kind in ('reply','bounce')),
  dedupe_key         text not null unique,
  gmail_message_id   text not null,
  gmail_thread_id    text,
  from_email         text not null,
  subject            text,
  reply_text         text not null,
  received_at        timestamptz not null,
  reply_type         text check (reply_type is null or reply_type in ('interested','pricing','more_info','case_study',
                       'wrong_contact','has_vendor','no_need','reject','unsubscribe','bounce','unprocessed')),
  ai_interpretation  text,
  hidden_objection   text,
  next_action        text,
  suggested_response text,
  classified_by      text check (classified_by is null or classified_by in ('rule','ai','person','failed')),
  processed_at       timestamptz,
  process_attempts   int not null default 0,
  last_error         text,
  created_at         timestamptz not null default now()
);
create index if not exists co_replies_org_received on public.co_replies (organization_id, received_at desc);
create index if not exists co_replies_lead on public.co_replies (lead_id);
create index if not exists co_replies_pending on public.co_replies (connector_id) where processed_at is null;

alter table public.co_replies enable row level security;
drop policy if exists co_replies_service_role on public.co_replies;
create policy co_replies_service_role on public.co_replies to service_role using (true) with check (true);
revoke all on public.co_replies from public, anon, authenticated;
grant all on public.co_replies to service_role;

create unique index if not exists co_sending_events_one_sent
  on public.co_sending_events (message_id) where event_type = 'sent' and message_id is not null;
create unique index if not exists co_sending_events_sent_gmail_message
  on public.co_sending_events ((metadata->>'gmailMessageId')) where event_type = 'sent' and metadata ? 'gmailMessageId';
create index if not exists co_sending_events_thread
  on public.co_sending_events ((metadata->>'threadId')) where metadata ? 'threadId';

create or replace function public.co_mark_sent(p_message_id uuid, p_sent_at timestamptz, p_gmail_message_id text,
  p_thread_id text) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare
  v_msg record;
  v_day date := (p_sent_at at time zone 'Asia/Taipei')::date;
  v_next date;
begin
  select m.id, m.lead_id, m.organization_id into v_msg from public.co_messages m where m.id = p_message_id;
  if not found then return false; end if;
  perform 1 from public.co_leads where id = v_msg.lead_id for update;
  update public.co_messages set status = 'sent', sent_at = p_sent_at
   where id = p_message_id and status in ('drafted','sending');
  if not found then return false; end if;
  insert into public.co_sending_events (organization_id, lead_id, message_id, stream_type, provider, sender_account_id,
                                        event_type, provider_event_id, metadata)
  select v_msg.organization_id, v_msg.lead_id, p_message_id, 'cold', 'gmail', e.sender_account_id, 'sent',
         p_gmail_message_id, jsonb_build_object('gmailMessageId', p_gmail_message_id, 'threadId', p_thread_id)
    from (select 1) z
    left join lateral (select d.sender_account_id from public.co_sending_events d
                        where d.message_id = p_message_id and d.event_type = 'draft_created'
                        order by d.created_at desc limit 1) e on true;
  select v_day + f.followup_delay_days into v_next
    from public.co_messages f
   where f.lead_id = v_msg.lead_id and f.output_type = 'followup' and f.status in ('draft','approved','drafted')
     and f.followup_delay_days is not null
   order by f.followup_delay_days, f.created_at limit 1;
  update public.co_leads l
     set status = case when l.status in ('new','inbox_pending','analyzed','qualified','message_generated','approved',
                                         'drafted','sent','followup_due','no_reply') then 'sent' else l.status end,
         first_contact_date = coalesce(l.first_contact_date, v_day),
         last_contact_date = greatest(coalesce(l.last_contact_date, v_day), v_day),
         next_followup_date = case when l.do_not_contact or l.status in ('replied','proposal_sent','meeting_booked','warm',
                                     'synced_to_fluentcrm','nurturing','customer','lost','do_not_contact','unsubscribed')
                                   then null else v_next end,
         updated_at = now()
   where l.id = v_msg.lead_id;
  insert into public.co_timeline_events (organization_id, lead_id, event_type, title, metadata)
  values (v_msg.organization_id, v_msg.lead_id, 'sent', '信已寄出',
          jsonb_build_object('message_id', p_message_id, 'gmailMessageId', p_gmail_message_id));
  return true;
exception when unique_violation then
  return false;  -- this Gmail message already belongs to another row: the whole call rolls back
end $$;

create or replace function public.co_mark_unsent(p_message_id uuid, p_reason text) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare v_msg record;
begin
  select m.id, m.lead_id, m.organization_id into v_msg from public.co_messages m where m.id = p_message_id;
  if not found then return false; end if;
  perform 1 from public.co_leads where id = v_msg.lead_id for update;
  update public.co_messages set status = 'needs_edit' where id = p_message_id and status in ('drafted','sending');
  if not found then return false; end if;
  update public.co_send_claims set released_at = now() where message_id = p_message_id and released_at is null;
  insert into public.co_timeline_events (organization_id, lead_id, event_type, title, description, metadata)
  values (v_msg.organization_id, v_msg.lead_id, 'draft_missing', 'Gmail 找不到這封草稿，也沒有寄出紀錄', p_reason,
          jsonb_build_object('message_id', p_message_id));
  return true;
end $$;

-- Follow-ups stop for a lead that wrote back (SPEC I5), the moment the reply is claimed (trigger below), before any
-- classification. A follow-up already in Gmail drafts ('drafted') is skipped too, with a timeline line asking the person
-- to delete that draft: code never touches a Gmail draft. 'sending' is left to finish. Caller holds the lead lock.
create or replace function public.co_stop_followups(p_lead_id uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_drafted int;
  v_org uuid;
begin
  select count(*) into v_drafted from public.co_messages
   where lead_id = p_lead_id and output_type = 'followup' and status = 'drafted';
  update public.co_messages set status = 'skipped'
   where lead_id = p_lead_id and output_type = 'followup' and status in ('draft','approved','drafted');
  update public.co_leads set next_followup_date = null, updated_at = now() where id = p_lead_id
  returning organization_id into v_org;
  if v_drafted > 0 then
    insert into public.co_timeline_events (organization_id, lead_id, event_type, title)
    values (v_org, p_lead_id, 'followup_draft_left', format('對方已回信：Gmail 草稿匣裡還有 %s 封追蹤信，請刪掉不要寄', v_drafted));
  end if;
end $$;

create or replace function public.co_replies_stop_followups() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform 1 from public.co_leads where id = new.lead_id for update;
  perform public.co_stop_followups(new.lead_id);
  return new;
end $$;
drop trigger if exists co_replies_stop_followups on public.co_replies;
create trigger co_replies_stop_followups after insert on public.co_replies
  for each row execute function public.co_replies_stop_followups();

create or replace function public.co_apply_reply(p_reply_id uuid, p_reply_type text, p_suggested text,
  p_interpretation text, p_classified_by text) returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  v_r record;
  v_lead record;
  v_reason text;
  v_title text;
  v_event text;
begin
  select r.id, r.lead_id, r.organization_id, r.message_id, r.kind, r.gmail_message_id
    into v_r from public.co_replies r where r.id = p_reply_id;
  if not found then return 'missing'; end if;
  select l.id, l.email into v_lead from public.co_leads l where l.id = v_r.lead_id for update;
  perform 1 from public.co_replies where id = p_reply_id and processed_at is null for update;
  if not found then return 'already'; end if;
  if (v_r.kind = 'bounce') <> (p_reply_type = 'bounce') then
    raise exception 'co_apply_reply: a % row cannot be classified %', v_r.kind, p_reply_type;
  end if;

  update public.co_replies set reply_type = p_reply_type, suggested_response = p_suggested,
         ai_interpretation = p_interpretation, classified_by = p_classified_by, processed_at = now(), last_error = null
   where id = p_reply_id;
  perform public.co_stop_followups(v_r.lead_id);

  v_reason := case p_reply_type when 'bounce' then 'hard_bounce' when 'unsubscribe' then 'unsubscribe'
                                when 'reject' then 'manual_opt_out' end;
  if v_reason is not null and nullif(btrim(v_lead.email), '') is not null and not exists (
       select 1 from public.co_suppression_list s
        where s.organization_id is not distinct from v_r.organization_id and s.email = lower(btrim(v_lead.email))
          and s.reason = v_reason) then
    insert into public.co_suppression_list (organization_id, email, lead_id, reason, source, applies_to, scope, evidence)
    values (v_r.organization_id, lower(btrim(v_lead.email)), v_r.lead_id, v_reason, 'gmail_sync', 'all', 'email',
            jsonb_build_object('reply_id', p_reply_id, 'gmailMessageId', v_r.gmail_message_id));
  end if;

  if p_reply_type = 'bounce' then
    update public.co_leads set do_not_contact = true, do_not_contact_reason = coalesce(do_not_contact_reason, 'hard_bounce'),
           updated_at = now()
     where id = v_r.lead_id;
  else
    update public.co_leads l
       set status = case
             when p_reply_type = 'unsubscribe' then 'unsubscribed'
             when p_reply_type = 'reject' then 'do_not_contact'
             when l.status in ('proposal_sent','meeting_booked','warm','synced_to_fluentcrm','nurturing','customer',
                               'do_not_contact','unsubscribed') then l.status
             else 'replied' end,
           consent_status = case
             when p_reply_type = 'unsubscribe' then 'unsubscribed'
             when p_reply_type = 'reject' then 'do_not_contact'
             when l.consent_status in ('unknown','legitimate_interest') then 'replied'
             else l.consent_status end,
           consent_at = case when l.consent_status in ('unknown','legitimate_interest') or p_reply_type in ('unsubscribe','reject')
                             then now() else l.consent_at end,
           do_not_contact = l.do_not_contact or p_reply_type in ('unsubscribe','reject'),
           do_not_contact_reason = case when p_reply_type in ('unsubscribe','reject') and not l.do_not_contact
                                        then p_reply_type else l.do_not_contact_reason end,
           updated_at = now()
     where l.id = v_r.lead_id;
  end if;

  v_event := case p_reply_type when 'bounce' then 'hard_bounced' when 'unsubscribe' then 'unsubscribed' else 'replied' end;
  insert into public.co_sending_events (organization_id, lead_id, message_id, stream_type, provider, event_type,
                                        provider_event_id, metadata)
  values (v_r.organization_id, v_r.lead_id, v_r.message_id, 'cold', 'gmail', v_event, v_r.gmail_message_id,
          jsonb_build_object('reply_id', p_reply_id, 'reply_type', p_reply_type));
  v_title := case p_reply_type when 'bounce' then '退信：這個地址收不到信' when 'unsubscribe' then '對方要求退訂'
                               when 'reject' then '對方拒絕' else '對方回信了' end;
  insert into public.co_timeline_events (organization_id, lead_id, event_type, title, metadata)
  values (v_r.organization_id, v_r.lead_id, v_event, v_title,
          jsonb_build_object('reply_id', p_reply_id, 'reply_type', p_reply_type));
  return 'applied';
end $$;

create or replace function public.co_fail_reply(p_reply_id uuid, p_error text, p_max int) returns int
language plpgsql set search_path = public, pg_temp as $$
declare
  v_r record;
  v_attempts int;
begin
  select r.id, r.lead_id, r.organization_id into v_r from public.co_replies r where r.id = p_reply_id;
  if not found then return -1; end if;
  perform 1 from public.co_leads where id = v_r.lead_id for update;
  update public.co_replies set process_attempts = process_attempts + 1, last_error = left(p_error, 500)
   where id = p_reply_id and processed_at is null
  returning process_attempts into v_attempts;
  if v_attempts is null then return -1; end if;
  if v_attempts >= p_max then
    update public.co_replies set reply_type = 'unprocessed', classified_by = 'failed', processed_at = now()
     where id = p_reply_id;
    perform public.co_stop_followups(v_r.lead_id);
    update public.co_leads set status = 'replied', updated_at = now()
     where id = v_r.lead_id and status in ('new','inbox_pending','analyzed','qualified','message_generated','approved',
                                           'drafted','sent','followup_due','no_reply');
    insert into public.co_timeline_events (organization_id, lead_id, event_type, title, description, metadata)
    values (v_r.organization_id, v_r.lead_id, 'reply_processing_failed', '收到回信，但系統處理失敗：到回覆頁重試',
            left(p_error, 500), jsonb_build_object('reply_id', p_reply_id));
  end if;
  return v_attempts;
end $$;

-- The sync cursor in co_connector_accounts.settings.gmail_sync, merged in one statement: a tick and the 補掃 button
-- write the same jsonb, and a read-then-write would drop the other's value. A null in the patch removes that key;
-- p_clear_rescan removes rescan_days only while it still holds that value (a newer press survives).
create or replace function public.co_merge_gmail_sync(p_connector_id uuid, p_patch jsonb, p_clear_rescan int) returns void
language sql set search_path = public, pg_temp as $$
  update public.co_connector_accounts
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{gmail_sync}',
           (select case when p_clear_rescan is not null and (m->>'rescan_days')::int = p_clear_rescan then m - 'rescan_days' else m end
              from (select jsonb_strip_nulls(coalesce(settings->'gmail_sync', '{}'::jsonb) || p_patch) as m) x)),
         updated_at = now()
   where id = p_connector_id;
$$;

revoke all on function public.co_merge_gmail_sync(uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.co_merge_gmail_sync(uuid, jsonb, int) to service_role;
revoke all on function public.co_replies_stop_followups() from public, anon, authenticated;
revoke all on function public.co_mark_sent(uuid, timestamptz, text, text), public.co_mark_unsent(uuid, text),
  public.co_stop_followups(uuid), public.co_apply_reply(uuid, text, text, text, text), public.co_fail_reply(uuid, text, int)
  from public, anon, authenticated;
grant execute on function public.co_mark_sent(uuid, timestamptz, text, text), public.co_mark_unsent(uuid, text),
  public.co_stop_followups(uuid), public.co_apply_reply(uuid, text, text, text, text), public.co_fail_reply(uuid, text, int)
  to service_role;

commit;
