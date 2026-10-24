-- Back to 0124: no daily_limit. Revert the app first, then this. Every limit a person set is first APPENDED to
-- client_schedules_0125_backup (with backed_up_at), so a re-apply can restore them by hand.
begin;
set local lock_timeout = '5s';

create table if not exists public.client_schedules_0125_backup (
  organization_id uuid not null,
  job_key text not null,
  daily_limit int not null,
  backed_up_at timestamptz not null default now()
);
alter table public.client_schedules_0125_backup enable row level security;
insert into public.client_schedules_0125_backup (organization_id, job_key, daily_limit)
  select organization_id, job_key, daily_limit from public.client_schedules where daily_limit is not null;

alter table public.client_schedules drop column if exists daily_limit;

notify pgrst, 'reload schema';
commit;
