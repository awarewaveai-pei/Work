import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { productRight } from "@/lib/entitlements/product-right";
import { resetHandoffNonces, signHandoff, wpHandoff, wpSummary, type HandoffDeps, type SummaryDeps } from "../sources/awarewave-wp";
import { pickEntitlementRow, type BillingAccount } from "@/lib/entitlements/tables";
import type { EntitlementRecord } from "@/lib/entitlements/can";
import { servedNextAdminProducts } from "@/lib/portal/doors";
import { readWpToken } from "@/app/login/wp/WpSignIn";
import { createPrivateKey, sign } from "node:crypto";
import fixture from "@/lib/payments/__tests__/fixtures/ed25519-v1.json";
import type { SellerSite } from "@/lib/payments/sites";

const AWC: SellerSite = { id: "site-awc", host: "aware-wave.com", keyId: "aware-wave-com", sellerOrganizationId: "org-internal", sellerKind: "internal",
  verifyAlg: "hmac-env", publicKey: null, envVar: "PAYMENTS_WOO_SECRET", handoffPublicKey: null, handoffEnvVar: "AUTH_WP_HANDOFF_SECRET", status: "active" };

const SECRET = "wp-handoff-test-secret-0123456789abcdef";
const ENV = { AUTH_WP_HANDOFF_SECRET: SECRET, PUBLIC_BASE_DOMAIN: "aware-wave.com" };
const NOW = 1_800_000_000;
const ACCOUNT = { organizationId: "org-1", userId: "user-1" };
const req = (o: object = {}) => JSON.stringify({ wp_user_id: 57, product_key: "tarot", ts: NOW, nonce: "n-0123456789abcdef", ...o });

function deps(over: { account?: typeof ACCOUNT | null; holds?: boolean; linkUser?: string; email?: string | null; confirmed?: string | null; meta?: Record<string, unknown> } = {}) {
  const generateLink = vi.fn(async () => ({ data: { properties: { hashed_token: "tok/+=" }, user: { id: over.linkUser ?? ACCOUNT.userId } }, error: null }));
  const user = { id: ACCOUNT.userId, email: over.email ?? "a@b.tw", email_confirmed_at: over.confirmed === undefined ? "2026-10-25T00:00:00Z" : over.confirmed,
    app_metadata: over.meta ?? { user_kind: "client", org_id: ACCOUNT.organizationId } };
  const getUserById = vi.fn(async () => ({ data: { user: over.email === null ? null : user }, error: null }));
  const d: HandoffDeps = {
    db: { auth: { admin: { generateLink, getUserById } } } as unknown as SupabaseClient,
    site: vi.fn(async (_db: SupabaseClient, keyId: string) => [AWC, SHOP].find((x) => x.keyId === keyId) ?? null),
    find: vi.fn(async () => (over.account === undefined ? ACCOUNT : over.account)),
    holds: vi.fn(async () => over.holds ?? true),
    now: () => NOW,
  };
  return { d, generateLink };
}
// a reseller's site: its hand-off key is the shared ed25519 vector (fixtures/ed25519-v1.json)
const SHOP: SellerSite = { ...AWC, id: "site-shop", host: "shop.example", keyId: "shop-b", sellerOrganizationId: "org-reseller", sellerKind: "customer",
  verifyAlg: "ed25519", publicKey: "-----BEGIN PUBLIC KEY-----\nunused\n-----END PUBLIC KEY-----", envVar: null, handoffPublicKey: fixture.public_key_pem, handoffEnvVar: null };
const shopKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(fixture.seed_hex, "hex")]), format: "der", type: "pkcs8" });
const signShop = (raw: string) => sign(null, Buffer.from(raw, "utf8"), shopKey).toString("base64");
const call = (body: string, d: HandoffDeps, sig: string | null = signHandoff(body, SECRET), env: Record<string, string | undefined> = ENV) => wpHandoff(body, sig, env, d);

describe("WordPress one-time sign-in into a product door (ADR 015 order 1, 4b-4)", () => {
  beforeEach(() => resetHandoffNonces());

  it("a member holding the product gets a one-time recovery link on that product's door", async () => {
    const { d, generateLink } = deps();
    await expect(call(req(), d)).resolves.toEqual({ ok: true, url: "https://tarot.aware-wave.com/login/wp#token_hash=tok%2F%2B%3D&type=recovery&uid=user-1" });
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "a@b.tw" });
    expect(d.find).toHaveBeenCalledWith(d.db, { provider: "awarewave-wp", siteId: "site-awc", externalId: "57" });
  });

  it("a legacy wp-handoff without key_id still signs in", async () => {
    // the plugin before 1.1.0 sends no key_id: it is aware-wave.com, on AUTH_WP_HANDOFF_SECRET as before 4c-2
    const { d } = deps();
    await expect(call(req(), d)).resolves.toMatchObject({ ok: true });
    expect(d.site).toHaveBeenCalledWith(d.db, "aware-wave-com");
    // a key id no active site has is a source that is off, and one that is not a key id is malformed
    await expect(call(req({ key_id: "shop-x", nonce: "n-d-0123456789abcdef" }), d)).resolves.toMatchObject({ status: 404, error: "source_disabled" });
    await expect(call(req({ key_id: "Not A Key", nonce: "n-e-0123456789abcdef" }), d)).resolves.toMatchObject({ status: 400, error: "invalid_key_id" });
  });

  it("a seller's member opens only a door that takes customer-wp sign-ins", async () => {
    const { d } = deps();
    const social = req({ key_id: "shop-b", product_key: "social" });
    await expect(call(social, d, signShop(social))).resolves.toMatchObject({ ok: true });
    expect(d.find).toHaveBeenCalledWith(d.db, { provider: "customer-wp", siteId: "site-shop", externalId: "57" });
    // tarot lists only "local": the seller's member is refused there, signature and all
    const tarot = req({ key_id: "shop-b", nonce: "n-f-0123456789abcdef" });
    await expect(call(tarot, d, signShop(tarot))).resolves.toMatchObject({ status: 403, error: "login_source_not_allowed" });
    // aware-wave.com's HMAC key never signs for the seller's site
    const forged = req({ key_id: "shop-b", product_key: "social", nonce: "n-g-0123456789abcdef" });
    await expect(call(forged, d, signHandoff(forged, SECRET))).resolves.toMatchObject({ status: 401, error: "invalid_signature" });
  });

  it("is off until its own secret is set", async () => {
    const { d } = deps();
    await expect(call(req(), d, signHandoff(req(), SECRET), {})).resolves.toMatchObject({ status: 404, error: "source_disabled" });
    await expect(call(req(), d, signHandoff(req(), "short"), { AUTH_WP_HANDOFF_SECRET: "short" })).resolves.toMatchObject({ status: 404 });
  });

  it("a forged or edited request is refused before any account is looked up", async () => {
    const { d } = deps();
    for (const sig of [null, "", signHandoff(req(), SECRET + "x"), signHandoff(req({ wp_user_id: 58 }), SECRET)]) {
      await expect(call(req(), d, sig)).resolves.toMatchObject({ status: 401, error: "invalid_signature" });
    }
    expect(d.find).not.toHaveBeenCalled();
  });

  it("a stale timestamp is refused", async () => {
    const { d } = deps();
    for (const ts of [NOW - 61, NOW + 61, "x", undefined]) {
      await expect(call(req({ ts }), d)).resolves.toMatchObject({ status: 401, error: "stale_request" });
    }
    expect(d.find).not.toHaveBeenCalled();
  });

  it("a replayed nonce is refused", async () => {
    const { d } = deps();
    await expect(call(req(), d)).resolves.toMatchObject({ ok: true });
    await expect(call(req(), d)).resolves.toMatchObject({ status: 401, error: "replayed_request" });
    await expect(call(req({ nonce: "n-other-0123456789ab" }), d)).resolves.toMatchObject({ ok: true });
  });

  it("the workspace (product_key portal) opens the portal launcher for an aware-wave.com member, held products or not", async () => {
    const { d, generateLink } = deps({ holds: false });
    await expect(call(req({ product_key: "portal" }), d)).resolves.toEqual({ ok: true, url: "https://portal.aware-wave.com/login/wp#token_hash=tok%2F%2B%3D&type=recovery&uid=user-1" });
    expect(d.holds).not.toHaveBeenCalled();
    expect(generateLink).toHaveBeenCalledTimes(1);
    // a seller's member has no workspace here: they buy from the seller
    const shop = req({ key_id: "shop-b", product_key: "portal", nonce: "n-w-0123456789abcdef" });
    await expect(call(shop, d, signShop(shop))).resolves.toMatchObject({ status: 403, error: "login_source_not_allowed" });
    // the account checks still apply: no billing account, unverified email
    await expect(call(req({ product_key: "portal", nonce: "n-x-0123456789abcdef" }), deps({ account: null }).d)).resolves.toMatchObject({ status: 404, error: "not_a_member" });
    await expect(call(req({ product_key: "portal", nonce: "n-y-0123456789abcdef" }), deps({ confirmed: null }).d)).resolves.toMatchObject({ status: 403, error: "email_unverified" });
  });

  it("a handoff for a product the account does not hold is refused", async () => {
    const { d, generateLink } = deps({ holds: false });
    await expect(call(req(), d)).resolves.toMatchObject({ status: 403, error: "product_not_held" });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("a member with no billing account, an unknown or closed door, or a malformed body gets no link", async () => {
    const none = deps({ account: null });
    await expect(call(req(), none.d)).resolves.toMatchObject({ status: 404, error: "not_a_member" });
    const { d, generateLink } = deps();
    await expect(call(req({ product_key: "nope", nonce: "n-a-0123456789abcdef" }), d)).resolves.toMatchObject({ status: 400, error: "unknown_product" });
    await expect(call(req({ wp_user_id: 0, nonce: "n-b-0123456789abcdef" }), d)).resolves.toMatchObject({ status: 400 });
    await expect(call(req({ nonce: "short" }), d)).resolves.toMatchObject({ status: 400, error: "invalid_nonce" });
    await expect(call("[]", d)).resolves.toMatchObject({ status: 400, error: "invalid_json" });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("a link that resolved another account (email changed in between) is not handed out", async () => {
    const { d } = deps({ linkUser: "someone-else" });
    await expect(call(req(), d)).resolves.toMatchObject({ status: 503, error: "link_failed" });
    const gone = deps({ email: null });
    await expect(call(req({ nonce: "n-c-0123456789abcdef" }), gone.d)).resolves.toMatchObject({ status: 503, error: "auth_lookup_failed" });
  });

  it("an account whose email was never proven gets no link: the first entry is the mailed set-password link", async () => {
    const { d, generateLink } = deps({ confirmed: null });
    await expect(call(req(), d)).resolves.toMatchObject({ status: 403, error: "email_unverified" });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("an account that is no longer this organization's client gets no link", async () => {
    for (const meta of [{ user_kind: "staff", org_id: ACCOUNT.organizationId }, { user_kind: "client", org_id: "org-2" }, {}]) {
      resetHandoffNonces();
      const { d, generateLink } = deps({ meta });
      await expect(call(req(), d)).resolves.toMatchObject({ status: 403, error: "not_this_account" });
      expect(generateLink).not.toHaveBeenCalled();
    }
  });

  it("the door page reads only a recovery token from the fragment", () => {
    expect(readWpToken("#token_hash=abc&type=recovery")).toBe("abc");
    expect(readWpToken("#token_hash=abc&type=magiclink")).toBeNull();
    expect(readWpToken("")).toBeNull();
  });
});

// ---------- POST /api/auth/wp-summary (blueprint §2A.4, ADR 021 G13) ----------
const BILLING: BillingAccount = {
  organization_id: "org-1", name: "Soulful Expression", slug: "soulful", kind: "customer", all_features: null,
  balance: 1240, hold: null,
  contracts: [{ id: "c1", product_key: "content", plan_key: "p", status: "active", started_at: "2026-10-01", current_period_end: "2026-12-31T00:00:00Z", source_ref: "woo-9" }],
  grants: [{ product_key: "content", source: "contract", source_ref: "woo-9", state: "active", features: 13, ends_at: null },
    { product_key: "social", source: "comp", source_ref: "staff", state: "active", features: 4, ends_at: "2026-12-01T00:00:00Z" }],
  expired_grants: 0,
  ledger: [{ at: "2026-11-20", units: -5, entry_type: "debit", reference_type: "x", reference_id: "r1" }],
  payments: [{ at: "t", provider: "woocommerce", event_id: "evt_secret", kind: "k", result: null }],
};
const sreq = (o: object = {}) => JSON.stringify({ wp_user_id: 57, ts: NOW, nonce: "s-0123456789abcdef", ...o });
const door = (k: string) => servedNextAdminProducts().find((p) => p.key === k)!;
type Row = { feature_key: string; source: string; limits: Record<string, unknown> | null };
// content: a subscription, the last two features charged to the wallet; social: a gift of every feature
const ROWS: Record<string, Row[]> = {
  content: door("content").features.map((f, i, all) => ({ feature_key: f.feature_key, source: "contract", limits: i >= all.length - 2 ? { pay: "credits" } : {} })),
  social: door("social").features.map((f) => ({ feature_key: f.feature_key, source: "comp", limits: {} })),
};
function sdeps(over: { billing?: BillingAccount | null; account?: typeof ACCOUNT | null; confirmed?: string | null; held?: string[]; rows?: Record<string, Row[]> } = {}) {
  const { d } = deps({ account: over.account, confirmed: over.confirmed });
  const s: SummaryDeps = { db: d.db, site: d.site, find: d.find, now: d.now,
    held: vi.fn(async () => (over.held ?? ["content", "social"]).map(door)),
    account: vi.fn(async () => (over.billing === undefined ? BILLING : over.billing)),
    // the store's answer (listActiveEntitlements): per feature, the row pickEntitlementRow picks
    entitlements: vi.fn(async ({ productKeys }: { productKeys: readonly string[] }) => productKeys.flatMap((productKey) => {
      const rows = (over.rows ?? ROWS)[productKey] ?? [];
      return [...new Set(rows.map((r) => r.feature_key))].map((featureKey) => {
        const row = pickEntitlementRow(rows.filter((r) => r.feature_key === featureKey))!;
        return { id: `e-${featureKey}`, organizationId: "org-1", productKey, featureKey, source: row.source, sourceRef: null,
          startsAt: NOW - 100, endsAt: null, status: "active", limits: row.limits ?? {} } as EntitlementRecord;
      });
    })) };
  return s;
}
const scall = (body: string, d: SummaryDeps, sig: string | null = signHandoff(body, SECRET), env: Record<string, string | undefined> = ENV) => wpSummary(body, sig, env, d);
const ok = async (d: SummaryDeps, nonce = "s-0123456789abcdef") => {
  const out = await scall(sreq({ nonce }), d);
  if (out.ok === false) throw new Error(out.error);
  return out;
};

describe("WordPress My Account summary (POST /api/auth/wp-summary)", () => {
  beforeEach(() => resetHandoffNonces());

  it("a member gets the unit, wallet and every member door: held ones with kind, rightLabel's badge, counts and URL", async () => {
    const d = sdeps();
    const out = await ok(d);
    const n = (k: string) => door(k).features.length;
    expect(out.unit).toEqual({ name: "Soulful Expression" });
    expect(out.wallet).toEqual({ balance: 1240, frozen: false });
    expect(out.fetched_at).toBe(new Date(NOW * 1000).toISOString());
    expect(out.products.map((p) => p.key)).toEqual(servedNextAdminProducts().map((p) => p.key));
    const by = (k: string) => out.products.find((p) => p.key === k);
    expect(by("content")).toEqual({ key: "content", name: "內容行銷", can_enter: true, url: "https://content.aware-wave.com/",
      right: { kind: "contract", label: "方案內", until: "2026-12-31T00:00:00Z", counts: { covered: n("content") - 2, gift: 0, credits: 2, locked: 0 } } });
    expect(by("social")).toEqual({ key: "social", name: "社群發文", can_enter: true, url: "https://social.aware-wave.com/",
      right: { kind: "comp", label: "贈送", until: "2026-12-01T00:00:00Z", counts: { covered: 0, gift: n("social"), credits: 0, locked: 0 } } });
    // not held: 未開通, no URL, nothing read for it
    expect(by("video")).toEqual({ key: "video", name: "影片製作", can_enter: false,
      right: { kind: "none", label: "未開通", counts: { covered: 0, gift: 0, credits: 0, locked: n("video") } } });
    // one store read for every held product
    expect(d.entitlements).toHaveBeenCalledTimes(1);
    expect(d.entitlements).toHaveBeenCalledWith({ organizationId: "org-1", productKeys: ["content", "social"], now: NOW });
    // the held list is the app's entitlements of the member's own unit, never WooCommerce orders
    expect(d.held).toHaveBeenCalledWith("org-1", undefined, NOW);
  });

  it("kind from the real source: trial, a credit pack alone, a contract row without a subscription, missing rows locked", async () => {
    const trial = await ok(sdeps({ held: ["content"], billing: { ...BILLING, contracts: [{ ...BILLING.contracts[0], status: "trial" }] } }), "s-t-0123456789abcdef");
    expect(trial.products.find((p) => p.key === "content")!.right).toMatchObject({ kind: "trial", label: "試用中" });
    const noSub = { ...BILLING, contracts: [], grants: [] };
    const pack = await ok(sdeps({ held: ["tarot"], billing: noSub, rows: { tarot: [{ feature_key: door("tarot").features[0].feature_key, source: "contract", limits: { pay: "credits" } }] } }), "s-k-0123456789abcdef");
    const tarot = pack.products.find((p) => p.key === "tarot")!;
    expect(tarot.right).toEqual({ kind: "credits", label: "扣點", counts: { covered: 0, gift: 0, credits: 1, locked: door("tarot").features.length - 1 } });
    const staff = await ok(sdeps({ held: ["social"], billing: noSub, rows: { social: [{ feature_key: door("social").features[0].feature_key, source: "contract", limits: {} }] } }), "s-c-0123456789abcdef");
    expect(staff.products.find((p) => p.key === "social")!.right).toMatchObject({ kind: "contract", label: "方案內", counts: { covered: 1 } });
    // label null only when the door is held and no row of it is one can() accepts (a refused pay marker)
    const bad = await ok(sdeps({ held: ["social"], billing: noSub, rows: { social: [{ feature_key: door("social").features[0].feature_key, source: "comp", limits: { pay: "credits" } }] } }), "s-m-0123456789abcdef");
    expect(bad.products.find((p) => p.key === "social")!.right).toEqual({ kind: "none", label: null, counts: { covered: 0, gift: 0, credits: 0, locked: door("social").features.length } });
  });

  it("answers only for the member's own unit: no other unit, no parent, no payment events or provider", async () => {
    const d = sdeps();
    const text = JSON.stringify(await scall(sreq(), d));
    expect(d.account).toHaveBeenCalledTimes(1);
    expect(d.account).toHaveBeenCalledWith("org-1", d.db);
    expect(d.held).toHaveBeenCalledTimes(1);
    for (const leak of ["org-1", "woocommerce", "evt_secret", "woo-9", "provider", "payments", "ledger", "soulful"]) expect(text).not.toContain(leak);
    // a brand (child org): billing_account answers with its root -- the root's name and wallet are not this member's to see
    const brand = sdeps({ billing: { ...BILLING, organization_id: "org-root", name: "Parent Co" } });
    await expect(scall(sreq({ nonce: "s-b-0123456789abcdef" }), brand)).resolves.toEqual({ ok: false, status: 403, error: "brand_unit_unsupported" });
    expect(brand.held).not.toHaveBeenCalled();
  });

  it("not_a_member: no billing identity for this WordPress user", async () => {
    const d = sdeps({ account: null });
    await expect(scall(sreq(), d)).resolves.toEqual({ ok: false, status: 404, error: "not_a_member" });
    expect(d.account).not.toHaveBeenCalled();
  });

  it("email_unverified: an email never proven gets nothing", async () => {
    const d = sdeps({ confirmed: null });
    await expect(scall(sreq(), d)).resolves.toEqual({ ok: false, status: 403, error: "email_unverified" });
    expect(d.account).not.toHaveBeenCalled();
  });

  it("source_disabled while the key is unset, empty, blank or short -- production today; never 'no key, no check'", async () => {
    for (const env of [{}, { AUTH_WP_HANDOFF_SECRET: "" }, { AUTH_WP_HANDOFF_SECRET: " ".repeat(40) }, { AUTH_WP_HANDOFF_SECRET: "short" }]) {
      const d = sdeps();
      for (const sig of [null, "", signHandoff(sreq(), "")]) {
        await expect(scall(sreq(), d, sig, env)).resolves.toEqual({ ok: false, status: 404, error: "source_disabled" });
      }
      expect(d.find).not.toHaveBeenCalled();
      // without key_id (aware-wave.com) nothing at all is read before the 404: not even the seller_sites row
      expect(d.site).not.toHaveBeenCalled();
    }
  });

  it("invalid_signature: forged, edited, another key, or another seller site's key", async () => {
    const d = sdeps();
    for (const sig of [null, "", signHandoff(sreq(), SECRET + "x"), signHandoff(sreq({ wp_user_id: 58 }), SECRET), signShop(sreq())]) {
      await expect(scall(sreq(), d, sig)).resolves.toEqual({ ok: false, status: 401, error: "invalid_signature" });
    }
    expect(d.find).not.toHaveBeenCalled();
    // a seller site signing with its own key is refused: the summary is aware-wave.com's only
    const shop = sreq({ key_id: "shop-b", nonce: "s-s-0123456789abcdef" });
    await expect(scall(shop, d, signShop(shop))).resolves.toEqual({ ok: false, status: 403, error: "login_source_not_allowed" });
    expect(d.find).not.toHaveBeenCalled();
  });

  it("stale_request: ts more than 60 s either way, or not a number", async () => {
    const d = sdeps();
    for (const ts of [NOW - 61, NOW + 61, String(NOW), undefined]) {
      await expect(scall(sreq({ ts }), d)).resolves.toEqual({ ok: false, status: 401, error: "stale_request" });
    }
    await expect(scall(sreq({ ts: NOW - 60 }), d)).resolves.toMatchObject({ ok: true });
  });

  it("replayed_request: a nonce once, shared with wp-handoff; a hand-off body is not a summary request", async () => {
    const d = sdeps();
    await expect(scall(sreq(), d)).resolves.toMatchObject({ ok: true });
    await expect(scall(sreq(), d)).resolves.toEqual({ ok: false, status: 401, error: "replayed_request" });
    // a nonce spent on a hand-off cannot be spent again here
    const { d: hd } = deps();
    await expect(call(req({ nonce: "s-h-0123456789abcdef" }), hd)).resolves.toMatchObject({ ok: true });
    await expect(scall(sreq({ nonce: "s-h-0123456789abcdef" }), d)).resolves.toEqual({ ok: false, status: 401, error: "replayed_request" });
    // a signed hand-off body replayed at the summary is refused
    await expect(scall(req({ nonce: "s-p-0123456789abcdef" }), d)).resolves.toEqual({ ok: false, status: 400, error: "unexpected_product_key" });
  });

  it("productRight: trial, lapsing and unknown sources come from the account, nothing guessed", () => {
    const acc = (o: Partial<BillingAccount>): BillingAccount => ({ ...BILLING, contracts: [], grants: [], ...o });
    const c = (status: string) => ({ id: "c", product_key: "video", plan_key: "p", status, started_at: null, current_period_end: "2026-12-05", source_ref: null });
    const g = (source: string) => ({ product_key: "video", source, source_ref: null, state: "active", features: 1, ends_at: null });
    expect(productRight(acc({ contracts: [c("trial")] }), "video")).toEqual({ source: "contract", contractStatus: "trial", endsAt: "2026-12-05" });
    expect(productRight(acc({ contracts: [c("canceled")], grants: [g("comp")] }), "video")).toEqual({ source: "comp", contractStatus: null, endsAt: null });
    expect(productRight(acc({ contracts: [c("past_due")] }), "video")).toMatchObject({ source: "contract", contractStatus: "past_due" });
    expect(productRight(acc({ grants: [g("contract")] }), "video")).toEqual({ source: null, contractStatus: null, endsAt: null });
    expect(productRight(acc({ contracts: [c("active")] }), "tarot")).toEqual({ source: null, contractStatus: null, endsAt: null });
  });
});
