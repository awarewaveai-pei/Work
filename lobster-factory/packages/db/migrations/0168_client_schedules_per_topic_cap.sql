-- 0168: a per-client cap on what one content_pipeline topic may spend, NT$ (N2, plan O6 2026-11-19: 每題上限 NT$15).
-- null = the default (next-admin lib/content/topics/budget.ts DEFAULT_TOPIC_CAP_TWD = 15), so applying this changes nothing.
-- 1-1000 whole NT$: the choices on /ops/schedules (next-admin lib/schedules/jobs.ts perTopicCap.options).
-- What a topic spent is not stored here: ai_call_logs where job_id = the topic id (0046), summed by budget.ts.
-- Additive: old code never reads it. Nullable, no default: catalog-only add; the CHECK scans an all-null column.
-- APPLY:  node scripts/apply-db-migration.mjs 0168
-- Down:   packages/db/migrations/0168_client_schedules_per_topic_cap.down.sql (revert the app first)
begin;
set local lock_timeout = '5s';

alter table public.client_schedules
  add column if not exists per_topic_cap_twd int check (per_topic_cap_twd between 1 and 1000);

notify pgrst, 'reload schema';
commit;
