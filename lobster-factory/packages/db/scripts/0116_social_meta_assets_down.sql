begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0116_social_meta_assets.sql';
  end if;
end $$;
drop index if exists public.social_meta_assets_org_idx;
drop table if exists public.social_meta_assets;
commit;
