-- 0156: Outbound OS v2 card C9.1 (R0-PLAN §6): the old co_leads.observation + source_url become one approved evidence row,
-- so the Cold Gate can read co_evidence only (C9.2). Idempotent: a lead that already has any evidence row is skipped, so a
-- re-run inserts nothing. The column stays (no longer written). Blank observations and source_url > 1000 chars (the
-- co_evidence check, 0150) are skipped: nothing to cite.
begin;
set local lock_timeout = '5s';
insert into public.co_evidence (lead_id, organization_id, claim, source_url, excerpt, status, created_by, captured_at)
select l.id, l.organization_id, left(btrim(l.observation), 300), l.source_url, null, 'approved', 'backfill', now()
from public.co_leads l
where btrim(coalesce(l.observation, '')) <> ''
  and btrim(coalesce(l.source_url, '')) <> ''
  and char_length(l.source_url) <= 1000
  and not exists (select 1 from public.co_evidence e where e.lead_id = l.id);
commit;
