-- 0104 — cs_crisis_holding_replies: one help-line reply per conversation per window while a human owns it
--
-- When a human owns a Chatwoot conversation (status open) the AI stays silent
-- (app/api/webhooks/chatwoot/route.ts human_owns_thread). A crisis message there pages the operator,
-- and now also gets one automatic reply with the help lines -- at most once per conversation per
-- window (operator decision 2026-10-17, WORKLOG 2026-10-17 續3, 續7). The window needs stored state:
-- the AgentBot token is refused on Chatwoot GET, so the conversation itself cannot be read back.
--
-- One row per conversation. cs_claim_crisis_holding claims atomically (INSERT ... ON CONFLICT DO
-- UPDATE ... WHERE): of two webhooks racing on one conversation exactly one gets a claim_id. A claim
-- is pending (sent_at NULL) until cs_confirm_crisis_holding records the send. Invariant: a missing
-- help line is worse than a repeated one, so only a CONFIRMED send blocks for the whole window; a
-- pending claim blocks only p_inflight_seconds (a send in flight), so a process killed mid-send or a
-- failed release costs at most that long, never the window (Codex partialreview-56ee2770 F1).
--
-- RLS on, no policy: service role only (0094 would turn RLS on anyway). Functions: SECURITY INVOKER,
-- empty search_path, executable by service_role only.
--
-- APPLY WITH (High risk — needs explicit go-ahead, AGENTS.md §3):
--   node scripts/apply-db-migration.mjs 0104
-- Down migration: 0104_cs_crisis_holding_replies.down.sql

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.cs_crisis_holding_replies (
  organization_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  chatwoot_conversation_id text        NOT NULL,
  claim_id                 uuid        NOT NULL,
  claimed_at               timestamptz NOT NULL DEFAULT now(),
  sent_at                  timestamptz,
  PRIMARY KEY (organization_id, chatwoot_conversation_id)
);
ALTER TABLE public.cs_crisis_holding_replies ENABLE ROW LEVEL SECURITY;

-- The new claim_id when this call may send; NULL while a confirmed send is inside the window or a
-- pending one is still in flight.
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

-- Records the send for this claim only; true when the row was still this claim's.
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

REVOKE ALL ON FUNCTION public.cs_claim_crisis_holding(uuid, text, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_confirm_crisis_holding(uuid, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_claim_crisis_holding(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cs_confirm_crisis_holding(uuid, text, uuid) TO service_role;

COMMIT;
