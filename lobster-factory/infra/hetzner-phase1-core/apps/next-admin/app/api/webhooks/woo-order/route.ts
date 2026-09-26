import { NextResponse } from "next/server";
import { createDraftOrderOnNative, isNativeStoreConfigured, type DraftOrderRecipient } from "../../../../lib/studio/print-provider";
import { parseWooOrder, verifyWooSignature, type WooOrder } from "../../../../lib/studio/woo-webhook";
import { checkProductionChangeAllowed } from "../../../../lib/system-modes/production-change-gate";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { upsertPodOrderInbox, markPodOrderInbox, drainDeferredPodOrders } from "../../../../lib/studio/pod-order-inbox";

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
// Idempotency (a Woo retry / duplicate delivery must not create a second draft) is handled inside
// createDraftOrderOnNative via GET /orders/@{wooOrderId}.
//
// Pure parse/verify helpers live in lib/studio/woo-webhook.ts (a Next.js route module may only export
// HTTP handlers + route config — exporting helpers here fails `next build`).
//
// T26 (agency-os/reports/decisions/2026-09-26-system-mode-inbound-events.md): a paid order is a
// CUSTOMER-started event, never lost to a system mode -- unlike every operator-initiated Printful
// write (tools/publish, tools/printful/sync), this route must NEVER answer non-2xx because of a
// blocked mode (WooCommerce disables a webhook after >5 consecutive non-2xx deliveries and never
// re-sends -- includes/class-wc-webhook.php:544,562-570). So: upsert a durable row in
// lib/studio/pod-order-inbox.ts BEFORE checking the gate; blocked -> mark 'deferred' and answer 200;
// allowed -> create the draft as before. drainDeferredPodOrders retries deferred rows once the mode
// allows again (called here, and from ops/system-modes/route.ts POST after a change to "normal").

// Woo order statuses that mean "paid, fulfill it". pending/on-hold/cancelled/refunded/failed do NOT
// fulfill. (Woo's own paid-statuses are processing + completed.)
const PAID_STATUSES = new Set(["processing", "completed"]);

export async function POST(req: Request) {
  const rawBody = await req.text();

  // Safety 1 — kill switch. Default OFF: dormant during testing, nothing is ever created.
  if (process.env.POD_AUTO_FULFILL_ENABLED !== "true") {
    return NextResponse.json({ ok: true, ignored: true, reason: "auto_fulfill_disabled" });
  }

  // Safety 2 — HMAC. A forged/unsigned payload never reaches the fulfillment path.
  const valid = await verifyWooSignature(rawBody, req.headers.get("x-wc-webhook-signature"), process.env.WC_WEBHOOK_SECRET);
  if (!valid) return new NextResponse("unauthorized", { status: 401 });

  if (!isNativeStoreConfigured()) {
    return NextResponse.json({ ok: false, error: "printful_native_store_not_configured" }, { status: 503 });
  }

  let order: WooOrder;
  try {
    order = JSON.parse(rawBody) as WooOrder;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Only fulfill paid orders. A status change to pending/cancelled/refunded must NOT create a draft.
  const status = (order.status ?? "").trim().toLowerCase();
  if (!PAID_STATUSES.has(status)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "status_not_paid", status });
  }

  const parsed = parseWooOrder(order);
  if (!parsed.ok) {
    // tsconfig here does not narrow `!parsed.ok` — same cast convention as the print-provider routes.
    const err = parsed as { ok: false; reason: string; status: number };
    // 200 = "nothing to fulfill" (no POD lines): a benign no-op Woo should NOT retry → ok:true+reason
    // (never an `error` field, to keep ok/error mutually exclusive for log parsers). 4xx = real reject.
    if (err.status === 200) {
      return NextResponse.json({ ok: true, ignored: true, reason: err.reason });
    }
    return NextResponse.json({ ok: false, error: err.reason }, { status: err.status });
  }
  const okParsed = parsed as { ok: true; externalId: string; recipient: Record<string, string>; items: { sku: string; quantity: number }[] };

  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  // Best-effort backlog drain before this delivery's own row. drainDeferredPodOrders already swallows
  // its own errors, but this request's outcome must not depend on unrelated deferred rows even if
  // that invariant is ever broken -- same defensive wrap as ops/system-modes/route.ts POST.
  try {
    await drainDeferredPodOrders(db);
  } catch (e) {
    console.error("[woo-order] drain failed:", e);
  }

  // Durable BEFORE the gate check: a paid order is a customer-started event and must survive even if
  // the gate is currently blocking, or the process crashes right after this line. No clientId/site
  // selector on this webhook (one WC_WEBHOOK_SECRET, one native store) -> global mode gate (org null).
  // Same cast convention as the createDraftOrderOnNative call below: parseWooOrder's Record<string,
  // string> return type is not structurally DraftOrderRecipient, though its own validation guarantees
  // the required fields are present.
  const payload = { recipient: okParsed.recipient as unknown as DraftOrderRecipient, items: okParsed.items };
  const upserted = await upsertPodOrderInbox(db, okParsed.externalId, null, payload);
  if (!upserted.ok) {
    // A genuine DB write failure, not a mode decision -- 502 is retryable (Woo will re-deliver).
    return NextResponse.json({ ok: false, error: "inbox_write_failed" }, { status: 502 });
  }

  const gate = await checkProductionChangeAllowed(db, null);
  if (!gate.allowed) {
    await markPodOrderInbox(db, okParsed.externalId, { status: "deferred", reason: gate.mode });
    // Never a 423 here — WooCommerce disables the webhook after >5 non-2xx (route header above).
    return NextResponse.json({ ok: true, deferred: true, mode: gate.mode });
  }

  // DRAFT-ONLY. createDraftOrderOnNative POSTs with NO confirm — not charged, not printed.
  const result = await createDraftOrderOnNative({ externalId: okParsed.externalId, recipient: okParsed.recipient as never, items: okParsed.items });
  if (!result.ok) {
    const e = (result as { ok: false; error: string }).error;
    await markPodOrderInbox(db, okParsed.externalId, { status: "failed", reason: e });
    // A retry never duplicates (idempotency pre-check); 502 lets Woo's retry recover transient blips.
    return NextResponse.json({ ok: false, error: e }, { status: 502 });
  }
  await markPodOrderInbox(db, okParsed.externalId, { status: "done" });
  return NextResponse.json({
    ok: true,
    draft: true,
    printfulOrderId: result.value.printfulOrderId,
    status: result.value.status,
    alreadyExisted: result.value.alreadyExisted,
  });
}
