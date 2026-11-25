-- Back to 0182: no weekday_hours, no 'weekdays' frequency. Revert the app first, then this. Every 'weekdays' row is first
-- APPENDED to client_schedules_0183_backup (with backed_up_at), then switched off as 'daily' (the old CHECK rejects
-- 'weekdays'), so a re-apply can restore them by hand.
begin;
set local lock_timeout = '5s';

create table if not exists public.client_schedules_0183_backup (
  organization_id uuid not null,
  job_key text not null,
  enabled boolean not null,
  weekday_hours int[],
  backed_up_at timestamptz not null default now()
);
alter table public.client_schedules_0183_backup enable row level security;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'client_schedules' and column_name = 'weekday_hours') then
    insert into public.client_schedules_0183_backup (organization_id, job_key, enabled, weekday_hours)
      select organization_id, job_key, enabled, weekday_hours from public.client_schedules where frequency = 'weekdays';
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0183_client_schedules_weekday_hours.sql';
  end if;
end $$;

update public.client_schedules set frequency = 'daily', enabled = false where frequency = 'weekdays';

alter table public.client_schedules drop constraint if exists client_schedules_weekdays_has_hours;

alter table public.client_schedules drop constraint if exists client_schedules_frequency_check;
alter table public.client_schedules
  add constraint client_schedules_frequency_check
  check (frequency in ('daily', 'weekly', 'every_5m', 'monthly', 'quarterly', 'yearly'));

alter table public.client_schedules drop column if exists weekday_hours;

notify pgrst, 'reload schema';
commit;
