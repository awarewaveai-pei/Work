-- 0108 — cs_conversation_staff_replies: when a staff member last replied in public, per conversation
--
-- Until now a conversation handed to a human (Chatwoot status open) silenced the AI until it was
-- resolved, and Soulful has no auto-resolve -- so after one refund question every later question went
-- unanswered (operator, 2026-10-17: 「一下轉自動回 一下轉AI 一下轉真人 系統無法處理這種接續的變化」).
-- Operator-approved rules (WORKLOG 2026-10-17 續16): the AI stays silent only while a staff member has
-- replied in public in that conversation within the last 30 minutes; otherwise it answers as usual
-- (FAQ -> AI -> human). Private notes do not count: the customer never sees them.
--
-- Chatwoot posts every outgoing message to the AgentBot webhook (AgentBotListener#message_created,
-- Message#webhook_sendable?), with sender.type 'user' for staff. The webhook records the time here;
-- the AgentBot token cannot read messages back (GET 401), so the state has to be our own.
--
-- Both functions use the database clock, so "within N seconds" never depends on the app host's clock.
-- RLS on, no policy: service role only. Functions: SECURITY INVOKER, empty search_path, service_role.
--
-- APPLY WITH (High risk — needs explicit go-ahead, AGENTS.md §3; operator 2026-10-17 「做完套 migration 並部署」):
--   node scripts/apply-db-migration.mjs 0108
-- Down migration: 0108_cs_conversation_staff_replies.down.sql

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.cs_conversation_staff_replies (
  organization_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  chatwoot_conversation_id text        NOT NULL,
  last_public_reply_at     timestamptz NOT NULL,
  PRIMARY KEY (organization_id, chatwoot_conversation_id)
);
ALTER TABLE public.cs_conversation_staff_replies ENABLE ROW LEVEL SECURITY;
-- Explicit, as 0080-0097 do: RLS does not cover TRUNCATE, and the service role should not depend on
-- public's default privileges (db-expert 2026-10-17). 0104's table had the same gap; closed here too.
REVOKE ALL ON public.cs_conversation_staff_replies FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cs_conversation_staff_replies TO service_role;
REVOKE ALL ON public.cs_crisis_holding_replies FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cs_crisis_holding_replies TO service_role;

-- GREATEST: of two concurrent calls, the one that started earlier may commit later; without it the
-- older time would overwrite the newer one. The time is when the webhook is processed (database now()).
CREATE OR REPLACE FUNCTION public.cs_record_staff_reply(
  p_organization_id uuid,
  p_conversation_id text
) RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.cs_conversation_staff_replies AS r (organization_id, chatwoot_conversation_id, last_public_reply_at)
  VALUES (p_organization_id, p_conversation_id, now())
  ON CONFLICT (organization_id, chatwoot_conversation_id) DO UPDATE
    SET last_public_reply_at = GREATEST(r.last_public_reply_at, excluded.last_public_reply_at);
$$;

-- True when a staff member replied in public within the last p_seconds; false when not or never.
CREATE OR REPLACE FUNCTION public.cs_staff_replied_within(
  p_organization_id uuid,
  p_conversation_id text,
  p_seconds integer
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cs_conversation_staff_replies
     WHERE organization_id = p_organization_id
       AND chatwoot_conversation_id = p_conversation_id
       AND last_public_reply_at > now() - make_interval(secs => p_seconds)
  );
$$;

REVOKE ALL ON FUNCTION public.cs_record_staff_reply(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.cs_staff_replied_within(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_record_staff_reply(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cs_staff_replied_within(uuid, text, integer) TO service_role;

-- New RPCs callable through PostgREST at once, also when applied by hand.
NOTIFY pgrst, 'reload schema';

COMMIT;
