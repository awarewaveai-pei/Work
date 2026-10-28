-- 0139: when the content_pipeline schedule last TRIED to plan this site's month (AUTO_CONTENT P9.2, invariant B2): the
-- mark is written before the paid AI call, so an answer that cannot be read costs one attempt per 24 hours, not one per
-- 5-minute sweep. client_schedules.last_error is cleared by the next success and in-memory marks reset at each deploy, so
-- neither can be the cool-down. null = never tried. Additive: old code never reads it; RLS unchanged.
-- APPLY:  node scripts/apply-db-migration.mjs 0139
-- Down:   packages/db/migrations/0139_wp_sites_content_plan_attempted_at.down.sql (revert the app first)
begin;
set local lock_timeout = '5s';

alter table public.wp_sites add column if not exists content_plan_attempted_at timestamptz;

notify pgrst, 'reload schema';
commit;
