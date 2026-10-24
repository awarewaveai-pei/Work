-- 0123: client_schedules can run once a month / quarter / year on a chosen day (operator 2026-10-24: 社群週報、月報、季報、
-- 年報, each with its own send day and hour). Adds day_of_month (1-28: every month has it) and the frequencies
-- monthly / quarterly / yearly. day_of_month is a TAIPEI calendar day, unlike hour_utc/day_of_week_utc: a Taipei
-- day-of-month cannot be expressed in UTC (Taipei 1st 03:00 = the previous month's last day in UTC). next-admin
-- lib/schedules/schedule.ts isDueNow is the reader.
-- The monthly report job (social_monthly_report) moves from its 'daily' look (it sent only on the 1st-3rd) to
-- 'monthly' on the 1st; the 1st-3rd catch-up moves into isDueNow.
-- Additive: old code keeps working against it (it treats an unknown frequency like weekly; the report job dedupes).
-- APPLY:  node scripts/apply-db-migration.mjs 0123
-- Down:   packages/db/migrations/0123_client_schedules_day_of_month.down.sql (revert the app first)
begin;
set local lock_timeout = '5s';

alter table public.client_schedules
  add column if not exists day_of_month int not null default 1 check (day_of_month between 1 and 28);

alter table public.client_schedules drop constraint if exists client_schedules_frequency_check;
alter table public.client_schedules
  add constraint client_schedules_frequency_check
  check (frequency in ('daily', 'weekly', 'every_5m', 'monthly', 'quarterly', 'yearly'));

update public.client_schedules set frequency = 'monthly', day_of_month = 1
  where job_key = 'social_monthly_report' and frequency = 'daily';

notify pgrst, 'reload schema';
commit;
