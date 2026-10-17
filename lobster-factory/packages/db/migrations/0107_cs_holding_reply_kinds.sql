-- 0107 — cs_crisis_holding_replies gets a kind: self-harm help lines and the threat reply keep separate windows
--
-- 0104 keyed the "one automatic reply per conversation per window while a human owns it" state by
-- conversation alone. The threat reply (operator decision 2026-10-17, WORKLOG 2026-10-17 續13/續14)
-- needs the same window, and sharing the row would let a threat reply block the self-harm help lines
-- for 30 minutes -- against 0104's invariant that a missing help line is worse than a repeated one.
-- So the key becomes (organization, conversation, kind).
--
-- Rollout: apply BEFORE deploying the code that calls cs_claim_holding_reply / cs_confirm_holding_reply.
-- The 0104 functions keep their signatures and now act on kind 'self_harm', so code deployed before
-- this migration keeps working in between. Existing rows become 'self_harm' (the only kind 0104 wrote).
--
-- APPLY WITH (High risk — needs explicit go-ahead, AGENTS.md §3; operator 2026-10-17 「需要的 migration 可以做」):
--   node scripts/apply-db-migration.mjs 0107
-- Down migration: 0107_cs_holding_reply_kinds.down.sql

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.cs_crisis_holding_replies
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'self_harm';
-- The default only backfills existing rows. Kept, a write that forgets the kind would silently share
-- the self-harm window -- the very thing this migration separates (db-expert 2026-10-17).
ALTER TABLE public.cs_crisis_holding_replies ALTER COLUMN kind DROP DEFAULT;
ALTER TABLE public.cs_crisis_holding_replies
  ADD CONSTRAINT cs_crisis_holding_replies_kind_check CHECK (kind IN ('self_harm', 'threat'));
ALTER TABLE public.cs_crisis_holding_replies DROP CONSTRAINT cs_crisis_holding_replies_pkey;
ALTER TABLE public.cs_crisis_holding_replies
  ADD CONSTRAINT cs_crisis_holding_replies_pkey PRIMARY KEY (organization_id, chatwoot_conversation_id, kind);

-- Same rules as 0104 cs_claim_crisis_holding, per kind.
CREATE OR REPLACE FUNCTION public.cs_claim_holding_reply(
  p_organization_id uuid,
  p_conversation_id text,
  p_kind text,
  p_window_seconds integer,
  p_inflight_seconds integer
) RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.cs_crisis_holding_replies AS r (organization_id, chatwoot_conversation_id, kind, claim_id, claimed_at, sent_at)
  VALUES (p_organization_id, p_conversation_id, p_kind, gen_random_uuid(), now(), NULL)
  ON CONFLICT (organization_id, chatwoot_conversation_id, kind) DO UPDATE
    SET claim_id = excluded.claim_id, claimed_at = excluded.claimed_at, sent_at = NULL
    WHERE (r.sent_at IS NOT NULL AND r.sent_at <= now() - make_interval(secs => p_window_seconds))
       OR (r.sent_at IS NULL AND r.claimed_at <= now() - make_interval(secs => p_inflight_seconds))
  RETURNING r.claim_id;
$$;

CREATE OR REPLACE FUNCTION public.cs_confirm_holding_reply(
  p_organization_id uuid,
  p_conversation_id text,
  p_kind text,
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
       AND kind = p_kind
       AND claim_id = p_claim_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u);
$$;

-- 0104's functions, same signatures, now the self-harm window (their ON CONFLICT target no longer
-- matches a unique key after the primary-key change, so they must be replaced, not left as they were).
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
  SELECT public.cs_claim_holding_reply(p_organization_id, p_conversation_id, 'self_harm', p_window_seconds, p_inflight_seconds);
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
  SELECT public.cs_confirm_holding_reply(p_organization_id, p_conversation_id, 'self_harm', p_claim_id);
$$;

REVOKE ALL ON FUNCTION public.cs_claim_holding_reply(uuid, text, text, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_confirm_holding_reply(uuid, text, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_claim_holding_reply(uuid, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cs_confirm_holding_reply(uuid, text, text, uuid) TO service_role;

-- New RPCs must be callable through PostgREST at once, also when this file is applied by hand
-- (apply-db-migration.mjs reloads too; Codex partialreview-86ad534c).
NOTIFY pgrst, 'reload schema';

COMMIT;
