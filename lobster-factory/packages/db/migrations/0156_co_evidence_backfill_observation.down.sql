-- Back to 0155. Removes only the rows this backfill wrote; evidence from research or a person is untouched.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0156_co_evidence_backfill_observation.sql';
  end if;
end $$;
delete from public.co_evidence where created_by = 'backfill';
commit;
