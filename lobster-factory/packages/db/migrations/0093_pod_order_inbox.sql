-- 0093 — pod_order_inbox: durable landing table for paid WooCommerce orders (decision:
-- agency-os/reports/decisions/2026-09-26-system-mode-inbound-events.md). WooCommerce never re-sends a
-- failed delivery and disables the webhook after >5 consecutive failures
-- (includes/class-wc-webhook.php:544,562-570), so app/api/webhooks/woo-order/route.ts records the order
-- here first and always answers 2xx; this table is the only retry path from then on.
--
-- Lifecycle and concurrency rules live in lib/studio/pod-order-inbox.ts (header). In short: pending ->
-- done | failed (retried with backoff while attempts < 5) | deferred (system mode blocked; replayed
-- when it allows) | cancelled (Woo cancelled/refunded first). attempts = fulfilment claims; every
-- transition is conditional on (status, attempts).
-- organization_id is null today: one webhook secret, one native Printful store -> global mode gate.
--
-- APPLY:  node scripts/apply-db-migration.mjs 0093   (after 0092)
-- DOWN:   packages/db/scripts/0093_pod_order_inbox_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.pod_order_inbox (
  woo_order_id    text        PRIMARY KEY,
  organization_id uuid        NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  payload         jsonb       NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'deferred', 'done', 'failed', 'cancelled')),
  reason          text,
  attempts        int         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  done_at         timestamptz
);

-- Drain and stats both read open rows oldest-first.
CREATE INDEX IF NOT EXISTS pod_order_inbox_open_idx
  ON public.pod_order_inbox (created_at) WHERE status IN ('pending', 'deferred', 'failed');

ALTER TABLE public.pod_order_inbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.pod_order_inbox;
CREATE POLICY "service_role only" ON public.pod_order_inbox TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.pod_order_inbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pod_order_inbox TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
