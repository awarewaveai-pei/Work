import { after, NextResponse } from "next/server";
import type { DraftOrderRecipient } from "../../../../lib/studio/print-provider";
import { parseWooOrder, verifyWooSignature, type WooOrder } from "../../../../lib/studio/woo-webhook";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { cancelPodOrderIfOpen, drainPodOrderInbox, processPodOrder, recordPodOrder, recordUnfulfillablePodOrder } from "../../../../lib/studio/pod-order-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── WooCommerce → Printful auto-fulfillment (DRAFT-ONLY, testing-safe) ─────────────────────────────
// A paid Woo order auto-creates a Printful DRAFT order (NOT charged, NOT printed). The money step
// (confirm) is DELIBERATELY ABSENT here — see createDraftOrderOnNative's ⚠ block. Real auto-print
// is a separate, explicit future action, NOT a flag flip on this route.
//
// Two independent safeties, both must pass before anything is created:
//   1. POD_AUTO_FULFILL_ENABLED === "true"  — kill switch. Default OFF → the route is dormant during
//      the testing period (returns 200 ignored so Woo does not retry-storm).
//   2. WC_WEBHOOK_SECRET HMAC — proves the payload is a genuine WooCommerce webhook, not a forgery.
//
// After HMAC + paid + parse, the order lands in pod_order_inbox (lib/studio/pod-order-inbox.ts) and the
// answer is 2xx right away; the Printful draft is made after the response. WooCommerce never re-sends a
// failed delivery, counts one slower than 60 s as failed (class-wc-webhook.php:331,544) and disables the
// webhook after >5 consecutive failures (:562-570) -- so the inbox, not Woo, is the retry path
// (agency-os/reports/decisions/2026-09-26-system-mode-inbound-events.md). Only a failed inbox write
// answers 5xx: nothing durable exists then, and the failure shows in Woo's webhook log.
//
// Pure parse/verify helpers live in lib/studio/woo-webhook.ts (a Next.js route module may only export
// HTTP handlers + route config — exporting helpers here fails `next build`).

// Woo order statuses that mean "paid, fulfill it". pending/on-hold/cancelled/refunded/failed do NOT
// fulfill. (Woo's own paid-statuses are processing + completed.)
const PAID_STATUSES = new Set(["processing", "completed"]);
const CANCELLED_STATUSES = new Set(["cancelled", "refunded", "failed", "trash"]);

export async function POST(req: Request) {
  const rawBody = await req.text();

  // Safety 1 — kill switch. Default OFF: dormant during testing, nothing is ever created.
  if (process.env.POD_AUTO_FULFILL_ENABLED !== "true") {
    return NextResponse.json({ ok: true, ignored: true, reason: "auto_fulfill_disabled" });
  }

  // Safety 2 — HMAC. A forged/unsigned payload never reaches the fulfillment path.
  const valid = await verifyWooSignature(rawBody, req.headers.get("x-wc-webhook-signature"), process.env.WC_WEBHOOK_SECRET);
  if (!valid) return new NextResponse("unauthorized", { status: 401 });

  let order: WooOrder;
  try {
    order = JSON.parse(rawBody) as WooOrder;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  // Only fulfill paid orders. A status change to pending/cancelled/refunded must NOT create a draft,
  // and a cancellation closes an order that is still waiting in the inbox.
  const status = (order.status ?? "").trim().toLowerCase();
  if (!PAID_STATUSES.has(status)) {
    if (CANCELLED_STATUSES.has(status) && Number.isInteger(order.id)) await cancelPodOrderIfOpen(db, String(order.id), status);
    return NextResponse.json({ ok: true, ignored: true, reason: "status_not_paid", status });
  }

  const parsed = parseWooOrder(order);
  if (!parsed.ok) {
    // tsconfig here does not narrow `!parsed.ok` — same cast convention as the print-provider routes.
    const err = parsed as { ok: false; reason: string; status: number };
    // 200 = "nothing to fulfill" (no POD lines): a benign no-op → ok:true+reason (never an `error`
    // field, to keep ok/error mutually exclusive for log parsers).
    if (err.status === 200) {
      return NextResponse.json({ ok: true, ignored: true, reason: err.reason });
    }
    if (err.reason === "missing_order_id") return NextResponse.json({ ok: false, error: err.reason }, { status: 400 });
    // A PAID order that cannot become a draft as delivered: kept for the operator, never dropped.
    const kept = await recordUnfulfillablePodOrder(db, String(order.id), err.reason);
    if (!kept.ok) return NextResponse.json({ ok: false, error: "inbox_write_failed" }, { status: 502 });
    return NextResponse.json({ ok: false, error: err.reason, needsManual: true });
  }
  const okParsed = parsed as { ok: true; externalId: string; recipient: Record<string, string>; items: { sku: string; quantity: number }[] };

  // No per-order tenant selector (one WC_WEBHOOK_SECRET, one native store): global mode gate (org null).
  // parseWooOrder's validation guarantees the recipient's required fields; the type is Record<string,string>.
  const payload = { recipient: okParsed.recipient as unknown as DraftOrderRecipient, items: okParsed.items };
  const recorded = await recordPodOrder(db, okParsed.externalId, null, payload);
  if (!recorded.ok) {
    return NextResponse.json({ ok: false, error: "inbox_write_failed" }, { status: 502 });
  }

  const row = recorded.row;
  // After the response: this order's draft (row null = recorded but not read back; the sweep takes it
  // once stale), then the backlog of deferred / due rows.
  after(async () => {
    try {
      if (row) {
        const outcome = await processPodOrder(db, row);
        if (outcome.kind === "failed" || outcome.kind === "gave_up") {
          console.error(`[woo-order] ${okParsed.externalId}: ${outcome.kind}`, outcome);
        }
      }
    } catch (e) {
      // The row stays claimed (pending) and is reclaimed once stale; nothing is lost.
      console.error(`[woo-order] ${okParsed.externalId}: processing threw`, e);
    }
    await drainPodOrderInbox(db);
  });
  return NextResponse.json({ ok: true, recorded: true, wooOrderId: okParsed.externalId });
}
