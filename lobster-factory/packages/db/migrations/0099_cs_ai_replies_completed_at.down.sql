-- Down migration for 0099_cs_ai_replies_completed_at.sql
BEGIN;

DROP INDEX IF EXISTS public.cs_ai_replies_unfinished_idx;
ALTER TABLE public.cs_ai_replies DROP COLUMN IF EXISTS completed_at;

COMMIT;
