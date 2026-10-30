import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  held: true,
  holdsFail: false,
  mint: { ok: true, url: "https://tarot.aware-wave.com/login/wp#token_hash=t&type=recovery&next=%2Fworks" } as { ok: boolean; url?: string; status?: number; error?: string },
  db: {} as object | null,
}));
const mint = vi.hoisted(() => vi.fn());
const holds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/entitlements/door-holds", () => ({ holdsProduct: holds }));
vi.mock("@/lib/auth/door-link", () => ({ mintDoorLink: mint }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => state.db }));

import { POST } from "../route";

const CLIENT = { "x-ops-user-kind": "client", "x-ops-org-id": "org-1", "x-ops-user-id": "user-1" };
const post = (fields: Record<string, string>, headers: Record<string, string> = CLIENT) =>
  POST(new Request("https://portal.aware-wave.com/portal/api/door", { method: "POST", headers, body: new URLSearchParams(fields) }));
const location = (res: Response) => res.headers.get("location");

describe("POST /portal/api/door (launcher 開啟 / 我的作品 -> one-time sign-in into the door)", () => {
  beforeEach(() => {
    state.held = true; state.holdsFail = false; state.db = {};
    state.mint = { ok: true, url: "https://tarot.aware-wave.com/login/wp#token_hash=t&type=recovery&next=%2Fworks" };
    mint.mockReset().mockImplementation(async () => state.mint);
    holds.mockReset().mockImplementation(async () => { if (state.holdsFail) throw new Error("db down"); return state.held; });
  });

  it("a held product with a works page: 303 to the door's /login/wp carrying next", async () => {
    const res = await post({ product_key: "tarot", next: "/works" });
    expect(res.status).toBe(303);
    expect(location(res)).toContain("https://tarot.aware-wave.com/login/wp#");
    expect(location(res)).toContain("&next=%2Fworks");
    expect(mint).toHaveBeenCalledWith(state.db, { userId: "user-1", organizationId: "org-1" }, "tarot.aware-wave.com", "/works");
    expect(holds).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", productKey: "tarot" }));
  });

  it.each(["https://evil", "//evil.com", "/works/../x", "/not-in-the-menu", ""])("next=%j is not on the door's menu: minted with /", async (next) => {
    await post({ product_key: "tarot", next });
    expect(mint.mock.calls[0][3]).toBe("/");
  });

  it("no next -> minted with /", async () => {
    await post({ product_key: "tarot" });
    expect(mint.mock.calls[0][3]).toBe("/");
  });

  it("a product the organization does not hold -> 303 back to the launcher, nothing minted", async () => {
    state.held = false;
    const res = await post({ product_key: "tarot", next: "/works" });
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/portal/launcher?door=product_not_held");
    expect(mint).not.toHaveBeenCalled();
  });

  it("an unknown or missing product_key -> ?door=unknown_product", async () => {
    expect(location(await post({ product_key: "nope" }))).toBe("/portal/launcher?door=unknown_product");
    expect(location(await post({}))).toBe("/portal/launcher?door=unknown_product");
    expect(mint).not.toHaveBeenCalled();
  });

  it("staff headers, no kind, or no user id -> ?door=not_a_client, nothing minted", async () => {
    for (const headers of [{ ...CLIENT, "x-ops-user-kind": "staff" }, { "x-ops-org-id": "org-1", "x-ops-user-id": "user-1" }, { "x-ops-user-kind": "client", "x-ops-org-id": "org-1" }]) {
      const res = await post({ product_key: "tarot" }, headers);
      expect(res.status).toBe(303);
      expect(location(res)).toBe("/portal/launcher?door=not_a_client");
    }
    expect(mint).not.toHaveBeenCalled();
  });

  it("mintDoorLink refusing -> 303 back with its error code", async () => {
    state.mint = { ok: false, status: 403, error: "email_unverified" };
    const res = await post({ product_key: "tarot" });
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/portal/launcher?door=email_unverified");
  });

  it("entitlement read failing or no database client -> ?door=auth_unavailable, nothing minted", async () => {
    state.holdsFail = true;
    expect(location(await post({ product_key: "tarot" }))).toBe("/portal/launcher?door=auth_unavailable");
    state.holdsFail = false; state.db = null;
    expect(location(await post({ product_key: "tarot" }))).toBe("/portal/launcher?door=auth_unavailable");
    expect(mint).not.toHaveBeenCalled();
  });
});
