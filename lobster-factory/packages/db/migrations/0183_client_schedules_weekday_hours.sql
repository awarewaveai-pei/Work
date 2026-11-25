-- 0183: client_schedules can run on chosen Taipei weekdays, each day at its own Taipei hour (operator 2026-11-25: set the
-- 「自動啟動 Claude」 time on app.aware-wave.com; Mon-Fri 08:00, Sat 07:00, Sun off). Adds frequency 'weekdays' and
-- weekday_hours: 7 entries indexed by TAIPEI weekday (0=Sunday), each a Taipei hour 0-23 or null (that day off).
-- Taipei, like day_of_month (0123): Sat 07:00 Taipei is Fri 23:00 UTC, so a UTC weekday/hour pair cannot hold it.
-- next-admin lib/schedules/schedule.ts isDueNow is the reader.
-- Additive: old code never reads the column. Old code reads an enabled 'weekdays' row as weekly (Mon 00 UTC), claims it and
-- fails unknown_job (its registry has no claude_usage_window): it never fires, but raises an incident a week.
-- APPLY:  node scripts/apply-db-migration.mjs 0183
-- Down:   packages/db/migrations/0183_client_schedules_weekday_hours.down.sql (revert the app first)
begin;
set local lock_timeout = '5s';

-- One dimension, 1-based, 7 entries; null entries pass (`0 <= all(...)` is null, not false): null = that day is off.
alter table public.client_schedules
  add column if not exists weekday_hours int[]
  check (weekday_hours is null or (array_ndims(weekday_hours) = 1 and array_lower(weekday_hours, 1) = 1
         and cardinality(weekday_hours) = 7 and 0 <= all(weekday_hours) and 23 >= all(weekday_hours)));

alter table public.client_schedules drop constraint if exists client_schedules_frequency_check;
alter table public.client_schedules
  add constraint client_schedules_frequency_check
  check (frequency in ('daily', 'weekly', 'every_5m', 'monthly', 'quarterly', 'yearly', 'weekdays'));

-- A 'weekdays' row without hours would read 已啟用 and never fire.
alter table public.client_schedules drop constraint if exists client_schedules_weekdays_has_hours;
alter table public.client_schedules
  add constraint client_schedules_weekdays_has_hours check (frequency <> 'weekdays' or weekday_hours is not null);

notify pgrst, 'reload schema';
commit;
