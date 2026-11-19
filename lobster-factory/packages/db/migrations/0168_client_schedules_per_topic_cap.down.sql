-- Back to 0167: no per_topic_cap_twd. Revert the app first, then this. Every cap a person set is first APPENDED to
-- client_schedules_0168_backup (with backed_up_at), so a re-apply can restore them by hand.
begin;
set local lock_timeout = '5s';

create table if not exists public.client_schedules_0168_backup (
  organization_id uuid not null,
  job_key text not null,
  per_topic_cap_twd int not null,
  backed_up_at timestamptz not null default now()
);
alter table public.client_schedules_0168_backup enable row level security;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'client_schedules' and column_name = 'per_topic_cap_twd') then
    insert into public.client_schedules_0168_backup (organization_id, job_key, per_topic_cap_twd)
      select organization_id, job_key, per_topic_cap_twd from public.client_schedules where per_topic_cap_twd is not null;
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0168_client_schedules_per_topic_cap.sql';
  end if;
end $$;

alter table public.client_schedules drop column if exists per_topic_cap_twd;

notify pgrst, 'reload schema';
commit;
