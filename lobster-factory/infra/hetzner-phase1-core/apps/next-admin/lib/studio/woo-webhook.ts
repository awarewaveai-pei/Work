import { createHmac, timingSafeEqual } from "node:crypto";

// Pure helpers for the WooCommerce order webhook (app/api/webhooks/woo-order/route.ts). Kept OUT of the
// route file because Next.js App Router route modules may only export HTTP-method handlers + the route
// config (runtime/dynamic/…); exporting arbitrary functions there fails `next build` with
// "does not match the required types of a Next.js Route". This module is also where the unit tests import.

export const MAX_ITEMS = 100;
export const MAX_QTY = 1000;
export const MAX_FIELD = 200;

export interface WooAddress {
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
export interface WooOrder {
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

export type ParseResult =
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
