/**
 * Durable landing table for paid WooCommerce orders (T26; decision doc agency-os/reports/decisions/
 * 2026-09-26-system-mode-inbound-events.md). Invariant: system modes stop changes WE start; a paid
 * Woo order is never lost to a mode. app/api/webhooks/woo-order/route.ts upserts a row here BEFORE
 * checking the system-mode gate, so a blocked mode marks the row 'deferred' (and answers 200) instead
 * of losing the order. drainDeferredPodOrders retries deferred rows, oldest first, once the mode
 * allows again -- called from the webhook route itself and from the system-modes POST route after a
 * successful change to "normal". Schema: packages/db/migrations/0093_pod_order_inbox.sql.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { createDraftOrderOnNative, type DraftOrderRecipient, type DraftOrderItem } from "./print-provider";

const TABLE = "pod_order_inbox";
const DRAIN_BATCH = 25;
const STATS_LIMIT = 500;

export interface PodOrderPayload {
  recipient: DraftOrderRecipient;
  items: DraftOrderItem[];
}

export type PodOrderStatus = "pending" | "deferred" | "done" | "failed";

/** Idempotent on wooOrderId (upsert): a Woo retry updates the same row, never creates a second one. */
export async function upsertPodOrderInbox(
  db: SupabaseClient,
  wooOrderId: string,
  organizationId: string | null,
  payload: PodOrderPayload,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.from(TABLE).upsert(
    {
      woo_order_id: wooOrderId,
      organization_id: organizationId,
      payload,
      status: "pending" as const,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "woo_order_id" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Never throws -- a bookkeeping write failure must not turn a real fulfillment outcome into a 5xx. */
export async function markPodOrderInbox(
  db: SupabaseClient,
  wooOrderId: string,
  fields: { status: PodOrderStatus; reason?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: fields.status,
    reason: fields.reason ?? null,
    updated_at: new Date().toISOString(),
  };
  if (fields.status === "done") patch.done_at = new Date().toISOString();
  const { error } = await db.from(TABLE).update(patch).eq("woo_order_id", wooOrderId);
  if (error) console.error(`[pod-order-inbox] mark ${fields.status} failed for ${wooOrderId}:`, error.message);
}

interface DeferredRow {
  woo_order_id: string;
  payload: PodOrderPayload;
}

/**
 * Deferred rows oldest-first while the gate allows; stops the moment it blocks mid-batch (the rest
 * stay deferred for the next call -- webhook or system-modes POST). Each row goes through the SAME
 * createDraftOrderOnNative idempotency check as the live webhook path, so a row a race already
 * fulfilled is a no-op (alreadyExisted). Never throws -- callers treat this as best-effort.
 */
export async function drainDeferredPodOrders(db: SupabaseClient): Promise<{ processed: number }> {
  const { data, error } = await db
    .from(TABLE)
    .select("woo_order_id,payload")
    .eq("status", "deferred")
    .order("created_at", { ascending: true })
    .limit(DRAIN_BATCH);
  if (error || !data) {
    if (error) console.error("[pod-order-inbox] drain read failed:", error.message);
    return { processed: 0 };
  }

  let processed = 0;
  for (const row of data as DeferredRow[]) {
    const gate = await checkProductionChangeAllowed(db, null);
    if (!gate.allowed) break; // mid-batch block: the rest stay deferred for the next call
    const result = await createDraftOrderOnNative({
      externalId: row.woo_order_id,
      recipient: row.payload.recipient,
      items: row.payload.items,
    });
    if (result.ok) {
      await markPodOrderInbox(db, row.woo_order_id, { status: "done" });
    } else {
      await markPodOrderInbox(db, row.woo_order_id, { status: "failed", reason: (result as { ok: false; error: string }).error });
    }
    processed++;
  }
  return { processed };
}

/** For the system-modes GET so an operator sees backlog where modes are changed. Bounded read (not a
 *  live count) -- deferred rows are expected to be rare; `capped` tells the UI "500+" is possible. */
export async function getDeferredPodOrderStats(
  db: SupabaseClient,
): Promise<{ count: number; oldestAgeSeconds: number | null; capped: boolean }> {
  const { data, error } = await db
    .from(TABLE)
    .select("created_at")
    .eq("status", "deferred")
    .order("created_at", { ascending: true })
    .limit(STATS_LIMIT);
  if (error || !data) {
    if (error) console.error("[pod-order-inbox] deferred stats read failed:", error.message);
    return { count: 0, oldestAgeSeconds: null, capped: false };
  }
  const oldest = data[0]?.created_at ? new Date(data[0].created_at as string).getTime() : null;
  return {
    count: data.length,
    oldestAgeSeconds: oldest !== null ? Math.max(0, Math.floor((Date.now() - oldest) / 1000)) : null,
    capped: data.length >= STATS_LIMIT,
  };
}
