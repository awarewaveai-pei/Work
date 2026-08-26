-- 0060_video_jobs_add_org.sql
-- Tenant ownership for async video-render jobs.
--
-- WHY (2026-08-26): video_jobs (0047) has no owner column. The org a job belongs to lives
-- only inside record_params (jsonb), which is written AFTER prepare succeeds
-- (apps/next-admin/app/api/video/generate/route.ts:134-150) and is absent entirely on the
-- failure paths (:128, :154). So "who owns this job" is unanswerable for every failed
-- render — there is nothing an authorization check can read. /api/video/status therefore
-- carried no tenant barrier at all, and its FIRST branch (status/route.ts:58) returns
-- job.video: the complete set of R2 output URLs.
--
-- Why not just assert on record_params.organizationId: that 403s a client on its OWN failed
-- render, permanently, because record_params is undefined there. A guard that breaks the
-- error path is not a fix. Ownership has to be a column, written at row creation,
-- independent of whether the record payload was ever completed.
--
-- Deliberately NOT indexed: every access to this table is by primary key (job-store.ts
-- getJob / finishJob / updateJobStep all .eq("id", ...)). The only scan is the TTL prune,
-- which uses video_jobs_created_at_idx. A planner would never choose an org index here.
-- (0054_repair_runs_add_org DOES index its column because that table is queried BY org.)
--
-- Relationship to the tracked "persistent outName -> organization_id mapping" task:
-- complementary, not a second mechanism. That task removes reconcile's need to guess the
-- tenant by parsing R2 object keys. This column records the tenant that was already known
-- and authoritative at submit time, so the job itself can be authorized.

-- ADD COLUMN takes ACCESS EXCLUSIVE. Execution is metadata-only (nullable, no default,
-- an all-NULL FK needs no validation scan) so the hold is sub-millisecond, but acquisition
-- can queue behind an in-flight /status poll. Abort rather than freeze polling. Same guard
-- and rationale as 0058_ops_incidents_parent_incident.
set lock_timeout = '3s';

alter table public.video_jobs
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

reset lock_timeout;

-- Nullable on purpose. Exactly three ways a row gets NULL here:
--   1. created before this migration  -- self-heals, the table has a 1h TTL
--   2. a staff caller while POD_DESIGNS_DEFAULT_ORG_ID is unset (effectiveOrgId -> null)
--   3. NOT a client caller -- effectiveOrgId THROWS for a client with no org binding
--      (apps/next-admin/lib/tenant-guard.ts:113-119), so a client job always carries its org.
-- assertOrgAccess(req, null) passes staff and blocks client, i.e. fail-closed in the only
-- case that matters.
comment on column public.video_jobs.organization_id is
  'Owning tenant, written by createJob() at row creation (lib/content/video/job-store.ts). Authorization source of truth for /api/video/status. record_params.organizationId is the record payload, not an authz fact.';

-- Reload PostgREST schema cache. Without this the new column is invisible to the REST layer
-- and every createJob() insert fails with PGRST204 -- which now THROWS instead of degrading
-- silently, so the failure is loud rather than "every video returns job_not_found".
-- Same requirement as 0054/0058.
notify pgrst, 'reload schema';
