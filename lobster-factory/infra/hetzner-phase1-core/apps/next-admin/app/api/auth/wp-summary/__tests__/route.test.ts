import { afterEach, describe, expect, it, vi } from "vitest";
import type { SellerSite } from "@/lib/payments/sites";

// Production today (G8): aware-wave.com's seller_sites row disabled and AUTH_WP_HANDOFF_SECRET empty.
const site = vi.hoisted(() => ({ status: "disabled" as SellerSite["status"] }));
const find = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/entitlements/identities", () => ({ findBillingAccount: find }));
vi.mock("@/lib/payments/sites", async (orig) => ({
  ...(await orig<typeof import("@/lib/payments/sites")>()),
  findSiteByKeyId: async () => ({ id: "site-awc", host: "aware-wave.com", keyId: "aware-wave-com", sellerOrganizationId: "org-internal",
    sellerKind: "internal", verifyAlg: "hmac-env", publicKey: null, envVar: "PAYMENTS_WOO_SECRET", handoffPublicKey: null,
    handoffEnvVar: "AUTH_WP_HANDOFF_SECRET", status: site.status }),
}));

import { POST } from "../route";
import { signHandoff } from "@/lib/auth/sources/awarewave-wp";

const SECRET = "wp-summary-route-secret-0123456789abcdef";
const post = (raw: string, sig: string | null) =>
  POST(new Request("https://app.aware-wave.com/api/auth/wp-summary", { method: "POST", body: raw,
    headers: sig === null ? {} : { "x-awarewave-handoff-signature": sig } }));
const body = (nonce: string) => JSON.stringify({ wp_user_id: 57, ts: Math.floor(Date.now() / 1000), nonce });

describe("POST /api/auth/wp-summary", () => {
  afterEach(() => { vi.unstubAllEnvs(); site.status = "disabled"; find.mockReset(); });

  it("is off by default: no key -> 404 source_disabled, signed or not, and no member is looked up", async () => {
    vi.stubEnv("AUTH_WP_HANDOFF_SECRET", "");
    for (const sig of [null, "", signHandoff(body("r-0123456789abcdef"), "")]) {
      const res = await post(body("r-0123456789abcdef"), sig);
      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ ok: false, error: "source_disabled" });
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("key set but the site still disabled: 403 site_disabled, nothing read", async () => {
    vi.stubEnv("AUTH_WP_HANDOFF_SECRET", SECRET);
    const raw = body("r-1-0123456789abcdef");
    const res = await post(raw, signHandoff(raw, SECRET));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "site_disabled" });
    expect(find).not.toHaveBeenCalled();
  });

  it("a read failure is 503 unavailable, never a partial answer", async () => {
    vi.stubEnv("AUTH_WP_HANDOFF_SECRET", SECRET);
    site.status = "active";
    find.mockRejectedValue(new Error("db down"));
    const raw = body("r-2-0123456789abcdef");
    const res = await post(raw, signHandoff(raw, SECRET));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "unavailable" });
  });
});
