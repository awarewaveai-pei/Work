-- 0047_video_jobs.sql
-- Persistent async video-render job tracking.
--
-- Replaces the in-memory module-level Map in
-- lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/job-store.ts so
-- render progress survives next-admin container restarts / deploys — the root cause of the
-- `job_not_found` the user hit when a redeploy restarted the container mid-render.
--
-- Access: server-only via service_role (getSupabaseWriteClient). Never read/written by anon or
-- authenticated browser clients directly (the /api/video/* routes are the only callers).
--
-- Durability model unchanged: the DURABLE artifacts are the R2 video file + the media_assets
-- gallery row (backfilled by the reconcile cron). This table is short-lived progress state with a
-- 1h TTL; losing a row is non-fatal (reconcile remains the backstop). See ADR/runbook for the
-- multi-instance rationale the original job-store docstring called out.

create table if not exists public.video_jobs (
  id            uuid primary key default gen_random_uuid(),
  status        text not null default 'running' check (status in ('running', 'done', 'error')),
  step          text,
  eu_job_id     text,
  video         jsonb,
  title         text,
  error         text,
  status_code   integer,
  r2_keys       jsonb not null default '[]'::jsonb,
  record_params jsonb,
  recorded      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Prune scan (delete created_at < now()-1h) hits this index.
create index if not exists video_jobs_created_at_idx on public.video_jobs (created_at);

-- RLS hardening (matches 0014_enable_public_table_rls): every public table has RLS ON.
-- No policies are defined → anon/authenticated are denied; service_role bypasses RLS, which is the
-- only writer/reader of this server-internal table.
alter table public.video_jobs enable row level security;

-- Explicit deny for anon/authenticated (defense-in-depth + silences the advisor's
-- rls_enabled_no_policy INFO; matches the 0033 repair_runs precedent). service_role still
-- bypasses RLS, so the server (getSupabaseWriteClient) is unaffected. drop-then-create = idempotent.
drop policy if exists "video_jobs_deny_non_service" on public.video_jobs;
create policy "video_jobs_deny_non_service" on public.video_jobs
  for all to anon, authenticated using (false) with check (false);

comment on table public.video_jobs is
  'Async video-render job progress (server/service_role only; ~1h TTL; durable artifacts live in R2 + media_assets, backfilled by reconcile). Source of truth: lib/content/video/job-store.ts.';
