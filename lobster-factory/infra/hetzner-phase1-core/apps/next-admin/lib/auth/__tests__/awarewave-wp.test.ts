import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetHandoffNonces, signHandoff, wpHandoff, type HandoffDeps } from "../sources/awarewave-wp";
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
