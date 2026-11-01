-- 0152: Outbound OS v2 card C11.2 (SPEC §4 0152). The sender pool: pool columns on co_sender_accounts, the send claims,
-- and two functions that lock the lead row, so a send and a warm conversion never interleave:
--   co_begin_send(message, sender, recipient email, caps): lead FOR UPDATE -> re-check warm / do-not-contact /
--     suppression -> advisory locks on the sender domain and the recipient key (sorted, no deadlock) -> three caps from
--     unreleased claims (mailbox today, sender domain today, recipient 30 days; today = the Asia/Taipei day) -> claim
--     + message drafted->sending. false = full, taken first, or the lead may no longer be mailed. Caps come from the
--     caller (stage caps, lib/outreach/sender-pool.ts C8.1): this function only counts.
--   co_convert_to_warm(lead, consent): lead FOR UPDATE -> warm + consent, no follow-up date -> the lead's unsent cold
--     mail (draft/approved/drafted) skipped + timeline cold_cancelled. A message already 'sending' is left to finish.
-- The recipient cap is per address, not per domain, on a free-mail domain: otherwise every Gmail recipient shares two
-- mails in 30 days. co_recipient_cap_key holds the free-mail list, kept equal to lib/outreach/research-extract.ts
-- FREE_MAIL by lib/outreach/__tests__/free-mail-parity.test.ts (it reads the newest migration defining the function).
-- A claim is released (released_at) only when reconciliation proves the mail was not sent; sender-health deletes claims
-- older than 31 days. daily_sent_count stays for display; caps are counted from claims.
begin;
set local lock_timeout = '5s';

alter table public.co_sender_accounts add column if not exists send_mode text not null default 'draft'
  check (send_mode in ('draft','auto'));
alter table public.co_sender_accounts add column if not exists warmup_started_at date;
alter table public.co_sender_accounts add column if not exists dns_status jsonb;
alter table public.co_sender_accounts add column if not exists dns_checked_at timestamptz;
alter table public.co_sender_accounts add column if not exists connector_id uuid
  references public.co_connector_accounts(id) on delete set null;

-- Existing mailboxes are not warming up: 'full'. A pool mailbox starts at w1 (the OAuth callback sets it).
update public.co_sender_accounts set warmup_stage = 'full' where warmup_stage not in ('w1','w2','w3','full');
alter table public.co_sender_accounts alter column warmup_stage set default 'full';
alter table public.co_sender_accounts drop constraint if exists co_sender_accounts_warmup_stage_check;
alter table public.co_sender_accounts add constraint co_sender_accounts_warmup_stage_check
  check (warmup_stage in ('w1','w2','w3','full'));

-- The Gmail connector a mailbox was connected through, by its email and organization (the newest when reconnected);
-- one mailbox per connector (a duplicate mailbox row keeps none: the oldest takes it). The connector holds one Google
-- token, so two mailbox rows on it would send one account's mail as the other; the unique index keeps that closed.
with pick as (
  select distinct on (c.id) s.id as sender_id, c.id as connector_id
    from public.co_sender_accounts s
    join lateral (
      select c.id from public.co_connector_accounts c
       where c.connector_name = 'gmail' and lower(c.settings->>'email') = lower(s.email)
         and c.organization_id is not distinct from s.organization_id
       order by c.updated_at desc, c.id limit 1) c on true
   where s.connector_id is null and s.provider = 'gmail'
     and not exists (select 1 from public.co_sender_accounts t where t.connector_id = c.id)
   order by c.id, s.created_at, s.id)
update public.co_sender_accounts s set connector_id = pick.connector_id from pick where s.id = pick.sender_id;
create unique index if not exists co_sender_accounts_connector_uniq
  on public.co_sender_accounts (connector_id) where connector_id is not null;

alter table public.co_messages drop constraint if exists co_messages_status_check;
alter table public.co_messages add constraint co_messages_status_check
  check (status in ('draft','approved','needs_edit','drafted','sending','copied','sent','skipped'));

create table if not exists public.co_send_claims (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid references public.organizations(id) on delete cascade,
  -- set null, not cascade: deleting a mailbox or a message must not hand its claims back to the caps
  sender_account_id uuid references public.co_sender_accounts(id) on delete set null,
  message_id        uuid references public.co_messages(id) on delete set null,
  sender_domain     text not null check (sender_domain = lower(sender_domain)),
  recipient_key     text not null check (recipient_key = lower(recipient_key)),  -- co_recipient_cap_key()
  claimed_at        timestamptz not null default now(),
  released_at       timestamptz
);
-- One live claim per message; a released claim (proven unsent) lets the message be claimed again after re-approval.
create unique index if not exists co_send_claims_message_live on public.co_send_claims (message_id) where released_at is null;
create index if not exists co_send_claims_sender on public.co_send_claims (sender_account_id, claimed_at) where released_at is null;
create index if not exists co_send_claims_sender_domain on public.co_send_claims (sender_domain, claimed_at) where released_at is null;
create index if not exists co_send_claims_recipient on public.co_send_claims (organization_id, recipient_key, claimed_at) where released_at is null;
create index if not exists co_send_claims_claimed_at on public.co_send_claims (claimed_at);

alter table public.co_send_claims enable row level security;
drop policy if exists co_send_claims_service_role on public.co_send_claims;
create policy co_send_claims_service_role on public.co_send_claims to service_role using (true) with check (true);
revoke all on public.co_send_claims from public, anon, authenticated;
grant all on public.co_send_claims to service_role;

-- The recipient cap key: the whole address on a free-mail domain (or its subdomain), else the domain.
create or replace function public.co_recipient_cap_key(p_email text) returns text
language sql immutable set search_path = public, pg_temp as $$
  with e as (select lower(btrim(p_email)) as email, split_part(lower(btrim(p_email)), '@', 2) as domain)
  select case when exists (
           select 1 from unnest(array['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.tw', 'hotmail.com',
             'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'hinet.net',
             'ms1.hinet.net', 'pchome.com.tw', 'seed.net.tw', 'qq.com']) p
            where e.domain = p or e.domain like '%.' || p)
         then e.email else e.domain end
    from e
$$;

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

-- consent: {"status": a co_leads.consent_status value, "source": text, "at": timestamptz (default now)}.
-- Returns how many unsent cold mails were skipped; null when the lead does not exist.
create or replace function public.co_convert_to_warm(p_lead_id uuid, p_consent jsonb) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  v_lead record;
  v_ids  uuid[];
begin
  if nullif(btrim(p_consent->>'status'), '') is null then
    raise exception 'co_convert_to_warm: consent.status is required' using errcode = '22023';
  end if;
  select id, organization_id into v_lead from public.co_leads where id = p_lead_id for update;
  if not found then return null; end if;

  update public.co_leads
     set status = 'warm', consent_status = p_consent->>'status', consent_source = p_consent->>'source',
         consent_at = coalesce((p_consent->>'at')::timestamptz, now()), next_followup_date = null, updated_at = now()
   where id = p_lead_id;

  with s as (
    update public.co_messages set status = 'skipped'
     where lead_id = p_lead_id and output_type in ('cold_email','followup') and status in ('draft','approved','drafted')
    returning id)
  select coalesce(array_agg(id), '{}') into v_ids from s;

  if cardinality(v_ids) > 0 then
    insert into public.co_timeline_events (organization_id, lead_id, event_type, title, metadata)
    values (v_lead.organization_id, p_lead_id, 'cold_cancelled', '轉為暖名單，未寄出的開發信已取消',
            jsonb_build_object('message_ids', to_jsonb(v_ids), 'consent_source', p_consent->>'source'));
  end if;
  return cardinality(v_ids);
end $$;

revoke all on function public.co_recipient_cap_key(text), public.co_begin_send(uuid, uuid, text, jsonb),
  public.co_convert_to_warm(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.co_recipient_cap_key(text), public.co_begin_send(uuid, uuid, text, jsonb),
  public.co_convert_to_warm(uuid, jsonb) to service_role;

commit;
