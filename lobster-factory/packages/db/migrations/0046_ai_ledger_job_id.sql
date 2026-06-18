-- 0046_ai_ledger_job_id.sql
-- Add job_id to ai_call_logs + ai_image_jobs so cost rows can be grouped into one
-- "job" (e.g. one article, one Studio generation, one Tarot batch).
-- Also adds cost_usd to ai_image_jobs (was absent — /ops/costs computed it client-side from model
-- lookup; now stored at write time so the Ledger tab can sum without the rate table).
-- Purely additive (ALTER TABLE ADD COLUMN … NULL) — fully backward-compatible. Rollback: DROP COLUMNs.

-- ai_call_logs -----------------------------------------------------------------
ALTER TABLE public.ai_call_logs
  ADD COLUMN IF NOT EXISTS job_id uuid NULL,
  ADD COLUMN IF NOT EXISTS tool   text NULL;  -- e.g. "content" | "studio" | "tarot" | "video" | "mockup"

CREATE INDEX IF NOT EXISTS ai_call_logs_job_id_idx ON public.ai_call_logs (job_id)
  WHERE job_id IS NOT NULL;

-- ai_image_jobs ----------------------------------------------------------------
ALTER TABLE public.ai_image_jobs
  ADD COLUMN IF NOT EXISTS job_id   uuid NULL,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(12,6) NULL;

CREATE INDEX IF NOT EXISTS ai_image_jobs_job_id_idx ON public.ai_image_jobs (job_id)
  WHERE job_id IS NOT NULL;
