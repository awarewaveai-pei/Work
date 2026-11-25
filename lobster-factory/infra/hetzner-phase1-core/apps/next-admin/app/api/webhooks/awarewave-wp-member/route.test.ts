import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_SIGNATURE_HEADER, signPayment } from "@/lib/payments/hmac";
import { findBillingAccount } from "@/lib/entitlements/identities";
import { resetHandoffNonces, signHandoff, wpHandoff } from "@/lib/auth/sources/awarewave-wp";

const real = vi.hoisted(() => ({ ensure: null as null | ((...a: unknown[]) => unknown) }));
const ensure = vi.fn((...args: unknown[]) => (real.ensure as (...a: unknown[]) => unknown)(...args));
vi.mock("@/lib/entitlements/wp-customers", async (orig) => {
  const mod = await orig<typeof import("@/lib/entitlements/wp-customers")>();
  real.ensure = mod.ensureWpCustomer as (...a: unknown[]) => unknown;
  return { ...mod, ensureWpCustomer: (...args: unknown[]) => ensure(...args) };
});

// In-memory stand-in: the member's identity row, the org name, and the 0184 functions as their contract says (the rules
// themselves are tested against Postgres in packages/db/tests/test_0184_member_events.py).
const store = vi.hoisted(() => ({
  identity: null as null | { external_id: string; organization_id: string; user_id: string },
  audits: [] as Array<Record<string, unknown>>,
  prior: null as null | { result: string; organization_id: string | null },
  rpc: [] as Array<[string, Record<string, unknown>]>,
}));
const orgName = vi.fn(async () => ({ data: { name: "Soulful" }, error: null }));
const fakeDb = {
  from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => { filters[col] = v; return q; },
      maybeSingle: async () => {
        if (table === "organizations") return orgName();
        const row = store.identity;
        return { data: row && filters.external_id === row.external_id ? row : null, error: null };
      },
    };
    return q;
  },
  rpc: async (fn: string, args: Record<string, unknown>) => {
    store.rpc.push([fn, args]);
    if (fn === "member_event_check") return { data: store.prior, error: null };
    if (fn === "member_event_deleted") {
      const had = store.identity?.external_id === args.p_external_id;
      if (had) store.identity = null;
      return { data: had ? "deleted" : "no_identity", error: null };
    }
    if (fn === "member_event_email_changed") {
      store.audits.push({ old: args.p_old_domain, new: args.p_new_domain });
      return { data: store.identity ? "audited" : "no_identity", error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  },
};
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => fakeDb }));
// aware-wave.com's row (0133): hmac-env on PAYMENTS_WOO_SECRET, the same row the payment route reads
const AWC = vi.hoisted(() => ({ id: "site-awc", host: "aware-wave.com", keyId: "aware-wave-com", sellerOrganizationId: "org-internal",
  sellerKind: "internal", verifyAlg: "hmac-env", publicKey: null, envVar: "PAYMENTS_WOO_SECRET", handoffPublicKey: null,
  handoffEnvVar: "AUTH_WP_HANDOFF_SECRET", status: "active" }));
vi.mock("@/lib/payments/sites", async (orig) => ({ ...(await orig<object>()),
  findSiteByKeyId: async (_db: unknown, keyId: string) => (keyId === "aware-wave-com" ? AWC : null) }));

const SECRET = "member-events-test-secret-0123456789abc";
const HANDOFF = "member-events-handoff-secret-0123456789";
const ORG = "00000000-0000-4000-8000-0000000000c1";
const CODE = "A".repeat(43);
const STAMP = { event_id: "member_invite:42:0123456789abcdef01234567", occurred_at: "2026-11-24T10:00:00Z" };
const event = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ kind: "member_invite", wp_user_id: 42, email: "Owner@Soulful.tw", email_verified: true, invite_code: CODE, ...STAMP, ...over });
const deleted = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ kind: "member_deleted", wp_user_id: 42, event_id: "member_deleted:42:aa", occurred_at: "2026-11-24T11:00:00Z", ...over });
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
    orgName.mockClear();
    Object.assign(store, { identity: null, audits: [], prior: null, rpc: [] });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("a signed member_invite links through ensureWpCustomer with the code and the stamped redeem, 200 with the unit", async () => {
    ensure.mockResolvedValueOnce({ organizationId: ORG, created: false });
    expect(await post(event())).toEqual([200, { ok: true, organization: { name: "Soulful" } }]);
    const [, member, planKey, create, deps, inviteDeps] = ensure.mock.calls[0] as [unknown, Record<string, unknown>, unknown, unknown, unknown, { redeem: (...a: unknown[]) => Promise<unknown> }];
    expect(member).toMatchObject({ wpUserId: 42, email: "owner@soulful.tw", emailVerified: true, inviteCode: CODE });
    expect((member.site as { keyId: string }).keyId).toBe("aware-wave-com");
    expect([planKey, create, deps]).toEqual([undefined, false, undefined]);
    // the redeem the decision uses is 0184's stamped one, carrying this event's id and time
    await inviteDeps.redeem(fakeDb, { provider: "awarewave-wp", siteId: "site-awc", externalId: "42", inviteId: "inv-1", userId: "u-1", email: "owner@soulful.tw" }).catch(() => null);
    expect(store.rpc.at(-1)).toEqual(["member_event_invite", expect.objectContaining({ p_event_id: STAMP.event_id, p_occurred_at: "2026-11-24T10:00:00.000Z", p_invite_id: "inv-1" })]);
  });

  it("a known or stale event is answered from the database before any account is made", async () => {
    store.prior = { result: "event_stale", organization_id: null };
    expect(await post(event())).toEqual([409, { ok: false, error: "event_stale" }]);
    store.prior = { result: "ok", organization_id: ORG };
    expect(await post(event())).toEqual([200, { ok: true, organization: { name: "Soulful" } }]);
    expect(ensure).not.toHaveBeenCalled();
  });

  it("a refusal is a final 409 carrying the wp-customers code unchanged", async () => {
    const { WpCustomerRefused } = await import("@/lib/entitlements/wp-customers");
    for (const code of ["invite_expired", "invite_used", "invite_email_mismatch", "identity_conflict", "event_stale"]) {
      ensure.mockRejectedValueOnce(new WpCustomerRefused(code));
      expect(await post(event())).toEqual([409, { ok: false, error: code }]);
    }
  });

  it("a missing or malformed event_id or occurred_at is 400, for every kind, before any database call", async () => {
    for (const body of [event({ event_id: undefined }), event({ occurred_at: undefined }), event({ event_id: "has space" }),
      event({ occurred_at: "2026-11-25 10:00:00" }), event({ occurred_at: "2999-01-01T00:00:00Z" }),
      deleted({ event_id: undefined }), deleted({ occurred_at: undefined })]) {
      const [status, json] = await post(body);
      expect(status).toBe(400);
      expect(["invalid_event_id", "invalid_occurred_at"]).toContain(json.error);
    }
    expect(store.rpc).toEqual([]);
    expect(ensure).not.toHaveBeenCalled();
  });

  it("after member_deleted the member's wp-handoff answers not_a_member", async () => {
    store.identity = { external_id: "42", organization_id: ORG, user_id: "user-42" };
    const handoff = async (nonce: string) => {
      const raw = JSON.stringify({ wp_user_id: 42, product_key: "portal", ts: 1_800_000_000, nonce });
      return wpHandoff(raw, signHandoff(raw, HANDOFF), { AUTH_WP_HANDOFF_SECRET: HANDOFF, PUBLIC_BASE_DOMAIN: "aware-wave.com" },
        { db: fakeDb as never, site: async () => AWC as never, find: findBillingAccount, holds: async () => true, now: () => 1_800_000_000 });
    };
    resetHandoffNonces();
    expect(await findBillingAccount(fakeDb as never, { provider: "awarewave-wp", siteId: "site-awc", externalId: "42" })).toEqual({ organizationId: ORG, userId: "user-42" });
    expect(await post(deleted())).toEqual([200, { ok: true, result: "deleted" }]);
    expect(store.rpc).toEqual([["member_event_deleted", { p_site_id: "site-awc", p_event_id: "member_deleted:42:aa",
      p_occurred_at: "2026-11-24T11:00:00.000Z", p_provider: "awarewave-wp", p_external_id: "42" }]]);
    await expect(handoff("n-after-delete-0123456789")).resolves.toMatchObject({ ok: false, status: 404, error: "not_a_member" });
    // a member who never linked: recorded, 200, nothing to undo
    expect(await post(deleted({ wp_user_id: 43, event_id: "member_deleted:43:bb" }))).toEqual([200, { ok: true, result: "no_identity" }]);
  });

  it("member_email_changed only audits the two domains; identities stay", async () => {
    store.identity = { external_id: "42", organization_id: ORG, user_id: "user-42" };
    const body = JSON.stringify({ kind: "member_email_changed", wp_user_id: 42, old_email: "Owner@Soulful.tw", new_email: "boss@new.example",
      event_id: "member_email_changed:42:cc", occurred_at: "2026-11-24T12:00:00Z" });
    expect(await post(body)).toEqual([200, { ok: true, result: "audited" }]);
    expect(store.audits).toEqual([{ old: "soulful.tw", new: "new.example" }]);
    expect(store.rpc.map(([fn]) => fn)).toEqual(["member_event_email_changed"]);
    expect(JSON.stringify(store.rpc)).not.toContain("owner@");
    expect(store.identity).not.toBeNull();
    expect(await post(body.replace("boss@new.example", "not-an-email"))).toEqual([400, { ok: false, error: "invalid_email" }]);
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
