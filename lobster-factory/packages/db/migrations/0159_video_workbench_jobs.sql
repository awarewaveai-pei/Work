-- 0159: video-workbench P6 card D1 (apps/video-workbench/docs/p6-golive-plan-20261103.md §2 D1).
-- media_workbench_jobs = the workbench task ledger; next-admin's internal jobs route (service role) is the only writer,
-- one row per (organization, idempotency_key) so a retried submit never runs or bills twice.
-- media_assets.asset_domain gains 'workbench_render' (workbench compositor/Blender output). Same drop-and-rebuild shape
-- as 0151; NOT VALID = no table scan. Invariant (0151): the CHECK is the union of every domain a route writes.
begin;
set local lock_timeout = '3s';

create table if not exists public.media_workbench_jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  created_by       uuid references public.profiles(id) on delete set null,
  idempotency_key  text not null check (length(idempotency_key) between 1 and 200),
  kind             text not null check (kind in ('image','video','audio','text','remove-bg','3d','render','transcribe')),
  status           text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  input            jsonb not null default '{}'::jsonb,
  result_asset_id  uuid references public.media_assets(id) on delete set null,
  cost_usd         numeric(10,4) check (cost_usd >= 0),
  error            text,
  attempt          integer not null default 1 check (attempt >= 1),
  cancel_requested boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint media_workbench_jobs_org_idempotency_key unique (organization_id, idempotency_key)
);

create index if not exists media_workbench_jobs_org_created_idx
  on public.media_workbench_jobs (organization_id, created_at desc);
-- on delete set null from media_assets looks rows up by this column.
create index if not exists media_workbench_jobs_result_asset_idx
  on public.media_workbench_jobs (result_asset_id) where result_asset_id is not null;

comment on table public.media_workbench_jobs is 'video-workbench task ledger; idempotent per (organization_id, idempotency_key); service-role writes only.';

alter table public.media_workbench_jobs enable row level security;
revoke all on table public.media_workbench_jobs from public, anon, authenticated;
grant all on table public.media_workbench_jobs to service_role;

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
    'mockup_model_preset', 'mockup_product_preset',
    'workbench_render'
  )) not valid;

notify pgrst, 'reload schema';
commit;
