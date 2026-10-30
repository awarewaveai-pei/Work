-- Fails (foreign key, on delete restrict) once any account has bought studio_basic: end those contracts first.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0144_plan_studio_basic.sql';
  end if;
end $$;
delete from public.plans where plan_key = 'studio_basic';
commit;
