-- Undo 0138: drop the project columns and the asset link; the four smoke rows return to their 2026-10-26 stages.
begin;
set local lock_timeout = '5s';
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    delete from public.schema_migrations where filename = '0138_media_projects_v2.sql';
  end if;
end $$;

drop index if exists public.media_assets_media_project_idx;
alter table public.media_assets drop column if exists media_project_id;

alter table public.media_production_projects drop constraint if exists media_production_projects_autonomy_check;
alter table public.media_production_projects drop constraint if exists media_production_projects_source_check;
alter table public.media_production_projects drop constraint if exists media_production_projects_formats_check;
alter table public.media_production_projects
  drop column if exists autonomy,
  drop column if exists source,
  drop column if exists source_ref,
  drop column if exists formats,
  drop column if exists last_error;

update public.media_production_projects as p set lifecycle_stage = v.stage, updated_at = now()
  from (values ('921292cd-4963-4f42-bf5a-99b6f2eb6f90'::uuid, 'release'), ('cb23d63c-80cc-4fbb-ae3b-c61196625233'::uuid, 'measure'),
               ('35a0ddbd-bcff-4d60-855a-f26d15c843d1'::uuid, 'measure'), ('f2c8333b-4f1e-481c-80f2-dcf0ad280ee2'::uuid, 'produce')) as v(id, stage)
  where p.id = v.id;

notify pgrst, 'reload schema';
commit;
