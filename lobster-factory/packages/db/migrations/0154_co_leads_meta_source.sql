-- 0154: Outbound OS v2 card C14.1 (R0-PLAN §6 C14, SPEC §5.10). One lead per Meta lead-ad submission: source_url
-- 'meta:leadgen/<leadgen_id>' is unique per organization (NULL organization included, PG 15 NULLS NOT DISTINCT), so a
-- webhook resend hits the index and the caller reads the existing row instead of creating a second lead. co_leads.source_url
-- stays non-unique for every other source (0048:95); only the meta:leadgen/ prefix is keyed.
-- Also: co_convert_to_warm re-checks opt-out under the lead lock (returns -1).
-- Refused, not repaired, when two rows already share a key: which one to keep is a person's call.
begin;
set local lock_timeout = '5s';

do $$
declare v_dups text;
begin
  select string_agg(format('%s / %s (%s leads)', coalesce(organization_id::text, 'agency'), source_url, n), '; ')
    into v_dups
    from (select organization_id, source_url, count(*) n from public.co_leads
          where source_url like 'meta:leadgen/%' group by 1, 2 having count(*) > 1) d;
  if v_dups is not null then
    raise exception '0154: co_leads has more than one lead for the same Meta leadgen id: %. Keep one lead per id, then apply.', v_dups;
  end if;
end $$;

create unique index if not exists co_leads_org_meta_leadgen_uniq
  on public.co_leads (organization_id, source_url) nulls not distinct where source_url like 'meta:leadgen/%';

-- co_convert_to_warm (0152) refuses an opted-out lead under its lock; returns -1 then.
create or replace function public.co_convert_to_warm(p_lead_id uuid, p_consent jsonb) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  v_lead record;
  v_ids  uuid[];
begin
  if nullif(btrim(p_consent->>'status'), '') is null then
    raise exception 'co_convert_to_warm: consent.status is required' using errcode = '22023';
  end if;
  select id, organization_id, status, do_not_contact, consent_status into v_lead from public.co_leads where id = p_lead_id for update;
  if not found then return null; end if;
  -- Re-checked under the lock (Codex C14 F1): a reply processed between the caller's read and this call may have made
  -- the person unsubscribed / do_not_contact; a form never overwrites that. -1 = refused, nothing changed.
  if v_lead.do_not_contact or v_lead.status in ('unsubscribed','do_not_contact')
     or v_lead.consent_status in ('unsubscribed','do_not_contact') then
    return -1;
  end if;

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


commit;
