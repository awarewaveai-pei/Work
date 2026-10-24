import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetHandoffNonces, signHandoff, wpHandoff, type HandoffDeps } from "../sources/awarewave-wp";
import { readWpToken } from "@/app/login/wp/WpSignIn";

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
    find: vi.fn(async () => (over.account === undefined ? ACCOUNT : over.account)),
    holds: vi.fn(async () => over.holds ?? true),
    now: () => NOW,
  };
  return { d, generateLink };
}
const call = (body: string, d: HandoffDeps, sig: string | null = signHandoff(body, SECRET), env: Record<string, string | undefined> = ENV) => wpHandoff(body, sig, env, d);

describe("WordPress one-time sign-in into a product door (ADR 015 order 1, 4b-4)", () => {
  beforeEach(() => resetHandoffNonces());

  it("a member holding the product gets a one-time recovery link on that product's door", async () => {
    const { d, generateLink } = deps();
    await expect(call(req(), d)).resolves.toEqual({ ok: true, url: "https://tarot.aware-wave.com/login/wp#token_hash=tok%2F%2B%3D&type=recovery" });
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "a@b.tw" });
    expect(d.find).toHaveBeenCalledWith(d.db, { provider: "awarewave-wp", externalId: "57" });
  });

  it("is off until its own secret is set", async () => {
    const { d } = deps();
    await expect(call(req(), d, signHandoff(req(), SECRET), {})).resolves.toMatchObject({ status: 404, error: "source_disabled" });
    await expect(call(req(), d, signHandoff(req(), "short"), { AUTH_WP_HANDOFF_SECRET: "short" })).resolves.toMatchObject({ status: 404 });
  });

  it("a forged or edited request is refused before anything is looked up", async () => {
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
