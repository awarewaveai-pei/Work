import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_SIGNATURE_HEADER, signLocalPayment } from "@/lib/payments/local";

const apply = vi.fn();
vi.mock("@/lib/entitlements/contracts", () => ({ applyPaymentEvent: (...args: unknown[]) => apply(...args) }));
const refusedIncident = vi.fn(async (..._args: unknown[]) => ({ id: "i1", error: null }));
vi.mock("@/lib/ops-inbox/ingest", () => ({ ingestIncident: (_db: unknown, draft: { raw: { event_id: string; code: string } }) => refusedIncident(_db, draft.raw.event_id, draft.raw.code, draft) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/entitlements/wp-customers", async (orig) => ({ ...(await orig<object>()), ensureWpCustomer: async () => ({ organizationId: "00000000-0000-4000-8000-0000000000c1", created: false }) }));
// aware-wave.com's row (0133), hmac-env on PAYMENTS_WOO_SECRET; selling is allowed (the site rules are sites.test.ts)
vi.mock("@/lib/payments/sites", async (orig) => ({ ...(await orig<object>()), siteMaySellPlan: async () => null,
  findSiteByKeyId: async (_db: unknown, keyId: string) => (keyId === "aware-wave-com" ? { id: "site-awc", host: "aware-wave.com", keyId, sellerOrganizationId: "org-internal",
    sellerKind: "internal", verifyAlg: "hmac-env", publicKey: null, envVar: "PAYMENTS_WOO_SECRET", handoffPublicKey: null, handoffEnvVar: null, status: "active" } : null) }));

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

  it("woo answers 404 until PAYMENTS_PROVIDERS names it", async () => {
    expect((await post(raw, signLocalPayment(raw, SECRET), "woo")).status).toBe(404);
    vi.stubEnv("PAYMENTS_PROVIDERS", "local,woo");
    vi.stubEnv("PAYMENTS_WOO_SECRET", SECRET);
    // named now: the signature is checked (401), and a guest order is refused before any account work (400)
    expect((await post(raw, null, "woo")).status).toBe(401);
    const guest = JSON.stringify({ event_id: "wc:x:1", wp_user_id: 0, email: "a@b.tw", kind: "credit_pack", units: 1, order_ref: "1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(guest, signLocalPayment(guest, SECRET), "woo");
    expect([res.status, await res.json()]).toEqual([400, { ok: false, error: "guest_checkout" }]);
    expect(apply).not.toHaveBeenCalled();
    expect(refusedIncident).toHaveBeenCalledWith(expect.anything(), "wc:x:1", "guest_checkout", expect.anything());
  });

  it("a woo event the control plane rejects still raises the operator incident", async () => {
    vi.stubEnv("PAYMENTS_PROVIDERS", "woo");
    vi.stubEnv("PAYMENTS_WOO_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => {});
    refusedIncident.mockClear();
    const ev = JSON.stringify({ event_id: "wc:paid:9", wp_user_id: 57, email: "a@b.tw", email_verified: true, kind: "subscription_paid", plan_key: "gone", period_end: "2026-11-25T00:00:00Z" });
    apply.mockResolvedValueOnce({ ok: false, status: 422, code: "unknown_plan" });
    const res = await post(ev, signLocalPayment(ev, SECRET), "woo");
    expect([res.status, await res.json()]).toEqual([422, { ok: false, error: "unknown_plan" }]);
    expect(refusedIncident).toHaveBeenCalledWith(expect.anything(), "wc:paid:9", "unknown_plan", expect.anything());
    // local has no refusal hook: the operator who recorded it sees the answer
    vi.stubEnv("PAYMENTS_PROVIDERS", "local");
    refusedIncident.mockClear();
    apply.mockResolvedValueOnce({ ok: false, status: 409, code: "account_frozen" });
    expect((await post(raw, signLocalPayment(raw, SECRET))).status).toBe(409);
    expect(refusedIncident).not.toHaveBeenCalled();
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
