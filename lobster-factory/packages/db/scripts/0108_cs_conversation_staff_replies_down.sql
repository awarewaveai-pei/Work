-- Down migration for 0108_cs_conversation_staff_replies.sql. Deploy code that no longer calls
-- cs_record_staff_reply / cs_staff_replied_within first (the old rule: open = silent). Run by hand
-- (psql as supabase_admin): apply-db-migration.mjs skips .down files, so this file clears its own
-- ledger row and reloads PostgREST. Loses the recorded staff-reply times (rebuilt by the next replies).
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.cs_staff_replied_within(uuid, text, integer);
DROP FUNCTION IF EXISTS public.cs_record_staff_reply(uuid, text);
DROP TABLE IF EXISTS public.cs_conversation_staff_replies;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM public.schema_migrations WHERE filename = '0108_cs_conversation_staff_replies.sql';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
