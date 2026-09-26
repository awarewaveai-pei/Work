-- Down migration for 0092_schema_migrations_ledger.sql.
-- Drops the ledger table entirely -- the record of what has been applied is itself only ever
-- useful while something might rely on it; rolling back 0092 means going back to guessing.
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0092_schema_migrations_ledger_down.sql

BEGIN;

DROP TABLE IF EXISTS public.schema_migrations;

NOTIFY pgrst, 'reload schema';

COMMIT;
