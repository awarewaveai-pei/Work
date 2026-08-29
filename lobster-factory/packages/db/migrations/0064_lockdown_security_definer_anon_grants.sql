-- Migration 0064: close the anon/authenticated EXECUTE gap on two SECURITY DEFINER
-- functions that predate the C1 pattern fixed in 0063_portal_complete_signup.sql.
--
-- BACKGROUND (C1, 2026-08-29): a critic review of 0063 found -- and verified live
-- against ks-aw-01 (`select proacl from pg_proc`) -- that Supabase's own
-- `ALTER DEFAULT PRIVILEGES` grants EXECUTE on every new public-schema function to
-- `anon` and `authenticated` EXPLICITLY. That grant is separate from PUBLIC; a bare
-- `revoke all on function ... from public;` does not touch it. 0063 was written with
-- both revokes from day one. This migration retrofits the same fix onto the two
-- older SECURITY DEFINER functions that were not: verified live via
-- `select proname, proacl from pg_proc where prosecdef = true` (see WORKLOG
-- 2026-08-29 entry for the full pre-fix proacl dump).
--
-- 1) public.archive_stale_repair_runs(int)   -- migrations 0030, 0032
--    Pre-fix proacl carried `anon=X/supabase_admin, authenticated=X/supabase_admin`
--    alongside service_role. Both migrations only ever ran
--    `revoke all on function ... from public;` (the same insufficient pattern as
--    0030:44, the exact line the critic's finding cites). Callers are exclusively
--    server-side: lib/repair-center/service.ts archiveStaleRuns() via
--    getSupabaseWriteClient() (service-role, no anon fallback) and the pg_cron job
--    scheduled in 0030. Never called from browser/client code -- confirmed by grep
--    across infra/hetzner-phase1-core/apps/next-admin for `archive_stale_repair_runs`,
--    independently re-verified by db-expert review (2026-08-29).
--
-- 2) public.upsert_incident_atomic(14-arg)   -- migrations 0035, 0036, 0056
--    Worse than (1): none of its three migrations ever ran ANY revoke/grant, so it
--    ran for its entire life on Supabase's bare defaults. Pre-fix proacl carried
--    the PUBLIC grant itself (`=X/supabase_admin`) *plus* anon and authenticated --
--    any holder of the browser-shipped anon key could POST
--    /rest/v1/rpc/upsert_incident_atomic directly and insert/mutate ops_incidents
--    rows as supabase_admin, bypassing every webhook route's signature/secret
--    checks entirely. Callers are exclusively server-side: the 6 webhook routes
--    (app/api/webhooks/{sentry,uptime-kuma,posthog,netdata,deploy,grafana}/route.ts)
--    via getSupabaseWriteClient() (service-role) -- confirmed by grep across
--    infra/hetzner-phase1-core/apps/next-admin for `upsert_incident_atomic` /
--    `upsertIncidentAtomic(`, independently re-verified by db-expert review
--    (2026-08-29).
--
-- Both functions are intentionally called ONLY via service-role backend code, never
-- via a browser-facing anon/authenticated session, so the fix is a straight lockdown
-- to match the 0049/0063 house pattern -- no application-code change needed.
--
-- NOT covered here (already correct, confirmed live 2026-08-29):
--   public.secret_put/secret_get/secret_delete (0049) -- proacl: supabase_admin/
--     postgres/service_role only.
--   public.portal_complete_signup (0063) -- proacl: supabase_admin/postgres/
--     service_role only.
--
-- ⚠ CLASS RISK (db-expert review 2026-08-29, not fixed by this migration, tracked
-- separately in TASKS.md): 0036 and 0056 both used DROP FUNCTION + CREATE (not
-- CREATE OR REPLACE) to change upsert_incident_atomic's signature. A DROP+CREATE
-- cycle re-triggers Supabase's ALTER DEFAULT PRIVILEGES and silently re-opens the
-- anon/authenticated grant this migration closes. Any FUTURE signature change to
-- upsert_incident_atomic that uses DROP+CREATE (rather than CREATE OR REPLACE, which
-- preserves ACLs) MUST re-run this same revoke block in the same migration, or add a
-- proacl assertion to check-smoke-tests.ps1 so the regression is caught automatically
-- instead of waiting for the next manual critic pass.
--
-- ⚠ APPLY NOTE: `proacl`'s grantor on both functions is `supabase_admin`. Only
-- `supabase_admin` (or a superuser) can REVOKE grants it made. `postgres` is NOT
-- rolsuper on the supabase/postgres image (see
-- agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md) -- running this as
-- `postgres` emits `WARNING: no privileges could be revoked` and exits 0, silently
-- doing nothing. Apply with `psql -U supabase_admin`, then re-run the proacl query
-- below to confirm.
--
-- Down migration: packages/db/scripts/0064_lockdown_security_definer_anon_grants_down.sql
-- (documentation-only -- re-granting anon/authenticated is never something we want).
--
-- ⚠ CODEX ORACLE REVIEW (2026-08-29, report:
-- agency-os/reports/oracle/2026-08-29-review-831c16d0.md): flagged that the
-- pg_cron job scheduled in 0030 (`archive-stale-repair-runs`) is a caller whose DB
-- role is not fixed by the app-code grep this migration's comments cite -- if it
-- ran as a role other than one still granted EXECUTE after this migration, the
-- daily archive job would start failing silently. VERIFIED LIVE (not assumed):
--   select jobid, jobname, username, command from cron.job;
--     -> jobid=1, jobname=archive-stale-repair-runs, username=supabase_admin
--   select p.proname, r.rolname from pg_proc p join pg_roles r on r.oid=p.proowner
--     where p.proname in ('archive_stale_repair_runs','upsert_incident_atomic');
--     -> both owned by supabase_admin
-- The cron job runs as supabase_admin, which OWNS both functions. Postgres object
-- owners implicitly bypass ACL/GRANT checks on objects they own (REVOKE targets
-- named roles; it never touches the owner's implicit privilege), so this migration
-- -- which only revokes from public/anon/authenticated, never from supabase_admin
-- -- cannot break the cron job. Confirmed cron.job has exactly one row (no other
-- scheduled caller of either function exists). Finding verified as a non-issue for
-- current DB state; the check was correct to run.

revoke all on function public.archive_stale_repair_runs(int) from public;
revoke all on function public.archive_stale_repair_runs(int) from anon, authenticated;
grant execute on function public.archive_stale_repair_runs(int) to service_role;

revoke all on function public.upsert_incident_atomic(
  text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text, text
) from public;
revoke all on function public.upsert_incident_atomic(
  text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text, text
) from anon, authenticated;
grant execute on function public.upsert_incident_atomic(
  text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean, text, text
) to service_role;

comment on function public.archive_stale_repair_runs(int) is
  'Soft-archives stale repair_runs. '
  'Terminal runs (resolved/rolled_back/human_only) archived after retention_days (default 90). '
  'triage_needed runs archived after 14 days of inactivity (hardcoded, see 0032 migration). '
  'Call via POST /api/ops/repairs/archive-stale or pg_cron job archive-stale-repair-runs. '
  'service_role EXECUTE only -- revoked from public AND anon/authenticated explicitly '
  '(Supabase grants those by default; see 0064 C1-pattern note).';

comment on function public.upsert_incident_atomic is
  'Atomic incident upsert. occurrence_count uses SET count + 1 (row-locked), not a
JS-computed literal (M10). Severity: max(existing, incoming). Reopen computed from
current DB status. 0036: stores fingerprint_v2 (M4 salted fingerprint).
0056: stores client_slug from normalizer (e.g. Uptime Kuma "client" tag);
COALESCE on UPDATE preserves existing non-null client_slug against a null incoming.
Conflict target remains (fingerprint, environment).
service_role EXECUTE only -- revoked from public AND anon/authenticated explicitly
(Supabase grants those by default; this function ran on bare defaults, including a
live PUBLIC grant, from 0035 until this 0064 fix -- see 0064 C1-pattern note and the
DROP+CREATE class-risk note: any future signature change via DROP+CREATE must re-run
this revoke block).';

notify pgrst, 'reload schema';

-- POST-APPLY CHECK (run after applying, before closing out):
--   docker exec supabase-db psql -U supabase_admin -d postgres -Atc \
--     "select proname, proacl from pg_proc where proname in ('archive_stale_repair_runs','upsert_incident_atomic');"
-- Expected: only supabase_admin/postgres/service_role entries on both rows -- NO
-- anon, NO authenticated, and NO blank-grantee (PUBLIC) entry.
