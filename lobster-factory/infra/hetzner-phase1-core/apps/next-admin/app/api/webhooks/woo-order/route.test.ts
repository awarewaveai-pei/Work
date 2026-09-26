import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route's seam is lib/studio/pod-order-inbox.ts (record -> process -> drain after the response);
// that module's own behaviour (gate, claim, Printful, retries) is lib/studio/__tests__/pod-order-inbox.test.ts.
type Outcome = { kind: string } & Record<string, unknown>;
const recordPodOrder = vi.hoisted(() => vi.fn());
const processPodOrder = vi.hoisted(() => vi.fn());
const drainPodOrderInbox = vi.hoisted(() => vi.fn(async () => ({ processed: 0, blocked: false })));
const recordUnfulfillablePodOrder = vi.hoisted(() => vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })));
const cancelPodOrderIfOpen = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../../../lib/studio/pod-order-inbox", () => ({ recordPodOrder, processPodOrder, drainPodOrderInbox, recordUnfulfillablePodOrder, cancelPodOrderIfOpen }));

// next/server's after() needs a request scope; collect the callbacks instead and run them on demand.
const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown | Promise<unknown>>);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void afterCallbacks.push(fn) }));

const fakeDb = vi.hoisted(() => ({}));
const getSupabaseWriteClient = vi.hoisted(() => vi.fn((): unknown => fakeDb));
vi.mock("../../../../lib/supabase-server", () => ({ getSupabaseWriteClient }));

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

describe("POST handler", () => {
  const secret = "shh-secret";
  const sign = (b: string) => createHmac("sha256", secret).update(b).digest("base64");
  const post = (body: string, sig: string | null = sign(body)) =>
    POST(new Request("http://x/api/webhooks/woo-order", { method: "POST", headers: sig ? { "x-wc-webhook-signature": sig } : {}, body }));
  const ROW = { woo_order_id: "7164", status: "pending", attempts: 0 };
  const runAfter = async () => {
    for (const fn of afterCallbacks.splice(0)) await fn();
  };

  beforeEach(() => {
    process.env.POD_AUTO_FULFILL_ENABLED = "true";
    process.env.WC_WEBHOOK_SECRET = secret;
    afterCallbacks.length = 0;
    recordPodOrder.mockReset();
    recordPodOrder.mockResolvedValue({ ok: true, row: ROW });
    processPodOrder.mockReset();
    processPodOrder.mockResolvedValue({ kind: "done", printfulOrderId: 1, status: "draft", alreadyExisted: false });
    drainPodOrderInbox.mockClear();
    recordUnfulfillablePodOrder.mockClear();
    cancelPodOrderIfOpen.mockClear();
    getSupabaseWriteClient.mockReturnValue(fakeDb);
  });
  afterEach(() => {
    delete process.env.POD_AUTO_FULFILL_ENABLED;
    delete process.env.WC_WEBHOOK_SECRET;
  });

  it("KILL SWITCH OFF (default): ignored, nothing recorded or fulfilled (money red-line guard)", async () => {
    delete process.env.POD_AUTO_FULFILL_ENABLED;
    const res = await post(JSON.stringify(baseOrder));
    expect(await res.json()).toMatchObject({ ok: true, ignored: true, reason: "auto_fulfill_disabled" });
    expect(recordPodOrder).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("non-'true' flag values stay dormant (fail-closed)", async () => {
    process.env.POD_AUTO_FULFILL_ENABLED = "TRUE";
    await post(JSON.stringify(baseOrder));
    expect(recordPodOrder).not.toHaveBeenCalled();
  });

  it("bad signature: 401, nothing recorded", async () => {
    const res = await post(JSON.stringify(baseOrder), "wrong");
    expect(res.status).toBe(401);
    expect(recordPodOrder).not.toHaveBeenCalled();
  });

  it("paid order: recorded (global org) and answered 200 BEFORE any Printful work; the draft and the backlog run after the response", async () => {
    const res = await post(JSON.stringify(baseOrder));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true, wooOrderId: "7164" });
    expect(recordPodOrder).toHaveBeenCalledWith(fakeDb, "7164", null, {
      recipient: expect.objectContaining({ address1: "Ship Rd 2" }),
      items: [{ sku: "TEE-BLK-M", quantity: 2 }, { sku: "TEE-WHT-L", quantity: 1 }],
    });
    expect(processPodOrder).not.toHaveBeenCalled();
    expect(drainPodOrderInbox).not.toHaveBeenCalled();
    await runAfter();
    expect(processPodOrder).toHaveBeenCalledWith(fakeDb, ROW);
    expect(drainPodOrderInbox).toHaveBeenCalledWith(fakeDb);
  });

  it("a failing or throwing draft after the response is logged, and the backlog still drains", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    processPodOrder.mockRejectedValueOnce(new Error("boom"));
    await post(JSON.stringify(baseOrder));
    await runAfter();
    expect(drainPodOrderInbox).toHaveBeenCalledTimes(1);
    processPodOrder.mockResolvedValueOnce({ kind: "failed", error: "printful_502", attempts: 1 });
    await post(JSON.stringify(baseOrder));
    await runAfter();
    expect(err).toHaveBeenCalledWith("[woo-order] 7164: failed", expect.objectContaining({ kind: "failed" }));
  });

  it("recorded but not read back: still 200 (the sweep takes the pending row once stale), no inline processing", async () => {
    recordPodOrder.mockResolvedValueOnce({ ok: true, row: null });
    const res = await post(JSON.stringify(baseOrder));
    expect(res.status).toBe(200);
    await runAfter();
    expect(processPodOrder).not.toHaveBeenCalled();
    expect(drainPodOrderInbox).toHaveBeenCalledTimes(1);
  });

  it.each(["cancelled", "refunded", "failed", "trash"])("status %s closes a waiting inbox row and never records", async (status) => {
    const res = await post(JSON.stringify({ ...baseOrder, status }));
    expect(await res.json()).toMatchObject({ ignored: true, reason: "status_not_paid" });
    expect(cancelPodOrderIfOpen).toHaveBeenCalledWith(fakeDb, "7164", status);
    expect(recordPodOrder).not.toHaveBeenCalled();
  });

  it("pending / on-hold (not paid yet) neither records nor cancels", async () => {
    await post(JSON.stringify({ ...baseOrder, status: "on-hold" }));
    expect(cancelPodOrderIfOpen).not.toHaveBeenCalled();
    expect(recordPodOrder).not.toHaveBeenCalled();
  });

  it("paid but unfulfillable as delivered (no address): kept for the operator, 200 needsManual", async () => {
    const res = await post(JSON.stringify({ ...baseOrder, shipping: {}, billing: {} }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: "recipient_incomplete", needsManual: true });
    expect(recordUnfulfillablePodOrder).toHaveBeenCalledWith(fakeDb, "7164", "recipient_incomplete");
    expect(recordPodOrder).not.toHaveBeenCalled();
  });

  it("missing order id: 400 (nothing to key the inbox row on)", async () => {
    const res = await post(JSON.stringify({ ...baseOrder, id: undefined }));
    expect(res.status).toBe(400);
    expect(recordUnfulfillablePodOrder).not.toHaveBeenCalled();
  });

  it("inbox write failure: 502 and nothing scheduled (nothing durable exists)", async () => {
    recordPodOrder.mockResolvedValueOnce({ ok: false, error: "conn refused" });
    const res = await post(JSON.stringify(baseOrder));
    expect(res.status).toBe(502);
    expect(afterCallbacks).toHaveLength(0);
    recordUnfulfillablePodOrder.mockResolvedValueOnce({ ok: false, error: "conn refused" });
    expect((await post(JSON.stringify({ ...baseOrder, shipping: {}, billing: {} }))).status).toBe(502);
  });

  it("supabase not configured: 503 before anything", async () => {
    getSupabaseWriteClient.mockReturnValueOnce(null);
    const res = await post(JSON.stringify(baseOrder));
    expect(res.status).toBe(503);
    expect(recordPodOrder).not.toHaveBeenCalled();
  });
});
