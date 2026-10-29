-- 0140 down: the default comes back (an app older than 4c-2 writes identities without a site). The sellers 0140
-- backfilled stay: AwareWave sold those accounts, and 0133's down already accepts sold_by = AwareWave.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0140_seller_sites_app_writes_site.sql';
  end if;
end $$;

do $$ begin
  execute format('alter table public.customer_identities alter column site_id set default %L::uuid',
    (select id from public.seller_sites where key_id = 'aware-wave-com'));
end $$;

notify pgrst, 'reload schema';
commit;
