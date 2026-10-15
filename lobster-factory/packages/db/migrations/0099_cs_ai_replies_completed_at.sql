-- 0099 — cs_ai_replies.completed_at: tell a claimed message from a finished one
--
-- The Chatwoot webhook (app/api/webhooks/chatwoot/route.ts) now answers right after claimMessage and
-- runs the pipeline after the response: Chatwoot v4.18 fails an AgentBot call after 5 s
-- (WEBHOOK_TIMEOUT) and then opens the conversation itself. The claim row's placeholder action
-- 'handoff' (lib/cs/db.ts claimMessage) reads exactly like a finished handoff, so a pipeline cut off
-- mid-way (container restart on deploy) left no trace. NULL = claimed, outcome not yet delivered to
-- Chatwoot (lib/cs/db.ts completeClaim); the CS sweep (lib/cs/sweep.ts) hands stale NULL rows to a human.
--
-- Backfill: every existing row was written by the synchronous route, which finished or failed
-- inside the request; none is still in flight. cs_ai_replies is small (a handful of rows), so the
-- ADD COLUMN (no default: catalog-only) + UPDATE + plain CREATE INDEX hold their locks for
-- milliseconds; apply-db-migration.mjs refuses CONCURRENTLY inside a transaction anyway.
--
-- APPLY WITH (High risk — needs explicit go-ahead, AGENTS.md §3):
--   node scripts/apply-db-migration.mjs 0099
-- Down migration: 0099_cs_ai_replies_completed_at.down.sql

BEGIN;

ALTER TABLE public.cs_ai_replies ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE public.cs_ai_replies SET completed_at = created_at WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS cs_ai_replies_unfinished_idx
  ON public.cs_ai_replies (created_at)
  WHERE completed_at IS NULL;

COMMIT;
