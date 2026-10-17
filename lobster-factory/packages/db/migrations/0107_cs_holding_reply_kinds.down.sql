-- Down migration for 0107_cs_holding_reply_kinds.sql: back to 0104 (one window per conversation).
-- Deploy code that no longer calls the *_holding_reply functions first. Run by hand (psql as
-- supabase_admin): apply-db-migration.mjs skips .down files, so this file clears its own ledger row
-- and reloads PostgREST. One-way loss: threat window rows are deleted (0104 has no such kind), so a
-- conversation may get one more threat reply after a rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Strongest lock first: the DELETE below would otherwise take ROW EXCLUSIVE and upgrade (db-expert).
LOCK TABLE public.cs_crisis_holding_replies IN ACCESS EXCLUSIVE MODE;

DROP FUNCTION IF EXISTS public.cs_confirm_holding_reply(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.cs_claim_holding_reply(uuid, text, text, integer, integer);

DELETE FROM public.cs_crisis_holding_replies WHERE kind <> 'self_harm';
ALTER TABLE public.cs_crisis_holding_replies DROP CONSTRAINT cs_crisis_holding_replies_pkey;
ALTER TABLE public.cs_crisis_holding_replies
  ADD CONSTRAINT cs_crisis_holding_replies_pkey PRIMARY KEY (organization_id, chatwoot_conversation_id);
ALTER TABLE public.cs_crisis_holding_replies DROP CONSTRAINT IF EXISTS cs_crisis_holding_replies_kind_check;
ALTER TABLE public.cs_crisis_holding_replies DROP COLUMN IF EXISTS kind;

-- 0104's function bodies, verbatim.
CREATE OR REPLACE FUNCTION public.cs_claim_crisis_holding(
  p_organization_id uuid,
  p_conversation_id text,
  p_window_seconds integer,
  p_inflight_seconds integer
) RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.cs_crisis_holding_replies AS r (organization_id, chatwoot_conversation_id, claim_id, claimed_at, sent_at)
  VALUES (p_organization_id, p_conversation_id, gen_random_uuid(), now(), NULL)
  ON CONFLICT (organization_id, chatwoot_conversation_id) DO UPDATE
    SET claim_id = excluded.claim_id, claimed_at = excluded.claimed_at, sent_at = NULL
    WHERE (r.sent_at IS NOT NULL AND r.sent_at <= now() - make_interval(secs => p_window_seconds))
       OR (r.sent_at IS NULL AND r.claimed_at <= now() - make_interval(secs => p_inflight_seconds))
  RETURNING r.claim_id;
$$;

CREATE OR REPLACE FUNCTION public.cs_confirm_crisis_holding(
  p_organization_id uuid,
  p_conversation_id text,
  p_claim_id uuid
) RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH u AS (
    UPDATE public.cs_crisis_holding_replies
       SET sent_at = now()
     WHERE organization_id = p_organization_id
       AND chatwoot_conversation_id = p_conversation_id
       AND claim_id = p_claim_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u);
$$;

-- The ledger (0092) must not keep saying 0107 is applied; absent on a database without 0092.
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM public.schema_migrations WHERE filename = '0107_cs_holding_reply_kinds.sql';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
