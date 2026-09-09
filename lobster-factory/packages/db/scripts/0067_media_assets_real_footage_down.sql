set lock_timeout = '3s';
alter table public.media_assets drop constraint if exists media_assets_asset_domain_check;
alter table public.media_assets
  add constraint media_assets_asset_domain_check
  check (asset_domain in ('ai_generated', 'wp_product', 'wp_blog')) not valid;
reset lock_timeout;
notify pgrst, 'reload schema';
