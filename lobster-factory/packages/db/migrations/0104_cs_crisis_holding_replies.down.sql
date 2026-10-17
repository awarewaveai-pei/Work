-- Down migration for 0104_cs_crisis_holding_replies.sql
BEGIN;

DROP FUNCTION IF EXISTS public.cs_confirm_crisis_holding(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.cs_claim_crisis_holding(uuid, text, integer, integer);
DROP TABLE IF EXISTS public.cs_crisis_holding_replies;

COMMIT;
