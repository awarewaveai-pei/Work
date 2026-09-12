-- 0082 — durable per-host rate-limit bucket: the store lib/collect/net/rate-limit.ts's own header
-- comment already designed for ("C3 swaps the in-memory default for a durable one and nothing else
-- changes"). Closes DATA_COLLECTION_PLAN.md's C3 DoD: two crawls scheduled at the same time (a
-- manual "run now" overlapping the hourly sweep, or two tenants sharing a target host) currently
-- each get their own fresh in-memory token bucket per runCollection() call, so the target sees their
-- combined QPS, not the configured ceiling per host.
--
-- WHY A DB FUNCTION AND NOT read-then-write FROM THE APPLICATION: RateLimitStore.take() is documented
-- as one atomic operation -- refill, decide, write, with no await in between an observer could land
-- in. From the application that would need a distributed lock; from inside Postgres it is a single
-- `SELECT ... FOR UPDATE` + `UPDATE` inside one function call, which Postgres already serializes
-- per row. The arithmetic (refill / grant / wait) is written to mirror rate-limit.ts's nextBucket()
-- line for line, verified in the same real-Postgres harness style as 0072/0076 (kb-local-verify.sh)
-- by running randomised request sequences through both and asserting identical wait_ms.
--
-- BUCKET IS KEYED BY HOST, NOT BY ORGANIZATION: the shared resource being protected is the target
-- site's own capacity, which does not care which tenant's crawl is hitting it. Two different
-- organizations' crawls of the same host must share one bucket, or the fix does not close the gap
-- it was built for.
--
-- FIRST-EVER REQUEST NEVER WAITS: nextBucket()'s `state !== null` check means minIntervalMs (a
-- robots.txt Crawl-delay) is never enforced before a host's very first request. The function
-- reproduces this by using `INSERT ... ON CONFLICT DO NOTHING RETURNING host` to learn whether THIS
-- call created the row -- not by checking whether tokens/last_refill_ms already looked "fresh",
-- which a genuinely fresh row and an old, fully-refilled one are indistinguishable by value alone.
--
-- APPLY WITH (Medium risk -- additive only, no existing table/column touched):
--   node scripts/apply-db-migration.mjs 0082
-- Down migration: packages/db/scripts/0082_collection_rate_limit_buckets_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.collection_rate_limit_buckets (
  host            text PRIMARY KEY,
  tokens          double precision NOT NULL,
  last_refill_ms  bigint           NOT NULL,
  updated_at      timestamptz      NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.collection_rate_limit_buckets;
CREATE POLICY "service_role only" ON public.collection_rate_limit_buckets
  TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.collection_rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.collection_rate_limit_buckets TO service_role;

-- SECURITY DEFINER would be needed only if a non-service_role caller had to invoke this without
-- table access; the only caller is next-admin's service-role client, so INVOKER (the default) is
-- correct and keeps this function subject to the same RLS/grants as the table it touches.
CREATE OR REPLACE FUNCTION public.collection_rate_limit_take(
  p_host              text,
  p_rate_per_second   double precision,
  p_burst             double precision,
  p_min_interval_ms   bigint,
  p_now               bigint
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_rate               double precision := greatest(p_rate_per_second, 0.001);
  v_burst              double precision := greatest(p_burst, 1);
  v_created            boolean;
  v_prev_tokens        double precision;
  v_prev_last_refill   bigint;
  v_refilled           double precision;
  v_since_last         bigint;
  v_interval_wait      bigint;
  v_token_wait         bigint;
  v_wait_ms            bigint;
  v_new_tokens         double precision;
  v_new_last_refill    bigint;
BEGIN
  IF p_host IS NULL OR btrim(p_host) = '' THEN
    RAISE EXCEPTION 'collection_rate_limit_take: p_host must not be empty';
  END IF;

  -- Seed a fresh row with a full bucket if none exists yet. Whether THIS statement is the one that
  -- created it is the only reliable way to know "first request ever for this host" -- see header.
  WITH ins AS (
    INSERT INTO public.collection_rate_limit_buckets (host, tokens, last_refill_ms, updated_at)
    VALUES (p_host, v_burst, p_now, now())
    ON CONFLICT (host) DO NOTHING
    RETURNING host
  )
  SELECT EXISTS (SELECT 1 FROM ins) INTO v_created;

  IF v_created THEN
    v_prev_tokens := v_burst;
    v_prev_last_refill := p_now;
  ELSE
    -- Row already existed (created by an earlier call, possibly milliseconds ago by a concurrent
    -- one) -- lock it so a second caller arriving while we are between SELECT and UPDATE blocks
    -- here instead of reading the same stale tokens value we are about to overwrite.
    SELECT tokens, last_refill_ms INTO v_prev_tokens, v_prev_last_refill
    FROM public.collection_rate_limit_buckets
    WHERE host = p_host
    FOR UPDATE;
  END IF;

  v_refilled := least(v_burst, v_prev_tokens + ((p_now - v_prev_last_refill) / 1000.0) * v_rate);
  v_since_last := p_now - v_prev_last_refill;

  -- `p_min_interval_ms <> 0`, not just IS NOT NULL: nextBucket()'s own guard is `req.minIntervalMs &&
  -- ...` (line ~57 of rate-limit.ts), and 0 is falsy in JS -- an explicit 0 must behave identically
  -- to "no interval floor", not to "since_last < 0" (always false, but for the wrong reason).
  IF (NOT v_created) AND p_min_interval_ms IS NOT NULL AND p_min_interval_ms <> 0 AND v_since_last < p_min_interval_ms THEN
    v_interval_wait := p_min_interval_ms - v_since_last;
  ELSE
    v_interval_wait := 0;
  END IF;

  IF v_refilled >= 1 AND v_interval_wait = 0 THEN
    v_new_tokens := v_refilled - 1;
    v_new_last_refill := p_now;
    v_wait_ms := 0;
  ELSE
    IF v_refilled >= 1 THEN
      v_token_wait := 0;
    ELSE
      v_token_wait := ceil(((1 - v_refilled) / v_rate) * 1000)::bigint;
    END IF;
    v_wait_ms := greatest(v_token_wait, v_interval_wait);
    -- The token is reserved NOW, at the time the wait ends -- a second caller arriving during the
    -- wait must see an empty bucket, not a full one (nextBucket()'s own comment, mirrored here).
    v_new_tokens := 0;
    v_new_last_refill := p_now + v_wait_ms;
  END IF;

  -- One write path regardless of v_created: the seed INSERT above wrote a placeholder burst/now
  -- row so this UPDATE always has a row to lock/overwrite with the real post-take state.
  UPDATE public.collection_rate_limit_buckets
  SET tokens = v_new_tokens, last_refill_ms = v_new_last_refill, updated_at = now()
  WHERE host = p_host;

  RETURN v_wait_ms;
END;
$$;

REVOKE ALL ON FUNCTION public.collection_rate_limit_take(text, double precision, double precision, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collection_rate_limit_take(text, double precision, double precision, bigint, bigint) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
