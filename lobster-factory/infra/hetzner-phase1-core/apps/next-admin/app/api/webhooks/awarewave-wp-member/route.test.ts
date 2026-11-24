import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_SIGNATURE_HEADER, signPayment } from "@/lib/payments/hmac";

const real = vi.hoisted(() => ({ ensure: null as null | ((...a: unknown[]) => unknown) }));
const ensure = vi.fn((...args: unknown[]) => (real.ensure as (...a: unknown[]) => unknown)(...args));
vi.mock("@/lib/entitlements/wp-customers", async (orig) => {
  const mod = await orig<typeof import("@/lib/entitlements/wp-customers")>();
  real.ensure = mod.ensureWpCustomer as (...a: unknown[]) => unknown;
  return { ...mod, ensureWpCustomer: (...args: unknown[]) => ensure(...args) };
});
const orgName = vi.fn(async () => ({ data: { name: "Soulful" }, error: null }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: orgName }) }) }) }),
}));
// aware-wave.com's row (0133): hmac-env on PAYMENTS_WOO_SECRET, the same row the payment route reads
vi.mock("@/lib/payments/sites", async (orig) => ({ ...(await orig<object>()),
  findSiteByKeyId: async (_db: unknown, keyId: string) => (keyId === "aware-wave-com" ? { id: "site-awc", host: "aware-wave.com", keyId, sellerOrganizationId: "org-internal",
    sellerKind: "internal", verifyAlg: "hmac-env", publicKey: null, envVar: "PAYMENTS_WOO_SECRET", handoffPublicKey: null, handoffEnvVar: null, status: "active" } : null) }));

const SECRET = "member-events-test-secret-0123456789abc";
const ORG = "00000000-0000-4000-8000-0000000000c1";
const CODE = "A".repeat(43);
const event = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ kind: "member_invite", wp_user_id: 42, email: "Owner@Soulful.tw", email_verified: true, invite_code: CODE, ...over });
const post = async (body: string, signature: string | null = signPayment(body, SECRET)) => {
  const { POST } = await import("./route");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers[PAYMENT_SIGNATURE_HEADER] = signature;
  const res = await POST(new Request("http://app.test/api/webhooks/awarewave-wp-member", { method: "POST", headers, body }));
  return [res.status, await res.json()] as const;
};

describe("POST /api/webhooks/awarewave-wp-member", () => {
  beforeEach(() => {
    vi.stubEnv("PAYMENTS_PROVIDERS", "woo");
    vi.stubEnv("PAYMENTS_WOO_SECRET", SECRET);
    ensure.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("a signed member_invite links through ensureWpCustomer with the code and answers 200 with the unit", async () => {
    ensure.mockResolvedValueOnce({ organizationId: ORG, created: false });
    expect(await post(event())).toEqual([200, { ok: true, organization: { name: "Soulful" } }]);
    const [, member, planKey, create] = ensure.mock.calls[0] as [unknown, Record<string, unknown>, unknown, unknown];
    expect(member).toMatchObject({ wpUserId: 42, email: "owner@soulful.tw", emailVerified: true, inviteCode: CODE });
    expect((member.site as { keyId: string }).keyId).toBe("aware-wave-com");
    expect([planKey, create]).toEqual([undefined, false]);
  });

  it("a refusal is a final 409 carrying the wp-customers code unchanged", async () => {
    const { WpCustomerRefused } = await import("@/lib/entitlements/wp-customers");
    for (const code of ["invite_expired", "invite_used", "invite_email_mismatch", "identity_conflict"]) {
      ensure.mockRejectedValueOnce(new WpCustomerRefused(code));
      expect(await post(event())).toEqual([409, { ok: false, error: code }]);
    }
  });

  it("a wrong or missing signature is 401 and nothing is linked", async () => {
    const body = event();
    for (const sig of [null, signPayment(body, "another-secret-0123456789-0123456789"), signPayment(body + " ", SECRET)]) {
      expect(await post(body, sig)).toEqual([401, { ok: false, error: "invalid_signature" }]);
    }
    expect(ensure).not.toHaveBeenCalled();
  });

  it("an unknown event kind is 400 (and so is a payment event sent here)", async () => {
    for (const kind of ["member_deleted_typo", "credit_pack", "__proto__", undefined]) {
      expect(await post(event({ kind }))).toEqual([400, { ok: false, error: "unknown_kind" }]);
    }
    expect(ensure).not.toHaveBeenCalled();
  });

  it("an unverified email is refused by the real redeem path before any database read", async () => {
    expect(await post(event({ email_verified: false }))).toEqual([409, { ok: false, error: "email_unverified" }]);
    expect(await post(event({ email_verified: "true" }))).toEqual([409, { ok: false, error: "email_unverified" }]);
    expect(orgName).not.toHaveBeenCalled();
  });

  it("an infrastructure error is a retryable 500", async () => {
    ensure.mockRejectedValueOnce(new Error("connection reset"));
    expect(await post(event())).toEqual([500, { ok: false, error: "member_event_not_recorded" }]);
  });
});
