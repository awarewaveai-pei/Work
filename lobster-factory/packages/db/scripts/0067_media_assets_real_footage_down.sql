set lock_timeout = '3s';
alter table public.media_assets drop constraint if exists media_assets_asset_domain_check;
alter table public.media_assets
  add constraint media_assets_asset_domain_check
  check (asset_domain in ('ai_generated', 'wp_product', 'wp_blog')) not valid;
reset lock_timeout;
notify pgrst, 'reload schema';

do $$ begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0067_media_assets_real_footage.sql';
  end if;
end $$;
