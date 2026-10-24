-- 0125: a per-client daily limit for a schedule job (operator 2026-10-25: 每天最多開始幾題，每個客戶各自設). Used by
-- content_pipeline: how many topics a brand may start per UTC day (passed as p_cap to 0121 content_topics_start).
-- null = the job's default (next-admin lib/content/topics/tick.ts DAILY_START_CAP = 2), so applying this changes nothing.
-- 1-10: the choices on /ops/schedules (next-admin lib/schedules/jobs.ts dailyLimit.options).
-- Additive: old code never reads it.
-- APPLY:  node scripts/apply-db-migration.mjs 0125
-- Down:   packages/db/migrations/0125_client_schedules_daily_limit.down.sql (revert the app first)
begin;
set local lock_timeout = '5s';

alter table public.client_schedules
  add column if not exists daily_limit int check (daily_limit between 1 and 10);

notify pgrst, 'reload schema';
commit;
