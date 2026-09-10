-- 0067: allow first-class real-footage source assets.
set lock_timeout = '3s';
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
  check (asset_domain in ('ai_generated', 'wp_product', 'wp_blog', 'real_footage')) not valid;
reset lock_timeout;
notify pgrst, 'reload schema';
