-- Back to 0157: co_begin_send as 0152 defined it (auto mailboxes only).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0158_begin_send_test_window.sql';
  end if;
end $$;

create or replace function public.co_begin_send(p_message_id uuid, p_sender_account_id uuid, p_recipient_email text,
  p_caps jsonb) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare
  v_email   text := lower(btrim(p_recipient_email));
  v_mailbox int  := (p_caps->>'mailbox')::int;
  v_sdcap   int  := (p_caps->>'sender_domain')::int;
  v_rcap    int  := (p_caps->>'recipient_30d')::int;
  v_today   timestamptz := date_trunc('day', now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei';
  v_msg     record;
  v_sender  record;
  v_lead    record;
  v_sdomain text;
  v_rkey    text;
  v_rdomain text;
  v_n       int;
  k         bigint;
begin
  if v_mailbox is null or v_sdcap is null or v_rcap is null then
    raise exception 'co_begin_send: caps must give mailbox, sender_domain and recipient_30d' using errcode = '22023';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'co_begin_send: recipient is not an email address' using errcode = '22023';
  end if;

  select id, lead_id, organization_id into v_msg from public.co_messages where id = p_message_id;
  if not found then return false; end if;
  select id, organization_id, email, is_active, send_mode, health_status, connector_id into v_sender
    from public.co_sender_accounts where id = p_sender_account_id;
  -- no connector = no token of its own to send with (unlinked when the connector was reconnected to another account)
  if not found or not v_sender.is_active or v_sender.send_mode <> 'auto' or v_sender.health_status <> 'healthy'
     or v_sender.connector_id is null
     or v_sender.organization_id is distinct from v_msg.organization_id then
    return false;
  end if;

  -- The lead row lock: co_convert_to_warm takes the same one, so the checks below hold until commit.
  -- Statuses = lib/outreach/cold-gate.ts NO_COLD_STATUSES (+ meta_lead_ad consent, its isWarm).
  select id, organization_id, name, email, status, do_not_contact, consent_status, consent_source into v_lead
    from public.co_leads where id = v_msg.lead_id for update;
  if not found or v_lead.do_not_contact
     or v_lead.status in ('replied','proposal_sent','meeting_booked','warm','synced_to_fluentcrm','nurturing','customer',
                          'unsubscribed','do_not_contact')
     or v_lead.consent_status in ('unsubscribed','do_not_contact')
     or coalesce(v_lead.consent_source, '') like 'meta_lead_ad%'
     or lower(btrim(coalesce(v_lead.email, ''))) <> v_email then
    return false;
  end if;
  -- Same match as lib/outreach/normalize.ts isSuppressed, for the lead's organization, cold and all lists.
  v_rdomain := regexp_replace(split_part(v_email, '@', 2), '^www\.', '');
  if exists (
       select 1 from public.co_suppression_list s
        where s.organization_id is not distinct from v_lead.organization_id and s.applies_to in ('cold','all')
          and (s.scope = 'global' or lower(btrim(s.email)) = v_email
               or regexp_replace(lower(btrim(s.domain)), '^www\.', '') = v_rdomain
               or (s.scope = 'company' and nullif(lower(btrim(v_lead.name)), '') = lower(btrim(s.company_name))))) then
    return false;
  end if;

  v_sdomain := split_part(lower(btrim(v_sender.email)), '@', 2);
  v_rkey := public.co_recipient_cap_key(v_email);
  for k in select x from unnest(array[
             hashtextextended('co_send:sender:' || v_sdomain, 0),
             hashtextextended('co_send:recipient:' || coalesce(v_lead.organization_id::text, 'agency') || ':' || v_rkey, 0)]) x
           order by x loop
    perform pg_advisory_xact_lock(k);
  end loop;

  select count(*) into v_n from public.co_send_claims
   where sender_account_id = p_sender_account_id and released_at is null and claimed_at >= v_today;
  if v_n >= v_mailbox then return false; end if;
  select count(*) into v_n from public.co_send_claims
   where sender_domain = v_sdomain and released_at is null and claimed_at >= v_today;
  if v_n >= v_sdcap then return false; end if;
  select count(*) into v_n from public.co_send_claims
   where organization_id is not distinct from v_lead.organization_id and recipient_key = v_rkey
     and released_at is null and claimed_at >= now() - interval '30 days';
  if v_n >= v_rcap then return false; end if;

  begin
    insert into public.co_send_claims (organization_id, sender_account_id, message_id, sender_domain, recipient_key)
    values (v_lead.organization_id, p_sender_account_id, p_message_id, v_sdomain, v_rkey);
    update public.co_messages set status = 'sending' where id = p_message_id and status = 'drafted';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      raise exception 'not drafted' using errcode = 'P0152';  -- rolls the claim back with the block
    end if;
  exception
    when unique_violation then return false;
    when sqlstate 'P0152' then return false;
  end;
  return true;
end $$;

notify pgrst, 'reload schema';
commit;
