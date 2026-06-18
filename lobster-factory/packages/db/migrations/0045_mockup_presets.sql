-- 0045_mockup_presets.sql
-- Extend asset_domain CHECK to allow preset types for Mockup Studio.
-- The existing constraint is NOT VALID (no backfill scan needed), so we can
-- drop-and-recreate safely without a table scan.

do $$
begin
  -- Drop old constraint if exists
  if exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.media_assets'::regclass
      and c.conname = 'media_assets_asset_domain_check'
  ) then
    alter table media_assets drop constraint media_assets_asset_domain_check;
  end if;

  alter table media_assets
    add constraint media_assets_asset_domain_check
    check (asset_domain in (
      'ai_generated',
      'wp_product',
      'wp_blog',
      'mockup_model_preset',
      'mockup_product_preset'
    )) not valid;
end $$;
