-- Video project carries the client, script, formats and how much runs on its own (VIDEO_TOOL_REDESIGN_2026-10-26.md §2, V1.1).
-- media_assets.project_id is NOT reused: it references the older public.projects (0038:29).
begin;
set local lock_timeout = '5s';

alter table public.media_production_projects
  add column if not exists autonomy text not null default 'guided',
  add column if not exists source text not null default 'manual',
  add column if not exists source_ref text,
  add column if not exists formats text[] not null default '{16x9}',
  add column if not exists last_error text;

alter table public.media_production_projects drop constraint if exists media_production_projects_autonomy_check;
alter table public.media_production_projects add constraint media_production_projects_autonomy_check
  check (autonomy in ('guided', 'auto_after_render', 'full_auto'));
alter table public.media_production_projects drop constraint if exists media_production_projects_source_check;
alter table public.media_production_projects add constraint media_production_projects_source_check
  check (source in ('manual', 'script_forge', 'content_topic'));
alter table public.media_production_projects drop constraint if exists media_production_projects_formats_check;
alter table public.media_production_projects add constraint media_production_projects_formats_check
  check (cardinality(formats) >= 1 and formats <@ array['16x9', '9x16', '4x5']::text[]);

alter table public.media_assets
  add column if not exists media_project_id uuid references public.media_production_projects(id) on delete restrict;
create index if not exists media_assets_media_project_idx
  on public.media_assets (media_project_id) where media_project_id is not null;

-- The four 2026-09-10 smoke rows (VIDEO_TOOL_IA_REORG_2026-09-10.md D4) leave the project list.
update public.media_production_projects set lifecycle_stage = 'archived', updated_at = now()
  where id in ('921292cd-4963-4f42-bf5a-99b6f2eb6f90', 'cb23d63c-80cc-4fbb-ae3b-c61196625233',
               '35a0ddbd-bcff-4d60-855a-f26d15c843d1', 'f2c8333b-4f1e-481c-80f2-dcf0ad280ee2')
    and lifecycle_stage <> 'archived';

notify pgrst, 'reload schema';
commit;
