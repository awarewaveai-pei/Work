-- 0165: accounting USD→TWD rate per Asia/Taipei month for /ops/costs 月報 (next-admin lib/ai/fx-rates.ts).
-- Append-only: a correction is a new row; the newest row for a month wins, older rows stay as the audit trail.
-- Quotes / estimates keep the constant TWD_RATE; only the monthly accounting report reads this table.
-- fx_daily_rates: the automatic layer, one row per day fetched from the central bank's open data (next-admin
-- lib/ai/fx-cbc.ts). External fact, so upsert on day is fine; raw = that day's source row as fetched.
-- RLS deny-by-default (same as 0043_ai_call_logs): RLS on, no anon/auth policy, so only the service role reads/writes.
-- Additive. Rollback: 0165_fx_rates.down.sql.
begin;
set local lock_timeout = '5s';

create table if not exists public.fx_rates (
  id          uuid primary key default gen_random_uuid(),
  month       date not null check (extract(day from month) = 1),  -- 1st of the Asia/Taipei month
  base        text not null default 'USD',
  quote       text not null default 'TWD',
  rate        numeric(10,4) not null check (rate > 0),
  source      text not null check (source in ('bot_monthly_avg', 'card_statement', 'other')),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists fx_rates_month_created_idx on public.fx_rates (month, created_at desc);

alter table public.fx_rates enable row level security;

-- Append-only in the database, not just in the app: any UPDATE / DELETE (service role included) is refused.
create or replace function public.fx_rates_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'fx_rates is append-only: add a new row instead of changing %', old.id;
end $$;
drop trigger if exists fx_rates_append_only on public.fx_rates;
create trigger fx_rates_append_only before update or delete on public.fx_rates
  for each row execute function public.fx_rates_append_only();

create table if not exists public.fx_daily_rates (
  day         date primary key,
  base        text not null default 'USD',
  quote       text not null default 'TWD',
  rate        numeric(10,4) not null check (rate > 0),
  source      text not null default 'cbc_close',
  fetched_at  timestamptz not null default now(),
  raw         text
);

alter table public.fx_daily_rates enable row level security;

notify pgrst, 'reload schema';
commit;
