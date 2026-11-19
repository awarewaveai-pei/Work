-- Back to 0164. Revert next-admin first (it reads and writes fx_rates). Refuses while any manual rate row exists:
-- those rows are the accounting audit trail and exist nowhere else. fx_daily_rates is re-fetchable and just dropped.
begin;
set local lock_timeout = '5s';
do $$
declare n bigint;
begin
  if to_regclass('public.fx_rates') is not null then
    select count(*) into n from public.fx_rates;
    if n > 0 then
      raise exception '0165 down: % fx_rates row(s) exist; they are the only record of the monthly accounting rates', n;
    end if;
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0165_fx_rates.sql';
  end if;
end $$;

drop table if exists public.fx_daily_rates;
drop table if exists public.fx_rates;
drop function if exists public.fx_rates_append_only();

notify pgrst, 'reload schema';
commit;
