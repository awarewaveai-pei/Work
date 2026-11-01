-- Back to 0150 (the 0067 domain set). Refused while preset rows exist: they would violate the narrower CHECK on the
-- next UPDATE. Delete them from Mockup Studio first (that also removes their R2 objects), then run this.
begin;
set local lock_timeout = '3s';
-- Taken before the row check so no preset can be saved between the check and the narrower CHECK.
lock table public.media_assets in share row exclusive mode;
do $$
declare
  c record;
begin
  if exists (select 1 from public.media_assets where asset_domain in ('mockup_model_preset', 'mockup_product_preset')) then
    raise exception '0151 down: mockup preset rows still exist';
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0151_media_assets_presets_restore.sql';
  end if;
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.media_assets'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%asset_domain%'
  loop
    execute format('alter table public.media_assets drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.media_assets
  add constraint media_assets_asset_domain_check
  check (asset_domain in ('ai_generated', 'wp_product', 'wp_blog', 'real_footage')) not valid;
notify pgrst, 'reload schema';
commit;
