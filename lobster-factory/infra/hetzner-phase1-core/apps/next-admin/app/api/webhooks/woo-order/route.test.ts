import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the fulfillment seam so handler tests can assert it is (or is NOT) called — the kill-switch
// regression guard for the money red-line.
const createDraftOrderOnNative = vi.fn();
vi.mock("../../../../lib/studio/print-provider", () => ({
  createDraftOrderOnNative: (...a: unknown[]) => createDraftOrderOnNative(...a),
  isNativeStoreConfigured: () => true,
}));

// T26: the durable inbox + system-mode gate. Mocked as a unit -- lib/studio/__tests__/pod-order-
// inbox.test.ts covers the data layer itself against a real (fake) DB; this file only proves the
// ROUTE wires upsert-before-gate / deferred-on-block / mark-done-or-failed correctly.
const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({ allowed: true, mode: "normal" })),
);
vi.mock("../../../../lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

const fakeDb = vi.hoisted(() => ({}));
const getSupabaseWriteClient = vi.hoisted(() => vi.fn((): unknown => fakeDb));
vi.mock("../../../../lib/supabase-server", () => ({ getSupabaseWriteClient }));

const upsertPodOrderInbox = vi.hoisted(() => vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })));
const markPodOrderInbox = vi.hoisted(() => vi.fn(async () => undefined));
const drainDeferredPodOrders = vi.hoisted(() => vi.fn(async () => ({ processed: 0 })));
vi.mock("../../../../lib/studio/pod-order-inbox", () => ({ upsertPodOrderInbox, markPodOrderInbox, drainDeferredPodOrders }));

import { parseWooOrder, verifyWooSignature } from "../../../../lib/studio/woo-webhook";
import { POST } from "./route";

const baseOrder = {
  id: 7164,
  status: "processing",
  billing: { first_name: "Pei", last_name: "Chen", email: "p@x.com", phone: "0900", address_1: "Bill St 1", city: "Taipei", postcode: "100", country: "tw" },
  shipping: { first_name: "Pei", last_name: "Chen", address_1: "Ship Rd 2", city: "Kaohsiung", postcode: "800", country: "TW" },
  line_items: [
    { sku: "TEE-BLK-M", quantity: 2 },
    { sku: "TEE-WHT-L", quantity: 1 },
  ],
};

describe("parseWooOrder", () => {
  it("maps a paid order, prefers shipping address, pulls email/phone from billing", () => {
    const r = parseWooOrder(baseOrder);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.externalId).toBe("7164");
      expect(r.recipient.address1).toBe("Ship Rd 2"); // shipping wins
      expect(r.recipient.city).toBe("Kaohsiung");
      expect(r.recipient.country_code).toBe("TW"); // upper-cased
      expect(r.recipient.email).toBe("p@x.com"); // from billing
      expect(r.items).toEqual([
        { sku: "TEE-BLK-M", quantity: 2 },
        { sku: "TEE-WHT-L", quantity: 1 },
      ]);
    }
  });

  it("falls back to billing address when shipping has no address_1", () => {
    const r = parseWooOrder({ ...baseOrder, shipping: { first_name: "Pei", last_name: "Chen" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recipient.address1).toBe("Bill St 1");
  });

  // tsconfig here does not narrow `!r.ok` — cast the failure variant (same convention as route.ts).
  const asErr = (r: ReturnType<typeof parseWooOrder>) => r as { ok: false; reason: string; status: number };

  it("skips non-POD (no-SKU) lines; an order with zero POD lines is a 200 no-op", () => {
    const r = parseWooOrder({ ...baseOrder, line_items: [{ quantity: 1 }, { sku: "  ", quantity: 1 }] });
    expect(r.ok).toBe(false);
    expect(asErr(r).reason).toBe("no_pod_line_items");
    expect(asErr(r).status).toBe(200); // benign — Woo should not retry
  });

  it("rejects a missing order id (400)", () => {
    const r = parseWooOrder({ ...baseOrder, id: undefined });
    expect(r.ok).toBe(false);
    expect(asErr(r).status).toBe(400);
  });

  it("requires state_code for US/CA/AU", () => {
    const us = { ...baseOrder, shipping: { ...baseOrder.shipping, country: "US", state: undefined } };
    const r = parseWooOrder(us);
    expect(r.ok).toBe(false);
    expect(asErr(r).reason).toBe("state_code_required_for_country");
  });

  it("drops a line whose quantity is non-positive / non-integer", () => {
    const r = parseWooOrder({ ...baseOrder, line_items: [{ sku: "A", quantity: 0 }, { sku: "B", quantity: 3 }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items).toEqual([{ sku: "B", quantity: 3 }]);
  });
});

describe("verifyWooSignature", () => {
  const secret = "shh-secret";
  const body = JSON.stringify(baseOrder);
  const goodSig = createHmac("sha256", secret).update(body).digest("base64");

  it("accepts a correct HMAC-SHA256 base64 signature", async () => {
    expect(await verifyWooSignature(body, goodSig, secret)).toBe(true);
  });
  it("rejects a tampered body", async () => {
    expect(await verifyWooSignature(body + "x", goodSig, secret)).toBe(false);
  });
  it("rejects a wrong signature", async () => {
    expect(await verifyWooSignature(body, "deadbeef", secret)).toBe(false);
  });
  it("rejects when secret or header is absent", async () => {
    expect(await verifyWooSignature(body, goodSig, undefined)).toBe(false);
    expect(await verifyWooSignature(body, null, secret)).toBe(false);
  });
});

describe("POST handler — safety gates", () => {
  const secret = "shh-secret";
  const sign = (b: string) => createHmac("sha256", secret).update(b).digest("base64");
  const post = (body: string, headers: Record<string, string> = {}) =>
    POST(new Request("http://x/api/webhooks/woo-order", { method: "POST", headers, body }));

  beforeEach(() => {
    createDraftOrderOnNative.mockReset();
    createDraftOrderOnNative.mockResolvedValue({ ok: true, value: { printfulOrderId: 1, status: "draft", alreadyExisted: false } });
    process.env.WC_WEBHOOK_SECRET = secret;
    checkProductionChangeAllowed.mockClear();
    checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });
    getSupabaseWriteClient.mockClear();
    getSupabaseWriteClient.mockReturnValue(fakeDb);
    upsertPodOrderInbox.mockClear();
    upsertPodOrderInbox.mockResolvedValue({ ok: true });
    markPodOrderInbox.mockClear();
    markPodOrderInbox.mockResolvedValue(undefined);
    drainDeferredPodOrders.mockClear();
    drainDeferredPodOrders.mockResolvedValue({ processed: 0 });
  });
  afterEach(() => {
    delete process.env.POD_AUTO_FULFILL_ENABLED;
    delete process.env.WC_WEBHOOK_SECRET;
  });

  it("KILL SWITCH OFF (default): ignores and NEVER calls the fulfillment seam (money red-line guard)", async () => {
    delete process.env.POD_AUTO_FULFILL_ENABLED; // default off
    const body = JSON.stringify(baseOrder);
    const res = await post(body, { "x-wc-webhook-signature": sign(body) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, ignored: true, reason: "auto_fulfill_disabled" });
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("non-'true' flag values stay dormant (fail-closed)", async () => {
    process.env.POD_AUTO_FULFILL_ENABLED = "TRUE"; // not the exact literal
    const body = JSON.stringify(baseOrder);
    await post(body, { "x-wc-webhook-signature": sign(body) });
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("ON + bad signature: 401, never fulfills", async () => {
    process.env.POD_AUTO_FULFILL_ENABLED = "true";
    const body = JSON.stringify(baseOrder);
    const res = await post(body, { "x-wc-webhook-signature": "wrong" });
    expect(res.status).toBe(401);
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("ON + good signature + refunded status: ignored, never fulfills", async () => {
    process.env.POD_AUTO_FULFILL_ENABLED = "true";
    const body = JSON.stringify({ ...baseOrder, status: "refunded" });
    const res = await post(body, { "x-wc-webhook-signature": sign(body) });
    const json = await res.json();
    expect(json).toMatchObject({ ignored: true, reason: "status_not_paid" });
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("ON + good signature + paid order: creates exactly one DRAFT", async () => {
    process.env.POD_AUTO_FULFILL_ENABLED = "true";
    const body = JSON.stringify(baseOrder);
    const res = await post(body, { "x-wc-webhook-signature": sign(body) });
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, draft: true, printfulOrderId: 1 });
    expect(createDraftOrderOnNative).toHaveBeenCalledTimes(1);
    expect(createDraftOrderOnNative).toHaveBeenCalledWith(expect.objectContaining({ externalId: "7164" }));
  });
});

// ── T26 Part B: a paid order is never lost to a system mode ─────────────────────────────────────────
describe("POST handler — durable inbox + system-mode gate (T26)", () => {
  const secret = "shh-secret";
  const sign = (b: string) => createHmac("sha256", secret).update(b).digest("base64");
  const post = (body: string) => POST(new Request("http://x/api/webhooks/woo-order", { method: "POST", headers: { "x-wc-webhook-signature": sign(body) }, body }));

  beforeEach(() => {
    process.env.POD_AUTO_FULFILL_ENABLED = "true";
    process.env.WC_WEBHOOK_SECRET = secret;
    createDraftOrderOnNative.mockReset();
    createDraftOrderOnNative.mockResolvedValue({ ok: true, value: { printfulOrderId: 1, status: "draft", alreadyExisted: false } });
    checkProductionChangeAllowed.mockClear();
    checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });
    getSupabaseWriteClient.mockClear();
    getSupabaseWriteClient.mockReturnValue(fakeDb);
    upsertPodOrderInbox.mockClear();
    upsertPodOrderInbox.mockResolvedValue({ ok: true });
    markPodOrderInbox.mockClear();
    markPodOrderInbox.mockResolvedValue(undefined);
    drainDeferredPodOrders.mockClear();
    drainDeferredPodOrders.mockResolvedValue({ processed: 0 });
  });
  afterEach(() => {
    delete process.env.POD_AUTO_FULFILL_ENABLED;
    delete process.env.WC_WEBHOOK_SECRET;
  });

  it("upserts the durable row BEFORE the gate is checked -- a customer-started event is never dropped", async () => {
    const body = JSON.stringify(baseOrder);
    await post(body);
    expect(upsertPodOrderInbox).toHaveBeenCalledWith(fakeDb, "7164", null, {
      recipient: expect.objectContaining({ address1: "Ship Rd 2" }),
      items: [{ sku: "TEE-BLK-M", quantity: 2 }, { sku: "TEE-WHT-L", quantity: 1 }],
    });
    const upsertOrder = upsertPodOrderInbox.mock.invocationCallOrder[0];
    const gateOrder = checkProductionChangeAllowed.mock.invocationCallOrder[0];
    expect(upsertOrder).toBeLessThan(gateOrder);
  });

  it("blocked: 200 {deferred:true, mode}, row marked deferred, no Printful call -- NEVER 423 (WooCommerce disables the webhook after 5 non-2xx)", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const body = JSON.stringify(baseOrder);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deferred: true, mode: "emergency_stop" });
    expect(markPodOrderInbox).toHaveBeenCalledWith(fakeDb, "7164", { status: "deferred", reason: "emergency_stop" });
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("allowed: marks the row 'done' after a successful draft", async () => {
    createDraftOrderOnNative.mockResolvedValue({ ok: true, value: { printfulOrderId: 1, status: "draft", alreadyExisted: false } });
    await post(JSON.stringify(baseOrder));
    expect(markPodOrderInbox).toHaveBeenCalledWith(fakeDb, "7164", { status: "done" });
  });

  it("allowed but the Printful call fails: marks the row 'failed', still 502 (Woo retries)", async () => {
    createDraftOrderOnNative.mockResolvedValue({ ok: false, error: "printful_502" });
    const res = await post(JSON.stringify(baseOrder));
    expect(res.status).toBe(502);
    expect(markPodOrderInbox).toHaveBeenCalledWith(fakeDb, "7164", { status: "failed", reason: "printful_502" });
  });

  it("duplicate delivery (Woo retry): still exactly one draft, thanks to createDraftOrderOnNative's own idempotency", async () => {
    createDraftOrderOnNative.mockResolvedValueOnce({ ok: true, value: { printfulOrderId: 1, status: "draft", alreadyExisted: false } });
    createDraftOrderOnNative.mockResolvedValueOnce({ ok: true, value: { printfulOrderId: 1, status: "draft", alreadyExisted: true } });
    const body = JSON.stringify(baseOrder);
    const first = await post(body);
    const second = await post(body);
    expect((await first.json()).alreadyExisted).toBe(false);
    expect((await second.json()).alreadyExisted).toBe(true);
    expect(createDraftOrderOnNative).toHaveBeenCalledTimes(2); // route calls it every delivery; print-provider's own precheck is what dedupes
  });

  it("inbox upsert failure: 502, never reaches the gate or Printful (genuine DB error, not a mode decision)", async () => {
    upsertPodOrderInbox.mockResolvedValueOnce({ ok: false, error: "conn refused" });
    const res = await post(JSON.stringify(baseOrder));
    expect(res.status).toBe(502);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("supabase not configured: 503, never reaches the inbox, gate, or Printful", async () => {
    getSupabaseWriteClient.mockReturnValueOnce(null);
    const res = await post(JSON.stringify(baseOrder));
    expect(res.status).toBe(503);
    expect(upsertPodOrderInbox).not.toHaveBeenCalled();
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(createDraftOrderOnNative).not.toHaveBeenCalled();
  });

  it("drains the deferred backlog on every delivery (best-effort, before this order's own row)", async () => {
    await post(JSON.stringify(baseOrder));
    expect(drainDeferredPodOrders).toHaveBeenCalledWith(fakeDb);
  });

  it("a throwing drain does not break this delivery's own processing", async () => {
    drainDeferredPodOrders.mockRejectedValueOnce(new Error("drain boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(JSON.stringify(baseOrder));
    expect(res.status).toBe(200);
    expect(createDraftOrderOnNative).toHaveBeenCalledTimes(1);
  });
});
