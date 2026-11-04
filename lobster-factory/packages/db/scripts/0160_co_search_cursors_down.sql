-- Back to 0159. Revert next-admin first (lib/outreach/search-cursor.ts reads the table).
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0160_co_search_cursors.sql';
  end if;
end $$;
drop table if exists public.co_search_cursors;
commit;
