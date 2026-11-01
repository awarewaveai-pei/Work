-- 0151: put the Mockup Studio preset domains back into media_assets.asset_domain.
-- 0045 added mockup_model_preset / mockup_product_preset; 0067 rebuilt the CHECK from scratch with only
-- ('ai_generated','wp_product','wp_blog','real_footage'), so every preset save since then failed with insert_failed
-- (prod 2026-11-01: 0 preset rows). Same drop-and-rebuild shape as 0067; NOT VALID = no table scan.
-- Invariant: the CHECK is the union of every domain a route writes. Next rebuild must start from this list.
begin;
set local lock_timeout = '3s';
do $$
declare
  c record;
begin
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
  check (asset_domain in (
    'ai_generated', 'wp_product', 'wp_blog', 'real_footage',
    'mockup_model_preset', 'mockup_product_preset'
  )) not valid;
notify pgrst, 'reload schema';
commit;
