import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWooOrder, verifyWooSignature } from "./route";

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

  it("skips non-POD (no-SKU) lines; an order with zero POD lines is a 200 no-op", () => {
    const r = parseWooOrder({ ...baseOrder, line_items: [{ quantity: 1 }, { sku: "  ", quantity: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("no_pod_line_items");
      expect(r.status).toBe(200); // benign — Woo should not retry
    }
  });

  it("rejects a missing order id (400)", () => {
    const r = parseWooOrder({ ...baseOrder, id: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("requires state_code for US/CA/AU", () => {
    const us = { ...baseOrder, shipping: { ...baseOrder.shipping, country: "US", state: undefined } };
    const r = parseWooOrder(us);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("state_code_required_for_country");
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
