-- 0043_ai_call_logs.sql
-- Per-call usage + cost ledger for text-LLM calls (Anthropic / OpenAI / Perplexity / Gemini).
--
-- Why: every LLM response carries an exact token `usage`, but the content routes streamed it
-- straight to the client and discarded it (generate-core.ts, humanize, outline, …) — so the app
-- had ZERO record of what it spent on text. Image jobs are logged in ai_image_jobs (coarse: model
-- + provider only); this table is the text-side ledger with EXACT tokens + computed USD, so
-- /ops/costs and the cost report show real spend, not an estimate.
--
-- Purely additive (CREATE TABLE only) — no existing object is altered. Rollback: DROP TABLE ai_call_logs.

CREATE TABLE IF NOT EXISTS public.ai_call_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  organization_id      uuid NULL,            -- internal ops calls often have no client org
  route                text NOT NULL,        -- e.g. /api/content/generate, lib/studio/product-copy
  model                text NOT NULL,        -- exact model id sent (claude-sonnet-4-6, gpt-5.4, …)
  vendor               text NULL,            -- Anthropic | OpenAI | Perplexity | Google
  input_tokens         integer NOT NULL DEFAULT 0,
  output_tokens        integer NOT NULL DEFAULT 0,
  cache_read_tokens    integer NOT NULL DEFAULT 0,
  cache_write_tokens   integer NOT NULL DEFAULT 0,
  cost_usd             numeric(12,6) NOT NULL DEFAULT 0,  -- computed by lib/ai/cost-calculator at write time
  actor_role           text NULL,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Time-range + grouping queries (the report and /ops/costs scan by created_at, group by route/model).
CREATE INDEX IF NOT EXISTS ai_call_logs_created_at_idx ON public.ai_call_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_logs_route_idx       ON public.ai_call_logs (route);
CREATE INDEX IF NOT EXISTS ai_call_logs_org_idx         ON public.ai_call_logs (organization_id);

-- RLS deny-by-default: enable RLS with NO anon/auth policy, so only the service-role key (which
-- bypasses RLS) can read/write. Mirrors 0033_repair_runs_rls_deny_anon — this is an internal ops
-- ledger, never touched by the public anon key.
ALTER TABLE public.ai_call_logs ENABLE ROW LEVEL SECURITY;
