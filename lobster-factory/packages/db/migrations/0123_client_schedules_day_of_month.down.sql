-- Back to 0122: no monthly / quarterly / yearly schedules, no day_of_month. Revert the app first, then this.
-- The monthly report goes back to its daily look (its old job sent only on the 1st-3rd); any other job left on a periodic
-- frequency becomes weekly (what the old isDueNow made of an unknown frequency) -- never daily, which would run it ~30x
-- as often. The weekly / quarterly / yearly report rows are removed (their jobs do not exist in the old app: an enabled
-- row would raise unknown_job every run); they and every periodic row are first APPENDED to client_schedules_0123_backup
-- (with backed_up_at), so a second down after a re-apply keeps both copies.
begin;
set local lock_timeout = '5s';
-- the strongest lock first, once (db-expert 2026-10-24): no row lock upgraded to access exclusive later
alter table public.client_schedules drop constraint if exists client_schedules_frequency_check;

create table if not exists public.client_schedules_0123_backup as
  select c.*, now() as backed_up_at from public.client_schedules c with no data;
alter table public.client_schedules_0123_backup enable row level security;
insert into public.client_schedules_0123_backup
  select c.*, now() from public.client_schedules c
  where c.job_key in ('social_weekly_report', 'social_quarterly_report', 'social_yearly_report')
     or c.frequency in ('monthly', 'quarterly', 'yearly');

delete from public.client_schedules
  where job_key in ('social_weekly_report', 'social_quarterly_report', 'social_yearly_report');
update public.client_schedules
  set frequency = case when job_key = 'social_monthly_report' then 'daily' else 'weekly' end
  where frequency in ('monthly', 'quarterly', 'yearly');
alter table public.client_schedules
  add constraint client_schedules_frequency_check check (frequency in ('daily', 'weekly', 'every_5m'));
alter table public.client_schedules drop column if exists day_of_month;
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0123_client_schedules_day_of_month.sql';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
