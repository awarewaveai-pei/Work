-- DOWN for 0062_organization_product_subscriptions.sql.
--
-- ORDER MATTERS: revert the application commit FIRST. With portal code deployed and this table
-- gone, the launcher's entitlement query errors (relation does not exist) rather than degrading.
--
-- DATA LOSS: this drops every subscription row. They are operator-entered (V1 has no Stripe to
-- re-sync from), so they are NOT reproducible. Snapshot before running:
--   docker exec supabase-db pg_dump -U supabase_admin -d postgres \
--     -t public.organization_product_subscriptions --data-only \
--     > /root/backups/0062_rollback_$(date +%Y%m%d-%H%M).sql
-- Skipping the snapshot makes this a one-way migration.

set lock_timeout = '3s';

drop trigger if exists org_product_subs_touch_updated
  on public.organization_product_subscriptions;
drop table if exists public.organization_product_subscriptions;
drop function if exists public.org_product_subs_touch_updated_at();

reset lock_timeout;

notify pgrst, 'reload schema';
