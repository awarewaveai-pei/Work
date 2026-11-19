-- 0172: the brand week (Monday, organizations.default_timezone) whose member newsletter draft the member_newsletter schedule
-- last CLAIMED for this site (N10). Claimed by a conditional UPDATE (null or an earlier Monday -> this one) BEFORE the bridge
-- call that creates the FluentCRM draft, so two firings can never both create one for the same week: only the one whose
-- UPDATE returns the row goes on. A failed call after the claim waits for the next week (at most one draft per site per
-- week). null = never claimed. Additive: old code never reads it; only organizations whose member_newsletter schedule is
-- enabled are ever claimed. RLS unchanged.
-- APPLY:  node scripts/apply-db-migration.mjs 0172
-- Down:   packages/db/migrations/0172_wp_sites_member_newsletter_week.down.sql (revert the app first)
begin;
set local lock_timeout = '5s';

alter table public.wp_sites add column if not exists member_newsletter_week date;

notify pgrst, 'reload schema';
commit;
