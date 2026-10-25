/**
 * Durable landing table for paid WooCommerce orders (schema: packages/db/migrations/0093_pod_order_inbox.sql;
 * decision: agency-os/reports/decisions/2026-09-26-system-mode-inbound-events.md). WooCommerce never
 * re-sends a failed delivery, so once a paid order is recorded here, THIS table is its only retry path.
 *
 * Row lifecycle: pending (recorded, or claimed by a worker) -> done | failed (Printful refused; retried
 * on the backoff below until MAX_ATTEMPTS) | deferred (system mode blocked; retried once the mode
 * allows) | cancelled (Woo said cancelled/refunded before a draft existed).
 * Every state change is optimistic on (status, attempts): a claim bumps attempts, so two workers (a
 * Woo re-delivery, the sweep, the system-modes POST) can never both call Printful for one order.
 * A claimed row whose worker died is reclaimable after STALE_PENDING_MS.
 * Drain triggers: after each webhook response, after a switch back to normal, and the 10-minute sweep
 * (POST /api/internal/pod-orders/sweep, host cron scripts/poke.sh).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { createDraftOrderOnNative, type DraftOrderRecipient, type DraftOrderItem } from "./print-provider";

const TABLE = "pod_order_inbox";
const COLS = "woo_order_id,organization_id,payload,status,reason,attempts,created_at,updated_at";
export const MAX_ATTEMPTS = 5;
export const STALE_PENDING_MS = 15 * 60_000;
/** failed -> next retry after RETRY_BASE_MS * 2^(attempts-1): 5, 10, 20, 40 min. */
export const RETRY_BASE_MS = 5 * 60_000;
/** A due retry nobody ran for this long means no drain trigger is firing (sweep down). */
export const OVERDUE_MARGIN_MS = 30 * 60_000;
const DRAIN_BATCH = 25;
const STATS_LIMIT = 500;

export interface PodOrderPayload {
  recipient: DraftOrderRecipient;
  items: DraftOrderItem[];
}

export type PodOrderStatus = "pending" | "deferred" | "done" | "failed" | "cancelled";

export interface PodOrderRow {
  woo_order_id: string;
  organization_id: string | null;
  payload: PodOrderPayload;
  status: PodOrderStatus;
  reason: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export type PodOrderOutcome =
  | { kind: "done"; printfulOrderId: number; status: string; alreadyExisted: boolean }
  | { kind: "already_done" }
  | { kind: "in_flight" }
  | { kind: "retry_scheduled"; attempts: number }
  | { kind: "deferred"; mode: string }
  | { kind: "failed"; error: string; attempts: number }
  | { kind: "gave_up"; attempts: number };

const ageMs = (iso: string, now: number) => now - new Date(iso).getTime();
const isStalePending = (row: PodOrderRow, now: number) => row.status === "pending" && ageMs(row.updated_at, now) >= STALE_PENDING_MS;
/** When a failed row's next attempt is due (ms epoch). */
const retryDueAt = (row: Pick<PodOrderRow, "attempts" | "updated_at">) =>
  new Date(row.updated_at).getTime() + RETRY_BASE_MS * 2 ** Math.max(0, row.attempts - 1);

/**
 * Insert-if-absent, then read back. The first paid delivery's payload wins; a re-delivery never
 * resets a row's status or attempts (that would let a finished or in-flight order be claimed again).
 * row:null = inserted but the read-back failed: the order IS recorded (the sweep picks the pending
 * row up once stale), so callers must not answer as if nothing was stored.
 */
export async function recordPodOrder(
  db: SupabaseClient,
  wooOrderId: string,
  organizationId: string | null,
  payload: PodOrderPayload,
): Promise<{ ok: true; row: PodOrderRow | null } | { ok: false; error: string }> {
  const { error } = await db
    .from(TABLE)
    .upsert({ woo_order_id: wooOrderId, organization_id: organizationId, payload, status: "pending" }, { onConflict: "woo_order_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  const { data, error: readError } = await db.from(TABLE).select(COLS).eq("woo_order_id", wooOrderId).maybeSingle();
  if (readError || !data) {
    console.error(`[pod-order-inbox] ${wooOrderId} recorded but not read back:`, readError?.message ?? "no row");
    return { ok: true, row: null };
  }
  return { ok: true, row: data as PodOrderRow };
}

/**
 * A paid order that cannot become a draft as delivered (e.g. incomplete address): recorded with no
 * retries left, so it is never processed automatically but shows as gaveUp until the operator
 * forwards it by hand (tools/publish pforder, which closes the row).
 */
export async function recordUnfulfillablePodOrder(db: SupabaseClient, wooOrderId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await db.from(TABLE).upsert(
    { woo_order_id: wooOrderId, organization_id: null, payload: { unfulfillable: true }, status: "failed", reason: `unfulfillable:${reason}`, attempts: MAX_ATTEMPTS },
    { onConflict: "woo_order_id", ignoreDuplicates: true },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Optimistic state change: applies only if the row is still exactly what `row` says. */
async function transition(db: SupabaseClient, row: PodOrderRow, patch: Partial<PodOrderRow> & { done_at?: string }): Promise<boolean> {
  const { data, error } = await db
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("woo_order_id", row.woo_order_id)
    .eq("status", row.status)
    .eq("attempts", row.attempts)
    .select("woo_order_id");
  if (error) console.error(`[pod-order-inbox] ${row.woo_order_id} -> ${patch.status} failed:`, error.message);
  return !error && Array.isArray(data) && data.length === 1;
}

/**
 * One fulfilment step for one row: gate -> claim -> Printful draft -> done/failed. Used after the
 * webhook response (the delivery's own row) and by the drain (backlog). A failed row is retried only
 * when due, whoever calls: Woo sends order.updated on every save, and each must not burn an attempt.
 * createDraftOrderOnNative's own GET-before-POST idempotency (and Printful's unique external_id)
 * still backs this up if a stale reclaim ever overlaps a slow worker.
 */
export async function processPodOrder(db: SupabaseClient, row: PodOrderRow, now = Date.now()): Promise<PodOrderOutcome> {
  if (row.status === "done" || row.status === "cancelled") return { kind: "already_done" };
  if (row.status === "pending" && row.attempts > 0 && !isStalePending(row, now)) return { kind: "in_flight" };
  if (row.attempts >= MAX_ATTEMPTS) return { kind: "gave_up", attempts: row.attempts };
  if (row.status === "failed" && now < retryDueAt(row)) return { kind: "retry_scheduled", attempts: row.attempts };

  const gate = await checkProductionChangeAllowed(db, row.organization_id);
  if (!gate.allowed) {
    // Deferral is not an attempt: attempts stays, so a long block never exhausts the retries.
    if (row.status !== "deferred" || row.reason !== gate.mode) await transition(db, row, { status: "deferred", reason: gate.mode });
    return { kind: "deferred", mode: gate.mode };
  }

  const attempts = row.attempts + 1;
  if (!(await transition(db, row, { status: "pending", attempts, reason: null }))) return { kind: "in_flight" };
  const claimed: PodOrderRow = { ...row, status: "pending", attempts, reason: null };

  // DRAFT-ONLY: no confirm -> not charged, not printed (print-provider.ts).
  const result = await createDraftOrderOnNative({ externalId: row.woo_order_id, recipient: row.payload.recipient, items: row.payload.items });
  if (result.ok) {
    await transition(db, claimed, { status: "done", reason: null, done_at: new Date().toISOString() });
    return { kind: "done", ...result.value };
  }
  const error = (result as { ok: false; error: string }).error;
  await transition(db, claimed, { status: "failed", reason: error });
  return { kind: "failed", error, attempts };
}

/** A row the drain should pick up now (pure; exported for tests). */
export function isDrainable(row: PodOrderRow, now: number): boolean {
  if (row.attempts >= MAX_ATTEMPTS) return false;
  if (row.status === "deferred") return true;
  if (row.status === "pending") return isStalePending(row, now);
  if (row.status === "failed") return now >= retryDueAt(row);
  return false;
}

/**
 * Backlog: deferred, due-for-retry failed, and abandoned pending rows, oldest first. Stops at the first
 * deferral (the mode blocks the rest too). Never throws -- callers run it best-effort.
 */
export async function drainPodOrderInbox(db: SupabaseClient, now = Date.now()): Promise<{ processed: number; blocked: boolean; error?: string }> {
  try {
    const { data, error } = await db
      .from(TABLE)
      .select(COLS)
      .in("status", ["deferred", "failed", "pending"])
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(DRAIN_BATCH);
    if (error) {
      console.error("[pod-order-inbox] drain read failed:", error.message);
      return { processed: 0, blocked: false, error: error.message };
    }
    let processed = 0;
    for (const row of (data ?? []) as PodOrderRow[]) {
      if (!isDrainable(row, now)) continue;
      const outcome = await processPodOrder(db, row, now);
      if (outcome.kind === "deferred") return { processed, blocked: true };
      if (outcome.kind === "done" || outcome.kind === "failed") processed++;
    }
    return { processed, blocked: false };
  } catch (e) {
    console.error("[pod-order-inbox] drain failed:", e);
    return { processed: 0, blocked: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Woo reported the order cancelled/refunded: an open row that has not started a draft is closed so no
 * later drain drafts it. An in-flight claim is left alone (its draft, if created, is DRAFT-only).
 */
export async function cancelPodOrderIfOpen(db: SupabaseClient, wooOrderId: string, wooStatus: string): Promise<void> {
  const patch = { status: "cancelled", reason: `woo_${wooStatus}`, updated_at: new Date().toISOString() };
  const waiting = await db.from(TABLE).update(patch).eq("woo_order_id", wooOrderId).in("status", ["deferred", "failed"]);
  const unclaimed = await db.from(TABLE).update(patch).eq("woo_order_id", wooOrderId).eq("status", "pending").eq("attempts", 0);
  for (const { error } of [waiting, unclaimed]) {
    if (error) console.error(`[pod-order-inbox] cancel ${wooOrderId} failed:`, error.message);
  }
}

/** The manual path (tools/publish pforder) created the draft: close the inbox row if there is one. */
export async function markPodOrderDoneIfPresent(db: SupabaseClient, wooOrderId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db
    .from(TABLE)
    .update({ status: "done", reason: "manual_pforder", done_at: now, updated_at: now })
    .eq("woo_order_id", wooOrderId)
    .neq("status", "done");
  if (error) console.error(`[pod-order-inbox] manual done for ${wooOrderId} failed:`, error.message);
}

export interface PodOrderInboxStats {
  ok: boolean;
  error?: string;
  deferred: number;
  oldestDeferredAgeSeconds: number | null;
  retrying: number;
  overdueRetries: number;
  gaveUp: number;
  stuckPending: number;
  capped: boolean;
}

/** Open rows, bucketed -- for the system-modes page and the AO smoke check. An unreadable table is
 *  ok:false, never a row of zeros. */
export async function getPodOrderInboxStats(db: SupabaseClient, now = Date.now()): Promise<PodOrderInboxStats> {
  const empty = { deferred: 0, oldestDeferredAgeSeconds: null, retrying: 0, overdueRetries: 0, gaveUp: 0, stuckPending: 0, capped: false };
  const { data, error } = await db
    .from(TABLE)
    .select("status,attempts,created_at,updated_at")
    .in("status", ["pending", "deferred", "failed"])
    .order("created_at", { ascending: true })
    .limit(STATS_LIMIT);
  if (error || !data) return { ok: false, error: error?.message ?? "no_data", ...empty };
  const rows = data as Pick<PodOrderRow, "status" | "attempts" | "created_at" | "updated_at">[];
  const deferredRows = rows.filter((r) => r.status === "deferred");
  const retryingRows = rows.filter((r) => r.status === "failed" && r.attempts < MAX_ATTEMPTS);
  return {
    ok: true,
    deferred: deferredRows.length,
    oldestDeferredAgeSeconds: deferredRows.length ? Math.max(0, Math.floor(ageMs(deferredRows[0].created_at, now) / 1000)) : null,
    retrying: retryingRows.length,
    overdueRetries: retryingRows.filter((r) => now >= retryDueAt(r) + OVERDUE_MARGIN_MS).length,
    gaveUp: rows.filter((r) => r.attempts >= MAX_ATTEMPTS && r.status !== "pending").length,
    // Stale pending is reclaimed by the next drain; only one no drain reached is stuck.
    stuckPending: rows.filter((r) => r.status === "pending" && ageMs(r.updated_at, now) >= STALE_PENDING_MS + OVERDUE_MARGIN_MS).length,
    capped: rows.length >= STATS_LIMIT,
  };
}
