-- 0160: Outbound OS lead searches resume (operator 2026-11-04): the same search again continues where the last one
-- stopped instead of paying for page 1 again. One row per (organization, source, search key); state is the source's own
-- resume point (lib/outreach/search-cursor.ts), next_state null = nothing more to find. Additive; service_role only.
begin;
set local lock_timeout = '5s';
create table if not exists public.co_search_cursors (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  source          text not null check (source in ('places', 'gcis', 'people')),
  search_key      text not null check (length(search_key) between 1 and 1000),
  next_state      jsonb,
  runs            integer not null default 0,
  updated_at      timestamptz not null default now()
);
create unique index if not exists co_search_cursors_key on public.co_search_cursors (organization_id, source, search_key) nulls not distinct;
comment on column public.co_search_cursors.next_state is 'Where the next run of this search starts (source-defined); null = exhausted.';

alter table public.co_search_cursors enable row level security;
drop policy if exists co_search_cursors_service_role on public.co_search_cursors;
create policy co_search_cursors_service_role on public.co_search_cursors to service_role using (true) with check (true);
revoke all on public.co_search_cursors from public, anon, authenticated;
grant all on public.co_search_cursors to service_role;
commit;
