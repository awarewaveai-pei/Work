-- Dedicated video Whisper jobs; separate from meeting-service state.
begin;
set lock_timeout = '3s';
create table if not exists public.media_transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_asset_id uuid not null references public.media_assets(id) on delete restrict,
  source_checksum_sha256 text not null check (source_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  callback_secret_sha256 text not null check (callback_secret_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('queued','dispatched','completed','failed')),
  model text not null,
  result_json jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists media_transcription_jobs_org_created_idx on public.media_transcription_jobs(organization_id, created_at desc);
alter table public.media_transcription_jobs enable row level security;
revoke all on public.media_transcription_jobs from anon, authenticated;
grant all on public.media_transcription_jobs to service_role;
reset lock_timeout;
notify pgrst, 'reload schema';
commit;
