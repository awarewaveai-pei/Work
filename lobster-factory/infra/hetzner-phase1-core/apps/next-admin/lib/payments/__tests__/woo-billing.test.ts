import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { ensureWpCustomer, WpCustomerRefused, type WpCustomerDeps } from "@/lib/entitlements/wp-customers";
import { paymentProvider, PaymentParseError } from "@/lib/payments";
import { sign } from "node:crypto";
import { createPrivateKey } from "node:crypto";
import fixture from "./fixtures/ed25519-v1.json";
import { PAYMENT_SIGNATURE_HEADER, PAYMENT_SITE_HEADER, signPayment } from "../hmac";
import type { SellerSite } from "../sites";
import { wooBillingProvider } from "../woo-billing";

const SECRET = "woo-payments-test-secret-0123456789abcd";
const ORG = "00000000-0000-4000-8000-0000000000d1";
const DB = {} as SupabaseClient;
const AWC: SellerSite = { id: "site-awc", host: "aware-wave.com", keyId: "aware-wave-com", sellerOrganizationId: "org-internal", sellerKind: "internal",
  verifyAlg: "hmac-env", publicKey: null, envVar: "PAYMENTS_WOO_SECRET", handoffPublicKey: null, handoffEnvVar: "AUTH_WP_HANDOFF_SECRET", status: "active" };
// a reseller's site on ed25519, keyed by the shared vector (fixtures/ed25519-v1.json, also run by the plugin's tests)
const SHOP: SellerSite = { ...AWC, id: "site-shop", host: "shop.example", keyId: "shop-b", sellerOrganizationId: "org-reseller", sellerKind: "customer",
  verifyAlg: "ed25519", publicKey: fixture.public_key_pem, envVar: null, handoffEnvVar: null };
const SITES = [AWC, SHOP];
const shopKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(fixture.seed_hex, "hex")]), format: "der", type: "pkcs8" });
const signShop = (raw: string) => sign(null, Buffer.from(raw, "utf8"), shopKey).toString("base64");
const body = (o: object = {}) => JSON.stringify({ event_id: "wc:woocommerce_payment_complete:1234", wp_user_id: 57, email: "A@B.tw", email_verified: true, display_name: "A B", kind: "credit_pack", units: 500, order_ref: "1234", ...o });

/** ensureWpCustomer with every outside step recorded in call order; `state` is what a retry finds. */
function customerDeps(state: { identity?: string; orgCalls?: number; orgMade?: boolean; inviteUserId?: string | null; inviteOk?: boolean; inviteStatus?: number; inviteError?: string;
  owner?: { userKind: string; orgId: unknown } | null } = {}) {
  const calls: string[] = [];
  const deps: WpCustomerDeps = {
    find: vi.fn(async () => { calls.push("find"); return state.identity ? { organizationId: state.identity, userId: "u1" } : null; }),
    existingOrganization: vi.fn(async () => (state.orgMade ? { id: ORG, name: "A B" } : null)),
    emailOwner: vi.fn(async () => state.owner ?? null),
    organization: vi.fn(async () => { calls.push("organization"); state.orgCalls = (state.orgCalls ?? 0) + 1; state.orgMade = true; return { id: ORG, name: "A B" }; }),
    productKey: vi.fn(async () => "social"),
    invite: vi.fn(async () => {
      calls.push("invite");
      if (state.inviteOk === false) return { ok: false as const, status: (state.inviteStatus ?? 503) as 503, error: state.inviteError ?? "mail_not_configured", ...(state.inviteUserId ? { userId: state.inviteUserId } : {}) };
      if (!state.owner) state.owner = { userKind: "client", orgId: ORG }; // the account now exists for this org
      return { ok: true as const, userId: state.inviteUserId ?? "u1", kind: "invite" as const, created: true };
    }),
    link: vi.fn(async (_db, input) => { calls.push("link"); state.identity = input.organizationId; return { organizationId: input.organizationId, userId: input.userId, created: true }; }),
  };
  return { deps, calls, state };
}

const alerts: Array<[string, string, string]> = [];
const siteLookups: string[] = [];
const provider = (deps: WpCustomerDeps, maySell: (site: SellerSite, plan: string | undefined) => string | null = () => null) => wooBillingProvider({ PAYMENTS_WOO_SECRET: SECRET },
  { ensureCustomer: (db, member, plan, create) => ensureWpCustomer(db, member, plan, create, deps), db: () => DB,
    alert: async (_db, ns, eventId, code) => { alerts.push([ns, eventId, code]); },
    site: async (_db, keyId) => { siteLookups.push(keyId); return SITES.find((x) => x.keyId === keyId) ?? null; },
    maySell: async (_db, site, plan) => maySell(site, plan) });
const AT_AWC = { site: AWC };

const DEPS_FOR_VERIFY = { ensureCustomer: ensureWpCustomer, db: () => DB, alert: async () => {}, site: async () => AWC, maySell: async () => null };

describe("woo payment provider (ADR 017 step 4b-3; sites 4c-2)", () => {
  it("answers only when PAYMENTS_PROVIDERS names it", () => {
    expect(paymentProvider("woo", { PAYMENTS_PROVIDERS: "local" })).toBeNull();
    expect(paymentProvider("woo", { PAYMENTS_PROVIDERS: "local,woo" })?.name).toBe("woo");
  });

  it("a request without a site header verifies against the aware-wave.com env key", async () => {
    const raw = body();
    const p = provider(customerDeps().deps);
    siteLookups.length = 0;
    await expect(p.verify(new Headers({ [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, SECRET) }), raw)).resolves.toEqual({ site: AWC });
    expect(siteLookups).toEqual(["aware-wave-com"]);
    await expect(p.verify(new Headers({ [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, SECRET + "x") }), raw)).resolves.toBeNull();
    await expect(p.verify(new Headers({ [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, SECRET) }), raw.replace("500", "5000"))).resolves.toBeNull();
    await expect(p.verify(new Headers(), raw)).resolves.toBeNull();
    // under 32 characters the env key verifies nothing
    const short = wooBillingProvider({ PAYMENTS_WOO_SECRET: "short" }, { ...DEPS_FOR_VERIFY });
    await expect(short.verify(new Headers({ [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, "short") }), raw)).resolves.toBeNull();
  });

  it("a request naming a site verifies with that site's ed25519 public key", async () => {
    const p = provider(customerDeps().deps);
    const raw = fixture.body;
    expect(signShop(raw)).toBe(fixture.signature_base64);   // the shared vector, byte for byte
    await expect(p.verify(new Headers({ [PAYMENT_SITE_HEADER]: "shop-b", [PAYMENT_SIGNATURE_HEADER]: fixture.signature_base64 }), raw)).resolves.toEqual({ site: SHOP });
    // the same body and signature naming another site is not that site's request
    await expect(p.verify(new Headers({ [PAYMENT_SITE_HEADER]: "aware-wave-com", [PAYMENT_SIGNATURE_HEADER]: fixture.signature_base64 }), raw)).resolves.toBeNull();
    // the shop's own key over different bytes, an HMAC from the shop, or a site nobody registered: nothing verifies
    await expect(p.verify(new Headers({ [PAYMENT_SITE_HEADER]: "shop-b", [PAYMENT_SIGNATURE_HEADER]: fixture.signature_base64 }), raw + " ")).resolves.toBeNull();
    await expect(p.verify(new Headers({ [PAYMENT_SITE_HEADER]: "shop-b", [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, SECRET) }), raw)).resolves.toBeNull();
    await expect(p.verify(new Headers({ [PAYMENT_SITE_HEADER]: "shop-x", [PAYMENT_SIGNATURE_HEADER]: signShop(raw) }), raw)).resolves.toBeNull();
  });

  it("the body may not name a seller or a site", async () => {
    // verify chooses the site from the header alone, whatever the body says
    const raw = body({ site_id: "site-shop" });
    siteLookups.length = 0;
    const { deps, calls } = customerDeps();
    await expect(provider(deps).verify(new Headers({ [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, SECRET) }), raw)).resolves.toEqual({ site: AWC });
    expect(siteLookups).toEqual(["aware-wave-com"]);
    for (const named of [{ site_id: "site-shop" }, { seller_organization_id: "org-reseller" }]) {
      await expect(provider(deps).parse(body(named), AT_AWC)).rejects.toMatchObject({ code: "seller_not_allowed" });
    }
    expect(calls).toEqual([]);
  });

  it("another seller's site is never told whose account an email is; the operator's incident is", async () => {
    // the member's email belongs to aware-wave.com's member: the shop hears customer_refused, the detail stays ours
    const owner = { userKind: "client", orgId: "org-awc-member", orgMetadata: { source: "awarewave-wp", wp_user_id: 9 } };
    const taken = customerDeps({ owner });
    await expect(provider(taken.deps).parse(body(), { site: SHOP })).rejects.toMatchObject({ code: "customer_refused", detail: "email_taken_elsewhere" });
    const staff = customerDeps({ owner: { userKind: "staff", orgId: null } });
    await expect(provider(staff.deps).parse(body(), { site: SHOP })).rejects.toMatchObject({ code: "customer_refused", detail: "email_taken" });
    // aware-wave.com is ours: it keeps the precise code; a refusal about the shop's own member stays precise too
    const shopMember = { userKind: "client", orgId: "org-shop-member", orgMetadata: { source: "customer-wp", wp_user_id: 9, site_id: "site-shop" } };
    await expect(provider(customerDeps({ owner: shopMember }).deps).parse(body(), AT_AWC)).rejects.toMatchObject({ code: "email_taken_elsewhere" });
    await expect(provider(customerDeps().deps).parse(body({ email_verified: false }), { site: SHOP })).rejects.toMatchObject({ code: "email_unverified" });
  });

  it("a disabled site's signed payment is a refusal the operator hears of, not a bad signature", async () => {
    const closed = { ...SHOP, status: "disabled" as const };
    const raw = fixture.body;
    const p = wooBillingProvider({}, { ...DEPS_FOR_VERIFY, site: async () => closed });
    await expect(p.verify(new Headers({ [PAYMENT_SITE_HEADER]: "shop-b", [PAYMENT_SIGNATURE_HEADER]: fixture.signature_base64 }), raw)).resolves.toEqual({ site: closed });
    const { deps, calls } = customerDeps();
    await expect(provider(deps).parse(body(), { site: closed })).rejects.toMatchObject({ code: "site_disabled" });
    expect(calls).toEqual([]);
  });

  it("a seller without the resell row for the product is refused before any account is made", async () => {
    const { deps, calls } = customerDeps();
    const p = provider(deps, (site) => (site.keyId === "shop-b" ? "seller_not_licensed" : null));
    const paid = body({ kind: "subscription_paid", plan_key: "social_pro", period_end: "2026-11-25T00:00:00Z", units: undefined, order_ref: undefined });
    await expect(p.parse(paid, { site: SHOP })).rejects.toMatchObject({ code: "seller_not_licensed" });
    expect(calls).toEqual([]);
    // a refund is money going back: it never asks for the licence
    const known = customerDeps({ identity: ORG });
    await expect(provider(known.deps, () => "seller_not_licensed").parse(body({ kind: "refund", target: "credit_pack", order_ref: "1", units: undefined }), { site: SHOP }))
      .resolves.toMatchObject({ siteId: "site-shop" });
  });

  it("a known wp member resolves to its billing account", async () => {
    const { deps, calls } = customerDeps({ identity: ORG });
    await expect(provider(deps).parse(body(), AT_AWC)).resolves.toEqual({
      eventId: "wc:woocommerce_payment_complete:1234",
      event: { kind: "credit_pack", organization_id: ORG, units: 500, order_ref: "1234" },
      siteId: "site-awc",
    });
    expect(calls).toEqual(["find"]);
  });

  it("a first-time payer gets an organization, an invite and an identity in that order", async () => {
    const { deps, calls } = customerDeps();
    const got = await provider(deps).parse(body({ kind: "subscription_paid", plan_key: "social_pro", period_end: "2026-11-25T00:00:00Z", units: undefined, order_ref: undefined }), AT_AWC);
    expect(got.event).toEqual({ kind: "subscription_paid", organization_id: ORG, plan_key: "social_pro", period_end: "2026-11-25T00:00:00Z" });
    expect(calls).toEqual(["find", "organization", "invite", "link"]);
    expect(deps.invite).toHaveBeenCalledWith(DB, { orgId: ORG, orgName: "A B", email: "a@b.tw", productKey: "social" });
    expect(deps.link).toHaveBeenCalledWith(DB, { provider: "awarewave-wp", siteId: "site-awc", externalId: "57", userId: "u1", organizationId: ORG });
  });

  it("a retry after a half-made account does not create a second organization", async () => {
    // First delivery: organization and account made, then the identity write fails (an outage) -> 500, sender retries.
    const shared = { orgCalls: 0 } as { identity?: string; orgCalls: number };
    const first = customerDeps(shared);
    (first.deps.link as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("connection reset"));
    await expect(provider(first.deps).parse(body(), AT_AWC)).rejects.toThrow("connection reset");
    // The retry finds the organization the first delivery made (by its slug), so it never inserts a second one; the
    // account's email now belongs to that organization, so the email check lets it through; linking completes.
    await expect(provider(first.deps).parse(body(), AT_AWC)).resolves.toMatchObject({ event: { organization_id: ORG } });
    const third = customerDeps(shared);
    await provider(third.deps).parse(body(), AT_AWC);
    expect(third.calls).toEqual(["find"]);
    expect(shared.orgCalls).toBe(1);
  });

  it("a guest checkout is refused with guest_checkout", async () => {
    const { deps, calls } = customerDeps();
    for (const wp_user_id of [0, null, undefined]) {
      await expect(provider(deps).parse(body({ wp_user_id }), AT_AWC)).rejects.toMatchObject({ code: "guest_checkout" });
    }
    expect(calls).toEqual([]);
  });

  it("an invalid email is refused", async () => {
    const { deps, calls } = customerDeps();
    await expect(provider(deps).parse(body({ email: "not-an-email" }), AT_AWC)).rejects.toMatchObject({ code: "invalid_email" });
    expect(calls).toEqual([]);
  });

  it("the sender cannot name our account, and a malformed event creates no account", async () => {
    const { deps, calls } = customerDeps();
    await expect(provider(deps).parse(body({ organization_id: ORG }), AT_AWC)).rejects.toMatchObject({ code: "organization_id_not_allowed" });
    await expect(provider(deps).parse(body({ units: -1 }), AT_AWC)).rejects.toBeInstanceOf(PaymentParseError);
    expect(calls).toEqual([]);
  });

  it("an email that is already staff's or another organization's is refused before anything is written", async () => {
    for (const owner of [{ userKind: "staff", orgId: null }, { userKind: "client", orgId: "org-other" }]) {
      const taken = customerDeps({ owner });
      await expect(provider(taken.deps).parse(body(), AT_AWC)).rejects.toMatchObject({ code: "email_taken" });
      expect(taken.calls).toEqual(["find"]);
    }
  });

  it("only a payment creates an account: a refund, cancel or chargeback for an unknown member is refused", async () => {
    for (const ev of [{ kind: "refund", target: "credit_pack", order_ref: "1", units: undefined }, { kind: "subscription_canceled", plan_key: "p", units: undefined, order_ref: undefined },
      { kind: "chargeback", units: undefined, order_ref: undefined }]) {
      const { deps, calls } = customerDeps();
      await expect(provider(deps).parse(body(ev), AT_AWC)).rejects.toMatchObject({ code: "unknown_member" });
      expect(calls).toEqual(["find"]);
    }
  });

  it("a refusal raises an operator incident naming only the checked event id and kind", async () => {
    alerts.length = 0;
    const p = provider(customerDeps().deps);
    await p.refused!(body(), "email_taken", AT_AWC);
    await p.refused!(body({ event_id: "bad id with spaces", kind: "x".repeat(80) }), "invalid_event_id", AT_AWC);
    await p.refused!("not json", "invalid_json", AT_AWC);
    // another site's event 1234 is another incident: the fingerprint carries the site's namespace
    await p.refused!(body(), "email_taken", { site: SHOP });
    expect(alerts).toEqual([["woo", "wc:woocommerce_payment_complete:1234", "email_taken"], ["woo", "unknown", "invalid_event_id"], ["woo", "unknown", "invalid_json"],
      ["woo@shop-b", "wc:woocommerce_payment_complete:1234", "email_taken"]]);
  });

  it("a first payment whose address WordPress did not prove makes no account", async () => {
    const { deps, calls } = customerDeps();
    for (const email_verified of [false, undefined, "true"]) {
      await expect(provider(deps).parse(body({ email_verified }), AT_AWC)).rejects.toMatchObject({ code: "email_unverified" });
    }
    expect(calls).toEqual(["find", "find", "find"]);
  });

  it("an unknown plan is refused before any account is made", async () => {
    const { deps, calls } = customerDeps();
    (deps.productKey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new WpCustomerRefused("unknown_plan"));
    await expect(provider(deps).parse(body({ kind: "subscription_paid", plan_key: "gone", period_end: "2026-11-25T00:00:00Z", units: undefined, order_ref: undefined }), AT_AWC))
      .rejects.toMatchObject({ code: "unknown_plan" });
    expect(calls).toEqual(["find"]);
  });

  it("an invite refused after the email check is a final refusal; a failed mail still links the account", async () => {
    for (const inviteUserId of [null, "someone-else"]) {
      const taken = customerDeps({ inviteOk: false, inviteStatus: 409, inviteError: "email_taken", inviteUserId });
      await expect(provider(taken.deps).parse(body(), AT_AWC)).rejects.toMatchObject({ code: "email_taken" });
      expect(taken.calls).not.toContain("link");
    }
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const noMail = customerDeps({ inviteOk: false, inviteStatus: 503, inviteError: "mail_not_configured", inviteUserId: "u9" });
    await expect(provider(noMail.deps).parse(body(), AT_AWC)).resolves.toMatchObject({ event: { organization_id: ORG } });
    expect(noMail.deps.link).toHaveBeenCalledWith(DB, expect.objectContaining({ userId: "u9" }));
    const down = customerDeps({ inviteOk: false, inviteStatus: 503, inviteError: "auth_lookup_failed", inviteUserId: null });
    await expect(provider(down.deps).parse(body(), AT_AWC)).rejects.not.toBeInstanceOf(PaymentParseError);
  });

  it("an identity conflict is a final refusal", async () => {
    const { deps } = customerDeps();
    (deps.link as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("identity_conflict"));
    await expect(provider(deps).parse(body(), AT_AWC)).rejects.toMatchObject({ code: "identity_conflict" });
    expect(new WpCustomerRefused("x").code).toBe("x");
  });
});
