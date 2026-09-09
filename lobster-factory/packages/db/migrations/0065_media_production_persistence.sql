-- 0065: Media LEGO persistence for QA, Release, delivery and outcomes.
-- Additive only. Existing media_assets/video_jobs/Postiz/WordPress paths are unchanged.
-- Apply as supabase_admin after an isolated rehearsal; production rollout is separate.
set lock_timeout = '3s';

create table if not exists public.media_qa_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  candidate_asset_id uuid not null references public.media_assets(id) on delete restrict,
  candidate_checksum text not null check (length(candidate_checksum) between 16 and 128),
  qa_kind text not null check (qa_kind in ('technical', 'caption', 'editorial', 'rights')),
  capability_id text not null,
  capability_version text not null,
  profile_id text not null,
  profile_version text not null,
  status text not null check (status in ('queued', 'running', 'passed', 'warned', 'failed', 'superseded', 'withdrawn')),
  report_json jsonb not null default '{}'::jsonb,
  report_sha256 text not null check (report_sha256 ~ '^[0-9a-f]{64}$'),
  supersedes_report_id uuid references public.media_qa_reports(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists media_qa_reports_candidate_idx
  on public.media_qa_reports(organization_id, candidate_asset_id, qa_kind, created_at desc);

create table if not exists public.media_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  candidate_asset_id uuid not null references public.media_assets(id) on delete restrict,
  candidate_checksum text not null check (length(candidate_checksum) between 16 and 128),
  status text not null check (status in ('candidate_created', 'release_approved', 'release_blocked', 'withdrawn')),
  qa_report_ids jsonb not null default '[]'::jsonb,
  release_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  withdrawn_at timestamptz
);

create index if not exists media_releases_org_created_idx
  on public.media_releases(organization_id, created_at desc);

create table if not exists public.media_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  release_id uuid not null references public.media_releases(id) on delete restrict,
  destination text not null check (destination in ('wordpress', 'postiz')),
  variant text not null check (length(variant) between 1 and 64),
  status text not null check (status in ('queued', 'drafted', 'scheduled', 'published', 'failed', 'withdrawn')),
  idempotency_key text not null check (idempotency_key ~ '^[0-9a-f]{64}$'),
  external_id text,
  attempt integer not null default 0 check (attempt >= 0),
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists media_delivery_attempts_release_idx
  on public.media_delivery_attempts(organization_id, release_id, created_at desc);

create table if not exists public.media_outcome_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  release_id uuid not null references public.media_releases(id) on delete restrict,
  delivery_attempt_id uuid not null references public.media_delivery_attempts(id) on delete restrict,
  event_id text not null check (event_id ~ '^[0-9a-f]{64}$'),
  platform text not null check (platform in ('wordpress', 'instagram', 'facebook', 'youtube', 'tiktok', 'linkedin')),
  external_post_id text not null,
  maturity text not null check (maturity in ('24h', '7d', '30d')),
  observed_at timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_id)
);

create index if not exists media_outcome_snapshots_release_idx
  on public.media_outcome_snapshots(organization_id, release_id, platform, observed_at desc);

comment on table public.media_qa_reports is 'Immutable QA evidence pinned to candidate asset checksum; service-role writes only.';
comment on table public.media_releases is 'Immutable candidate/release decision; delivery references this record.';
comment on table public.media_delivery_attempts is 'Idempotent WordPress/Postiz delivery receipt and retry state.';
comment on table public.media_outcome_snapshots is 'Append-only platform outcome snapshots keyed by canonical event_id.';

do $$
declare
  table_name text;
begin
  foreach table_name in array array['media_qa_reports','media_releases','media_delivery_attempts','media_outcome_snapshots'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;

reset lock_timeout;
notify pgrst, 'reload schema';
