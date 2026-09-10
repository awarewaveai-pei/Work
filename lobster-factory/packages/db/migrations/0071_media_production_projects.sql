-- 0071: Human-facing project context for the media workbench.
-- Existing Quick Engine and media artifacts remain independent adapters.
set lock_timeout = '3s';

create table if not exists public.media_production_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 180),
  production_mode text not null check (production_mode in ('quick_video', 'short_drama', 'footage_edit')),
  lifecycle_stage text not null default 'create' check (lifecycle_stage in ('create', 'produce', 'review', 'release', 'measure', 'archived')),
  brief_json jsonb not null default '{}'::jsonb,
  active_story_bible_revision_id uuid references public.media_story_bible_revisions(id) on delete restrict,
  active_candidate_asset_id uuid references public.media_assets(id) on delete restrict,
  active_release_id uuid references public.media_releases(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_production_projects_org_stage_idx
  on public.media_production_projects (organization_id, lifecycle_stage, updated_at desc);

alter table public.media_story_bible_revisions
  add column if not exists project_id uuid references public.media_production_projects(id) on delete restrict,
  add column if not exists parent_revision_id uuid references public.media_story_bible_revisions(id) on delete restrict;
create index if not exists media_story_bible_revisions_project_idx
  on public.media_story_bible_revisions (project_id, created_at desc) where project_id is not null;

alter table public.media_production_projects enable row level security;
revoke all on table public.media_production_projects from anon, authenticated;
grant all on table public.media_production_projects to service_role;
comment on table public.media_production_projects is 'Producer-facing durable context; all media adapters receive organization/artifact references from this project.';

reset lock_timeout;
notify pgrst, 'reload schema';
