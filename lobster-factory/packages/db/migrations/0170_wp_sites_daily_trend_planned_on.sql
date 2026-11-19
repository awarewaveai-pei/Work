-- 0170: the brand day (organizations.default_timezone) the content_pipeline schedule last CLAIMED the daily trend topics
-- of this site (N8). Claimed by a conditional UPDATE (null or an earlier day -> today) BEFORE the paid scoring call, so
-- two firings of the same day can never both propose: only the one whose UPDATE returns the row goes on. A failed call
-- after the claim waits for the next day (at most one spend per site per day). null = never claimed. Additive: old code
-- never reads it; only sites whose content_defaults.dailyTrendTopics is true are ever claimed. RLS unchanged.
-- APPLY:  node scripts/apply-db-migration.mjs 0170
-- Down:   packages/db/migrations/0170_wp_sites_daily_trend_planned_on.down.sql (revert the app first)
begin;
set local lock_timeout = '5s';

alter table public.wp_sites add column if not exists daily_trend_planned_on date;

notify pgrst, 'reload schema';
commit;
