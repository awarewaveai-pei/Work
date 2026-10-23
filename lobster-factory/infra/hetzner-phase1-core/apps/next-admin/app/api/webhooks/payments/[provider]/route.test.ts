import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_SIGNATURE_HEADER, signLocalPayment } from "@/lib/payments/local";

const apply = vi.fn();
vi.mock("@/lib/entitlements/contracts", () => ({ applyPaymentEvent: (...args: unknown[]) => apply(...args) }));

const SECRET = "local-payments-test-secret-0123456789";
const ORG = "00000000-0000-4000-8000-0000000000c1";
const raw = JSON.stringify({ event_id: "bank-1", kind: "credit_pack", organization_id: ORG, units: 500, order_ref: "TX-1" });
const post = async (body: string, signature: string | null, provider = "local") => {
  const { POST } = await import("./route");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers[LOCAL_SIGNATURE_HEADER] = signature;
  return POST(new Request(`http://app.test/api/webhooks/payments/${provider}`, { method: "POST", headers, body }), { params: Promise.resolve({ provider }) });
};

describe("POST /api/webhooks/payments/[provider]", () => {
  beforeEach(() => {
    vi.stubEnv("PAYMENTS_PROVIDERS", "local");
    vi.stubEnv("PAYMENTS_LOCAL_SECRET", SECRET);
    apply.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("an invalid X-AwareWave-Payment-Signature is refused with 401 and records nothing", async () => {
    for (const signature of [null, "", signLocalPayment(raw, "another-secret-0123456789-0123456789"), signLocalPayment(raw + " ", SECRET)]) {
      const res = await post(raw, signature);
      expect([res.status, await res.json()]).toEqual([401, { ok: false, error: "invalid_signature" }]);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("a provider PAYMENTS_PROVIDERS does not name answers 404", async () => {
    vi.stubEnv("PAYMENTS_PROVIDERS", "");
    expect((await post(raw, signLocalPayment(raw, SECRET))).status).toBe(404);
    vi.stubEnv("PAYMENTS_PROVIDERS", "local");
    expect((await post(raw, signLocalPayment(raw, SECRET), "woo")).status).toBe(404);
    expect(apply).not.toHaveBeenCalled();
  });

  it("a signed event is applied once and its outcome returned; a replay passes the inbox's answer through", async () => {
    apply.mockResolvedValueOnce({ ok: true, event: "e1", kind: "credit_pack", ledger: "l1", units: 500 });
    const res = await post(raw, signLocalPayment(raw, SECRET));
    expect([res.status, await res.json()]).toEqual([200, { ok: true, event: "e1", kind: "credit_pack", ledger: "l1", units: 500 }]);
    expect(apply).toHaveBeenCalledWith("local", { eventId: "bank-1", event: { kind: "credit_pack", organization_id: ORG, units: 500, order_ref: "TX-1" } });
    apply.mockResolvedValueOnce({ ok: true, replayed: true, event: "e1" });
    expect(await (await post(raw, signLocalPayment(raw, SECRET))).json()).toEqual({ ok: true, replayed: true, event: "e1" });
  });

  it("malformed is 400, a rejected payment keeps its status, an infrastructure error is 500 so the sender retries", async () => {
    const bad = JSON.stringify({ event_id: "bank-2", kind: "credit_pack", organization_id: ORG, units: -1, order_ref: "TX" });
    expect([(await post(bad, signLocalPayment(bad, SECRET))).status, apply.mock.calls.length]).toEqual([400, 0]);
    apply.mockResolvedValueOnce({ ok: false, status: 409, code: "account_frozen" });
    const frozen = await post(raw, signLocalPayment(raw, SECRET));
    expect([frozen.status, await frozen.json()]).toEqual([409, { ok: false, error: "account_frozen" }]);
    apply.mockRejectedValueOnce(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = await post(raw, signLocalPayment(raw, SECRET));
    expect([down.status, await down.json()]).toEqual([500, { ok: false, error: "payment_not_recorded" }]);
  });

  it("refuses an oversized body before reading or verifying it, by Content-Length", async () => {
    const huge = JSON.stringify({ event_id: "x", pad: "a".repeat(300_000) });
    expect((await post(huge, signLocalPayment(huge, SECRET))).status).toBe(413);
    const { POST } = await import("./route");
    const text = vi.fn();
    const req = { headers: new Headers({ "content-length": String(50 * 1024 * 1024) }), text } as unknown as Request;
    expect((await POST(req, { params: Promise.resolve({ provider: "local" }) })).status).toBe(413);
    expect(text).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});
