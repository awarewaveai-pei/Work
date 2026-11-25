-- Back to 0180. Drops only the index; no row changes. next-admin needs no revert first: create-site checks host_slug
-- before it writes and works without the index (only the concurrent-create race reopens).
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0181_environments_host_slug_unique.sql';
  end if;
end $$;

drop index if exists public.uq_environments_host_slug_live;

commit;
