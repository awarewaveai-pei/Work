import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { ensureWpCustomer, WpCustomerRefused, type WpCustomerDeps } from "@/lib/entitlements/wp-customers";
import { paymentProvider, PaymentParseError } from "@/lib/payments";
import { PAYMENT_SIGNATURE_HEADER, signPayment } from "../hmac";
import { wooBillingProvider } from "../woo-billing";

const SECRET = "woo-payments-test-secret-0123456789abcd";
const ORG = "00000000-0000-4000-8000-0000000000d1";
const DB = {} as SupabaseClient;
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

const alerts: Array<[string, string]> = [];
const provider = (deps: WpCustomerDeps) => wooBillingProvider({ PAYMENTS_WOO_SECRET: SECRET },
  { ensureCustomer: (db, member, plan, create) => ensureWpCustomer(db, member, plan, create, deps), db: () => DB,
    alert: async (_db, eventId, code) => { alerts.push([eventId, code]); } });

describe("woo payment provider (ADR 017 step 4b-3)", () => {
  it("answers only when PAYMENTS_PROVIDERS names it", () => {
    expect(paymentProvider("woo", { PAYMENTS_PROVIDERS: "local" })).toBeNull();
    expect(paymentProvider("woo", { PAYMENTS_PROVIDERS: "local,woo" })?.name).toBe("woo");
  });

  it("an invalid signature does not verify", () => {
    const raw = body();
    const p = provider(customerDeps().deps);
    expect(p.verify(new Headers({ [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, SECRET) }), raw)).toBe(true);
    expect(p.verify(new Headers({ [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, SECRET + "x") }), raw)).toBe(false);
    expect(p.verify(new Headers({ [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, SECRET) }), raw.replace("500", "5000"))).toBe(false);
    expect(p.verify(new Headers(), raw)).toBe(false);
    const short = wooBillingProvider({ PAYMENTS_WOO_SECRET: "short" });
    expect(short.verify(new Headers({ [PAYMENT_SIGNATURE_HEADER]: signPayment(raw, "short") }), raw)).toBe(false);
  });

  it("a known wp member resolves to its billing account", async () => {
    const { deps, calls } = customerDeps({ identity: ORG });
    await expect(provider(deps).parse(body())).resolves.toEqual({
      eventId: "wc:woocommerce_payment_complete:1234",
      event: { kind: "credit_pack", organization_id: ORG, units: 500, order_ref: "1234" },
    });
    expect(calls).toEqual(["find"]);
  });

  it("a first-time payer gets an organization, an invite and an identity in that order", async () => {
    const { deps, calls } = customerDeps();
    const got = await provider(deps).parse(body({ kind: "subscription_paid", plan_key: "social_pro", period_end: "2026-11-25T00:00:00Z", units: undefined, order_ref: undefined }));
    expect(got.event).toEqual({ kind: "subscription_paid", organization_id: ORG, plan_key: "social_pro", period_end: "2026-11-25T00:00:00Z" });
    expect(calls).toEqual(["find", "organization", "invite", "link"]);
    expect(deps.invite).toHaveBeenCalledWith(DB, { orgId: ORG, orgName: "A B", email: "a@b.tw", productKey: "social" });
    expect(deps.link).toHaveBeenCalledWith(DB, { provider: "awarewave-wp", externalId: "57", userId: "u1", organizationId: ORG });
  });

  it("a retry after a half-made account does not create a second organization", async () => {
    // First delivery: organization and account made, then the identity write fails (an outage) -> 500, sender retries.
    const shared = { orgCalls: 0 } as { identity?: string; orgCalls: number };
    const first = customerDeps(shared);
    (first.deps.link as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("connection reset"));
    await expect(provider(first.deps).parse(body())).rejects.toThrow("connection reset");
    // The retry finds the organization the first delivery made (by its slug), so it never inserts a second one; the
    // account's email now belongs to that organization, so the email check lets it through; linking completes.
    await expect(provider(first.deps).parse(body())).resolves.toMatchObject({ event: { organization_id: ORG } });
    const third = customerDeps(shared);
    await provider(third.deps).parse(body());
    expect(third.calls).toEqual(["find"]);
    expect(shared.orgCalls).toBe(1);
  });

  it("a guest checkout is refused with guest_checkout", async () => {
    const { deps, calls } = customerDeps();
    for (const wp_user_id of [0, null, undefined]) {
      await expect(provider(deps).parse(body({ wp_user_id }))).rejects.toMatchObject({ code: "guest_checkout" });
    }
    expect(calls).toEqual([]);
  });

  it("an invalid email is refused", async () => {
    const { deps, calls } = customerDeps();
    await expect(provider(deps).parse(body({ email: "not-an-email" }))).rejects.toMatchObject({ code: "invalid_email" });
    expect(calls).toEqual([]);
  });

  it("the sender cannot name our account, and a malformed event creates no account", async () => {
    const { deps, calls } = customerDeps();
    await expect(provider(deps).parse(body({ organization_id: ORG }))).rejects.toMatchObject({ code: "organization_id_not_allowed" });
    await expect(provider(deps).parse(body({ units: -1 }))).rejects.toBeInstanceOf(PaymentParseError);
    expect(calls).toEqual([]);
  });

  it("an email that is already staff's or another organization's is refused before anything is written", async () => {
    for (const owner of [{ userKind: "staff", orgId: null }, { userKind: "client", orgId: "org-other" }]) {
      const taken = customerDeps({ owner });
      await expect(provider(taken.deps).parse(body())).rejects.toMatchObject({ code: "email_taken" });
      expect(taken.calls).toEqual(["find"]);
    }
  });

  it("only a payment creates an account: a refund, cancel or chargeback for an unknown member is refused", async () => {
    for (const ev of [{ kind: "refund", target: "credit_pack", order_ref: "1", units: undefined }, { kind: "subscription_canceled", plan_key: "p", units: undefined, order_ref: undefined },
      { kind: "chargeback", units: undefined, order_ref: undefined }]) {
      const { deps, calls } = customerDeps();
      await expect(provider(deps).parse(body(ev))).rejects.toMatchObject({ code: "unknown_member" });
      expect(calls).toEqual(["find"]);
    }
  });

  it("a refusal raises an operator incident naming only the checked event id and kind", async () => {
    alerts.length = 0;
    const p = provider(customerDeps().deps);
    await p.refused!(body(), "email_taken");
    await p.refused!(body({ event_id: "bad id with spaces", kind: "x".repeat(80) }), "invalid_event_id");
    await p.refused!("not json", "invalid_json");
    expect(alerts).toEqual([["wc:woocommerce_payment_complete:1234", "email_taken"], ["unknown", "invalid_event_id"], ["unknown", "invalid_json"]]);
  });

  it("a first payment whose address WordPress did not prove makes no account", async () => {
    const { deps, calls } = customerDeps();
    for (const email_verified of [false, undefined, "true"]) {
      await expect(provider(deps).parse(body({ email_verified }))).rejects.toMatchObject({ code: "email_unverified" });
    }
    expect(calls).toEqual(["find", "find", "find"]);
  });

  it("an unknown plan is refused before any account is made", async () => {
    const { deps, calls } = customerDeps();
    (deps.productKey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new WpCustomerRefused("unknown_plan"));
    await expect(provider(deps).parse(body({ kind: "subscription_paid", plan_key: "gone", period_end: "2026-11-25T00:00:00Z", units: undefined, order_ref: undefined })))
      .rejects.toMatchObject({ code: "unknown_plan" });
    expect(calls).toEqual(["find"]);
  });

  it("an invite refused after the email check is a final refusal; a failed mail still links the account", async () => {
    for (const inviteUserId of [null, "someone-else"]) {
      const taken = customerDeps({ inviteOk: false, inviteStatus: 409, inviteError: "email_taken", inviteUserId });
      await expect(provider(taken.deps).parse(body())).rejects.toMatchObject({ code: "email_taken" });
      expect(taken.calls).not.toContain("link");
    }
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const noMail = customerDeps({ inviteOk: false, inviteStatus: 503, inviteError: "mail_not_configured", inviteUserId: "u9" });
    await expect(provider(noMail.deps).parse(body())).resolves.toMatchObject({ event: { organization_id: ORG } });
    expect(noMail.deps.link).toHaveBeenCalledWith(DB, expect.objectContaining({ userId: "u9" }));
    const down = customerDeps({ inviteOk: false, inviteStatus: 503, inviteError: "auth_lookup_failed", inviteUserId: null });
    await expect(provider(down.deps).parse(body())).rejects.not.toBeInstanceOf(PaymentParseError);
  });

  it("an identity conflict is a final refusal", async () => {
    const { deps } = customerDeps();
    (deps.link as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("identity_conflict"));
    await expect(provider(deps).parse(body())).rejects.toMatchObject({ code: "identity_conflict" });
    expect(new WpCustomerRefused("x").code).toBe("x");
  });
});
