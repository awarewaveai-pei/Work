-- Migration: 0053_global_events
-- Global events calendar for merchandise pre-selling.
-- Sources: Calendarific (holidays), TheSportsDB (sports), hardcoded mega-events.

create table if not exists public.events (
  id                    uuid        primary key default gen_random_uuid(),
  title                 text        not null,
  title_zh              text,
  event_date            date        not null,
  event_end_date        date,
  category              text        not null check (category in ('sports','holiday','cultural','mega')),
  subcategory           text,
  country_codes         text[]      not null default '{}',
  region                text,
  marketing_window_start date       not null,
  marketing_window_end  date        not null,
  marketing_lead_days   integer     not null default 30,
  source                text        not null check (source in ('calendarific','thesportsdb','hardcoded')),
  external_id           text        not null unique,
  emoji                 text,
  is_active             boolean     not null default true,
  synced_at             timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists events_marketing_window_start_idx on public.events (marketing_window_start);
create index if not exists events_category_idx              on public.events (category);
create index if not exists events_event_date_idx            on public.events (event_date);
create index if not exists events_is_active_idx             on public.events (is_active) where is_active = true;

-- Auto-update updated_at
create or replace function public.events_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger events_updated_at
  before update on public.events
  for each row execute function public.events_set_updated_at();

-- RLS: authenticated users can read; service role manages writes
alter table public.events enable row level security;

create policy "events_read_authenticated"
  on public.events for select
  to authenticated using (true);

-- Service role bypasses RLS automatically — no write policy needed.
