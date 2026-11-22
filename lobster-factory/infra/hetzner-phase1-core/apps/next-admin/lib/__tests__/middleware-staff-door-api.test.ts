// Staff on a product door search clients through the same /api/ops/org-search as on the staff host (card U4, ADR 020):
// doors.ts STAFF_DOOR_APIS lets the path past the door's routing, and the identity checks after it decide. A customer
// is refused twice (middleware 403, the route's own staffOnly); every other staff API on a product door is still 404.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const user = vi.hoisted(() => ({ current: null as null | { id: string; app_metadata: Record<string, unknown> } }));
vi.mock("@/lib/supabase/ssr", () => ({
  isSupabaseAuthConfigured: () => true,
  createSupabaseMiddlewareClient: () => ({
    supabase: { auth: { getUser: async () => (user.current ? { data: { user: user.current }, error: null } : { data: { user: null }, error: { status: 401 } }) } },
    refreshedCookies: [],
  }),
}));
// the route's own database: never reached by a refused caller
vi.mock("@/lib/supabase-server", async (orig) => ({ ...(await orig<typeof import("@/lib/supabase-server")>()), getSupabaseServerClient: () => null }));

import { middleware } from "../../middleware";
import { GET } from "../../app/api/ops/org-search/route";

const DOOR = "content.aware-wave.com";
const SEARCH = "/api/ops/org-search";
let n = 0;
function as(meta: Record<string, unknown>) { user.current = { id: `u-${++n}`, app_metadata: { user_kind: "staff", ...meta } }; return `sb-test-auth-token=${n}`; }
const call = (path: string, cookie?: string) =>
  middleware(new NextRequest(`https://${DOOR}${path}`, { headers: { host: DOOR, ...(cookie ? { cookie } : {}) } }));
const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); user.current = null; });
afterEach(() => { warn.mockRestore(); vi.unstubAllEnvs(); });

describe("GET /api/ops/org-search on a product door", () => {
  it("a customer is refused with 403 forbidden", async () => {
    const res = await call(SEARCH, as({ ops_role: "owner", user_kind: "client", org_id: "11111111-1111-4111-8111-111111111111" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("no session is 401", async () => {
    const res = await call(SEARCH);
    expect(res.status).toBe(401);
  });

  it("the owner passes, carrying a staff identity", async () => {
    vi.stubEnv("STAFF_TOOLS_MODE", "enforce");
    const res = await call(SEARCH, as({ ops_role: "owner", staff_tools: [] }));
    expect(passed(res)).toBe(true);
    expect(res.headers.get("x-middleware-request-x-ops-user-kind")).toBe("staff");
  });

  it("enforce: a staff member without a cell that owns it is 403 tool_not_granted; with one, passes", async () => {
    vi.stubEnv("STAFF_TOOLS_MODE", "enforce");
    const res = await call(SEARCH, as({ ops_role: "operator", staff_tools: ["social"] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("tool_not_granted");
    expect(passed(await call(SEARCH, as({ ops_role: "operator", staff_tools: ["content"] })))).toBe(true);
  });

  it("only that exact path: other staff APIs and paths below it stay 404 on the door, even for the owner", async () => {
    const owner = as({ ops_role: "owner" });
    for (const p of ["/api/ops/clients", "/api/ops/staff", `${SEARCH}/x`, `${SEARCH}x`]) expect((await call(p, owner)).status, p).toBe(404);
  });
});

describe("GET /api/ops/org-search called directly", () => {
  it("a customer identity is 403 even with a role that passes the role check", async () => {
    const res = await GET(new Request(`https://${DOOR}${SEARCH}`, { headers: { "x-ops-user-kind": "client", "x-ops-org-id": "o1", "x-ops-claims-role": "operator" } }));
    expect(res.status).toBe(403);
  });

  it("staff with the same role reach the route's own checks", async () => {
    const res = await GET(new Request(`https://${DOOR}${SEARCH}`, { headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" } }));
    expect(res.status).toBe(503);   // past the guards; the mocked database is not configured
  });
});
