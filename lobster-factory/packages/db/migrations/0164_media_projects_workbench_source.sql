-- 0164: a video project row the workbench owns (video-unify-plan-20261116.md U0). The workbench never inserts it directly:
-- next-admin ensureWorkbenchProject (lib/content/video/projects.ts) finds or creates the one row per
-- (organization_id, source_ref). The unique index makes "one row per workbench project" a database fact, so two racing
-- creates end in one row (the loser gets 23505 and reads the winner). Additive: existing rows keep their source values.
begin;
set local lock_timeout = '5s';

alter table public.media_production_projects drop constraint if exists media_production_projects_source_check;
alter table public.media_production_projects add constraint media_production_projects_source_check
  check (source in ('manual', 'script_forge', 'content_topic', 'video_workbench'));
-- A workbench row without a ref would escape the unique index (NULLs never collide).
alter table public.media_production_projects drop constraint if exists media_production_projects_workbench_ref_check;
alter table public.media_production_projects add constraint media_production_projects_workbench_ref_check
  check (source <> 'video_workbench' or source_ref is not null);

create unique index if not exists media_production_projects_workbench_ref_key
  on public.media_production_projects (organization_id, source_ref) where source = 'video_workbench';

notify pgrst, 'reload schema';
commit;
