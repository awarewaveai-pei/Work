-- Back to 0163. Revert next-admin first (it writes source = 'video_workbench'). Refuses while any video_workbench row
-- exists: those rows would otherwise lose the only link to their workbench project.
begin;
set local lock_timeout = '5s';
do $$
declare n bigint;
begin
  select count(*) into n from public.media_production_projects where source = 'video_workbench';
  if n > 0 then
    raise exception '0164 down: % video_workbench project row(s) still exist; they are the only link to their workbench projects', n;
  end if;
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0164_media_projects_workbench_source.sql';
  end if;
end $$;

drop index if exists public.media_production_projects_workbench_ref_key;
alter table public.media_production_projects drop constraint if exists media_production_projects_workbench_ref_check;
alter table public.media_production_projects drop constraint if exists media_production_projects_source_check;
alter table public.media_production_projects add constraint media_production_projects_source_check
  check (source in ('manual', 'script_forge', 'content_topic'));

notify pgrst, 'reload schema';
commit;
