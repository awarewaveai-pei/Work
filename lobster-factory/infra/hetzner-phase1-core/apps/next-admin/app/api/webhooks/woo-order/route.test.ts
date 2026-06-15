import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the fulfillment seam so handler tests can assert it is (or is NOT) called — the kill-switch
// regression guard for the money red-line.
const createDraftOrderOnNative = vi.fn();
vi.mock("../../../../lib/studio/print-provider", () => ({
  createDraftOrderOnNative: (...a: unknown[]) => createDraftOrderOnNative(...a),
  isNativeStoreConfigured: () => true,
}));

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
