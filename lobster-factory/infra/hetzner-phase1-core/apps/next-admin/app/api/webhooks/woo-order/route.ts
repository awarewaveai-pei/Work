import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createDraftOrderOnNative, isNativeStoreConfigured } from "../../../../lib/studio/print-provider";

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

const MAX_ITEMS = 100;
const MAX_QTY = 1000;
const MAX_FIELD = 200;

// Woo order statuses that mean "paid, fulfill it". pending/on-hold/cancelled/refunded/failed do NOT
// fulfill. (Woo's own paid-statuses are processing + completed.)
const PAID_STATUSES = new Set(["processing", "completed"]);

interface WooAddress {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
}
interface WooOrder {
  id?: number;
  status?: string;
  billing?: WooAddress;
  shipping?: WooAddress;
  line_items?: { sku?: string; quantity?: number }[];
}

/**
 * Verify the WooCommerce webhook signature. Woo signs the RAW request body with HMAC-SHA256 keyed by
 * the webhook secret and sends it base64-encoded in `x-wc-webhook-signature`. Uses node:crypto
 * (createHmac) — the codebase HMAC convention (see the slack-commands route) — NOT the Web-Crypto
 * global, which is absent in the vitest test environment (deploy npm-test gate caught that). Kept
 * async so callers need not change.
 */
export async function verifyWooSignature(rawBody: string, signatureHeader: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || !signatureHeader) return false;
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader);
  // timingSafeEqual throws on length mismatch — length-gate first (base64-SHA256 is a fixed 44 chars,
  // so the length check leaks nothing about the secret).
  return a.length === b.length && timingSafeEqual(a, b);
}

type ParseResult =
  | { ok: true; externalId: string; recipient: Record<string, string>; items: { sku: string; quantity: number }[] }
  | { ok: false; reason: string; status: number };

/**
 * Map a WooCommerce order payload to a Printful draft-order input. Pure (no I/O) so it is unit-testable.
 * - recipient: prefer `shipping` (the deliver-to address); fall back to `billing`. email/phone always
 *   come from billing (Woo's shipping block carries neither).
 * - items: only `line_items` with a non-empty SKU (= a POD product bound on the native store). Lines
 *   without a SKU are non-POD and skipped. Shipping/fee/coupon lines live in separate arrays and never
 *   appear here. An order with zero POD lines is "nothing to fulfill", not an error.
 */
export function parseWooOrder(order: WooOrder): ParseResult {
  if (!Number.isInteger(order?.id) || (order.id as number) <= 0) {
    return { ok: false, reason: "missing_order_id", status: 400 };
  }
  const externalId = String(order.id);

  const addr = order.shipping && (order.shipping.address_1 ?? "").trim().length > 0 ? order.shipping : order.billing;
  const bill = order.billing ?? {};
  if (!addr) return { ok: false, reason: "recipient_incomplete", status: 400 };

  const name = `${(addr.first_name ?? "").trim()} ${(addr.last_name ?? "").trim()}`.trim();
  const country = (addr.country ?? "").trim().toUpperCase();
  const recipient: Record<string, string> = {};
  const put = (k: string, v: string | undefined) => {
    const t = (v ?? "").trim();
    if (t.length > 0) recipient[k] = t.slice(0, MAX_FIELD);
  };
  put("name", name);
  put("address1", addr.address_1);
  put("address2", addr.address_2);
  put("city", addr.city);
  put("country_code", country);
  put("zip", addr.postcode);
  put("state_code", addr.state);
  put("email", bill.email);
  put("phone", bill.phone);

  for (const k of ["name", "address1", "city", "country_code", "zip"]) {
    if (!recipient[k]) return { ok: false, reason: "recipient_incomplete", status: 400 };
  }
  // Printful rejects US/CA/AU orders with no state — catch it here so a rejected POST isn't opaque.
  if (["US", "CA", "AU"].includes(country) && !recipient.state_code) {
    return { ok: false, reason: "state_code_required_for_country", status: 400 };
  }

  const rawItems = Array.isArray(order.line_items) ? order.line_items : [];
  if (rawItems.length > MAX_ITEMS) return { ok: false, reason: "too_many_items", status: 400 };
  const items: { sku: string; quantity: number }[] = [];
  for (const it of rawItems) {
    const sku = typeof it?.sku === "string" ? it.sku.trim() : "";
    if (sku.length === 0 || sku.length > MAX_FIELD) continue; // non-POD line → skip
    if (!Number.isInteger(it?.quantity) || (it.quantity as number) <= 0 || (it.quantity as number) > MAX_QTY) continue;
    items.push({ sku, quantity: it.quantity as number });
  }
  if (items.length === 0) return { ok: false, reason: "no_pod_line_items", status: 200 };

  return { ok: true, externalId, recipient, items };
}

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

  // DRAFT-ONLY. createDraftOrderOnNative POSTs with NO confirm — not charged, not printed.
  const result = await createDraftOrderOnNative({ externalId: okParsed.externalId, recipient: okParsed.recipient as never, items: okParsed.items });
  if (!result.ok) {
    const e = (result as { ok: false; error: string }).error;
    // A retry never duplicates (idempotency pre-check); 502 lets Woo's retry recover transient blips.
    return NextResponse.json({ ok: false, error: e }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    draft: true,
    printfulOrderId: result.value.printfulOrderId,
    status: result.value.status,
    alreadyExisted: result.value.alreadyExisted,
  });
}
