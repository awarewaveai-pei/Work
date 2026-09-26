-- Down migration for 0093_pod_order_inbox.sql. Refuses while any order is still open (pending /
-- deferred / failed): those rows are the only record of paid orders that have no Printful draft yet.
-- Resolve them first (tools/publish pforder, or let the sweep finish). Removes 0093's ledger row in the
-- same transaction so `apply-db-migration.mjs --status` stays true.
--
-- APPLY WITH:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 0093_pod_order_inbox_down.sql

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.pod_order_inbox') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.pod_order_inbox WHERE status IN ('pending', 'deferred', 'failed')) THEN
    RAISE EXCEPTION 'pod_order_inbox still has open paid orders -- resolve them before dropping the table';
  END IF;
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM public.schema_migrations WHERE filename = '0093_pod_order_inbox.sql';
  END IF;
END $$;

DROP TABLE IF EXISTS public.pod_order_inbox;

NOTIFY pgrst, 'reload schema';

COMMIT;
