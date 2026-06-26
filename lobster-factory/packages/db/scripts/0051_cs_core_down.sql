-- Down migration for 0051_cs_core.sql — drops all customer-service core tables.
-- Drop order respects FKs (chunks → sources). The `vector` extension is intentionally NOT
-- dropped (it may be shared by future features and is created IF NOT EXISTS).
--
-- APPLY WITH:
--   docker exec supabase-db psql -U supabase_admin -d postgres -f /tmp/0051_cs_core_down.sql

BEGIN;

DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid, vector, integer);

DROP TABLE IF EXISTS public.cs_action_log;
DROP TABLE IF EXISTS public.cs_ai_replies;
DROP TABLE IF EXISTS public.cs_customer_memory;
DROP TABLE IF EXISTS public.cs_eval_cases;
DROP TABLE IF EXISTS public.cs_tools;
DROP TABLE IF EXISTS public.cs_intents;
DROP TABLE IF EXISTS public.cs_knowledge_chunks;
DROP TABLE IF EXISTS public.cs_knowledge_sources;

NOTIFY pgrst, 'reload schema';

COMMIT;
