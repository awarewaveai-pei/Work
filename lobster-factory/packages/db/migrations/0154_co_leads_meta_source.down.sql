-- Back to 0153. Revert next-admin first (captureWarmLead relies on the index to find a resent leadgen id). Only the index
-- goes; the leads stay.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0154_co_leads_meta_source.sql';
  end if;
end $$;
drop index if exists public.co_leads_org_meta_leadgen_uniq;
-- co_convert_to_warm back to its 0152 body
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

commit;
