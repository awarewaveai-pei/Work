-- Back to 0158. Revert next-admin and stop video-workbench first (they write the ledger and workbench_render assets).
-- Refused while workbench_render rows exist: they would violate the narrower CHECK on the next UPDATE. Delete or
-- re-domain them by hand first. Every media_workbench_jobs row (P6 data only) is lost.
begin;
set local lock_timeout = '3s';
-- Taken before the row check so no workbench_render asset can be saved between the check and the narrower CHECK.
lock table public.media_assets in share row exclusive mode;
do $$
declare
  c record;
begin
  if exists (select 1 from public.media_assets where asset_domain = 'workbench_render') then
    raise exception '0159 down: workbench_render asset rows still exist';
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0159_video_workbench_jobs.sql';
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
  check (asset_domain in (
    'ai_generated', 'wp_product', 'wp_blog', 'real_footage',
    'mockup_model_preset', 'mockup_product_preset'
  )) not valid;
drop table if exists public.media_workbench_jobs;
notify pgrst, 'reload schema';
commit;
