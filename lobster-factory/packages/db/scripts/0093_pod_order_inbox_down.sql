-- Down migration for 0093_pod_order_inbox.sql.
-- Drops the durable Woo-order inbox table. Any row still 'deferred' or 'failed' at rollback time is
-- fulfillment history for the subsystem being rolled back, not business data kept elsewhere (the
-- Printful draft, if one was already created for a 'done' row, is untouched -- this only drops the
-- bookkeeping table).
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0093_pod_order_inbox_down.sql

BEGIN;

DROP TABLE IF EXISTS public.pod_order_inbox;

NOTIFY pgrst, 'reload schema';

COMMIT;
