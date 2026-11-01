-- 0150: Outbound OS v2 card C3 (SPEC §4, §5.1, §5.2). One row per fact the research found about a lead, with where it
-- was read: claim, the source page, the verbatim excerpt (a substring of that page's text, checked by code before the
-- insert), status. A fact from the lead's own website is approved at insert (SPEC D23); any other source waits for a
-- person. Cold email generation reads only approved rows (lib/outreach/brand-context.ts).
-- organization_id is the lead's, always: set from the lead on insert and moved with the lead (triggers), so a row
-- can never sit in one organization while describing another's lead.
begin;
set local lock_timeout = '5s';

create table if not exists public.co_evidence (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  lead_id         uuid not null references public.co_leads(id) on delete cascade,
  claim           text not null check (btrim(claim) <> '' and char_length(claim) <= 300),
  -- bounded so (lead_id, source_url, claim) fits one btree entry (~2.7 kB): longer pages are skipped by the sink
  source_url      text not null check (char_length(source_url) <= 1000),
  excerpt         text,
  source_label    text,
  captured_at     timestamptz not null default now(),
  source_date     date,
  confidence      numeric check (confidence is null or confidence between 0 and 1),
  -- stale = the excerpt is no longer on its page (research saw the page again): never cited, kept for history
  status          text not null default 'pending' check (status in ('pending','approved','rejected','stale')),
  created_by      text,
  -- who approved or rejected it (null = the research's own decision): a person's approval comes back with the excerpt
  reviewed_by     text,
  created_at      timestamptz not null default now(),
  unique (lead_id, source_url, claim)
);
create index if not exists co_evidence_lead_status on public.co_evidence (lead_id, status);
create index if not exists co_evidence_org_status on public.co_evidence (organization_id, status);

alter table public.co_evidence enable row level security;
drop policy if exists co_evidence_service_role on public.co_evidence;
create policy co_evidence_service_role on public.co_evidence to service_role using (true) with check (true);

create or replace function public.co_evidence_lead_org() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  select l.organization_id into new.organization_id from public.co_leads l where l.id = new.lead_id;
  return new;
end $$;
drop trigger if exists co_evidence_lead_org on public.co_evidence;
create trigger co_evidence_lead_org before insert or update of lead_id, organization_id on public.co_evidence
  for each row execute function public.co_evidence_lead_org();

create or replace function public.co_leads_move_evidence() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update public.co_evidence set organization_id = new.organization_id where lead_id = new.id;
  return new;
end $$;
drop trigger if exists co_leads_move_evidence on public.co_leads;
create trigger co_leads_move_evidence after update of organization_id on public.co_leads
  for each row when (old.organization_id is distinct from new.organization_id)
  execute function public.co_leads_move_evidence();

commit;
