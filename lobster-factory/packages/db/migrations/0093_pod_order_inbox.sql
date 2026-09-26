-- 0093 — pod_order_inbox: durable landing table for paid WooCommerce orders (T26; decision doc
-- agency-os/reports/decisions/2026-09-26-system-mode-inbound-events.md). Invariant: system modes
-- stop changes WE start; an event a customer starts (a paid order) is never lost to a mode.
-- app/api/webhooks/woo-order/route.ts upserts one row per Woo order BEFORE checking the system-mode
-- gate, so a blocked mode defers the Printful draft (status='deferred') instead of the webhook
-- losing the order. WooCommerce disables a webhook after >5 consecutive non-2xx deliveries and never
-- re-sends (includes/class-wc-webhook.php:544,562-570) -- the route must therefore never answer
-- non-2xx because of a system mode; this table is what makes "answer 200, defer the write" possible.
--
-- status: pending (upserted, not yet resolved this delivery) -> done (draft created, or already
-- existed) | failed (gate allowed but the Printful call itself failed) | deferred (gate blocked;
-- lib/studio/pod-order-inbox.ts drainDeferredPodOrders retries oldest-first once the mode allows,
-- called from the webhook route itself and from app/api/ops/system-modes/route.ts POST on a
-- successful change to "normal"). attempts is observability only -- createDraftOrderOnNative's own
-- idempotency check (GET /orders/@{wooOrderId}) is what actually prevents a duplicate draft, not this
-- table's status field.
--
-- organization_id is nullable: this webhook has no per-order tenant selector (one WC_WEBHOOK_SECRET,
-- one native Printful store), so every row gates on global mode (organization_id = null), same as the
-- non-clientId Printful write paths added in app/api/tools/publish/route.ts and
-- app/api/tools/printful/sync/route.ts.
--
-- APPLY:  node scripts/apply-db-migration.mjs 0093   (High: new table)
-- DOWN:   packages/db/scripts/0093_pod_order_inbox_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.pod_order_inbox (
  woo_order_id    text        PRIMARY KEY,
  organization_id uuid        NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  payload         jsonb       NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'deferred', 'done', 'failed')),
  reason          text,
  attempts        int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  done_at         timestamptz
);

-- The drain path's own query shape: deferred rows oldest-first.
CREATE INDEX IF NOT EXISTS pod_order_inbox_deferred_idx
  ON public.pod_order_inbox (created_at) WHERE status = 'deferred';

ALTER TABLE public.pod_order_inbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role only" ON public.pod_order_inbox;
CREATE POLICY "service_role only" ON public.pod_order_inbox TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.pod_order_inbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pod_order_inbox TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
