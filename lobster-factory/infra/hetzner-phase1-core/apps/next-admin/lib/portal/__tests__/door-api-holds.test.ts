// A customer's API calls on a product door need the product held, like the door page (finding 2026-10-30: an expired
// customer could still call its own org's /api/content/*; /api/tools/studio/mockup checked only the role).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const held = vi.hoisted(() => ({ value: true as boolean | Error, calls: [] as unknown[] }));
vi.mock("@/lib/entitlements/door-holds", () => ({
  holdsProduct: async (args: unknown) => { held.calls.push(args); if (held.value instanceof Error) throw held.value; return held.value; },
}));
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.example");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
const { middleware } = await import("../../../middleware");
const { cacheValidatedRole } = await import("@/lib/supabase/session-cache");
const { forgetDoorAccess } = await import("../door-access");
afterAll(() => vi.unstubAllEnvs());

const cookie = "sb-x-auth-token";
function call(host: string, path: string, token: string, userKind: "client" | "staff") {
  cacheValidatedRole(`${cookie}=${token}`, { role: "viewer", userKind, orgId: "org-1", userId: "u-1", tools: null } as never);
  return middleware(new NextRequest(`https://${host}${path}`, { method: "POST", headers: { host, cookie: `${cookie}=${token}`, "sec-fetch-site": "same-origin" } }));
}

describe("product door APIs ask whether the customer holds the product", () => {
  beforeEach(() => { held.value = true; held.calls = []; forgetDoorAccess(); });

  it("a customer who no longer holds content gets 403 from /api/content/*, asked for its own org", async () => {
    held.value = false;
    const res = await call("content.aware-wave.com", "/api/content/trending?type=trending", "t1", "client");
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "product_not_held" });
    expect(held.calls).toEqual([expect.objectContaining({ organizationId: "org-1", productKey: "content" })]);
  });

  it("the studio door's mockup API asks for studio; a holder passes", async () => {
    const res = await call("studio.aware-wave.com", "/api/tools/studio/mockup", "t2", "client");
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(held.calls).toEqual([expect.objectContaining({ productKey: "studio" })]);
  });

  it("a failed lookup does not open the API; staff are not looked up", async () => {
    held.value = new Error("db down");
    expect((await call("studio.aware-wave.com", "/api/tools/studio/mockup", "t3", "client")).status).toBe(503);
    held.calls = [];
    forgetDoorAccess();
    expect((await call("studio.aware-wave.com", "/api/tools/studio/mockup", "t4", "staff")).headers.get("x-middleware-next")).toBe("1");
    expect(held.calls).toEqual([]);
  });
});
