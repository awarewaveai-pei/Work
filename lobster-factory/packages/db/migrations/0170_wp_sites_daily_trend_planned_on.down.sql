-- Back to 0169: no daily_trend_planned_on. Revert the app first, then this. The column is only a once-a-day claim mark
-- (no customer data): dropping it lets each enabled site be claimed again the next firing, nothing else is lost.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0170_wp_sites_daily_trend_planned_on.sql';
  end if;
end $$;

alter table public.wp_sites drop column if exists daily_trend_planned_on;

notify pgrst, 'reload schema';
commit;
