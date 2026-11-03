// nginx auth_request target for video-workbench (P6 D2): every deny path, and the identity headers it hands nginx.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const INTERNAL = "44444444-4444-4444-8444-444444444444";
const rows: Record<string, { id: string; parent_organization_id: string | null; kind: string }> = {
  [ORG]: { id: ORG, parent_organization_id: null, kind: "customer" },
  [CHILD]: { id: CHILD, parent_organization_id: ORG, kind: "customer" },
  [OTHER]: { id: OTHER, parent_organization_id: null, kind: "customer" },
  [INTERNAL]: { id: INTERNAL, parent_organization_id: null, kind: "internal" },
};
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => {
    let col = ""; let val = "";
    const q = { select: () => q, limit: () => q, eq: (c: string, v: string) => { col = c; val = v; return q; },
      maybeSingle: async () => ({ data: col === "kind" ? rows[INTERNAL] : rows[val] ?? null, error: null }) };
    return q;
  } }),
}));
import { GET } from "./route";
import { resetSubjectCache } from "@/lib/entitlements/subject";

const at = "https://video.aware-wave.com/api/video/workbench/session";
const call = (headers: Record<string, string>) => GET(new Request(at, { headers }));
const client = (org: string | null, extra: Record<string, string> = {}) => ({ "x-ops-user-kind": "client", "x-ops-user-id": "u-client", ...(org ? { "x-ops-org-id": org } : {}), ...extra });
const staff = (role: string, extra: Record<string, string> = {}) => ({ "x-ops-user-kind": "staff", "x-ops-claims-role": role, "x-ops-user-id": "u-staff", ...extra });
beforeEach(() => resetSubjectCache());

describe("GET /api/video/workbench/session", () => {
  it("denies a request the session gate did not mark: no user id, or no user kind", async () => {
    expect((await call({})).status).toBe(401);
    expect((await call({ "x-ops-user-kind": "staff", "x-ops-claims-role": "owner" })).status).toBe(401);
    expect((await call({ "x-ops-user-id": "u", "x-ops-claims-role": "owner" })).status).toBe(401);
  });

  it("denies staff below operator, and a customer with no organization binding", async () => {
    expect((await call(staff("viewer"))).status).toBe(403);
    expect((await call(client(null))).status).toBe(403);
  });

  it("a customer cannot name another organization, and a malformed X-VW-Org is refused", async () => {
    expect((await call(client(CHILD, { "x-vw-org": OTHER }))).status).toBe(403);
    expect((await call(staff("owner", { "x-vw-org": "../etc" }))).status).toBe(403);
  });

  it("an organization that does not exist is refused", async () => {
    expect((await call(staff("owner", { "x-vw-org": "55555555-5555-4555-8555-555555555555" }))).status).toBe(403);
  });

  it("a customer gets its own organization, billed to the root account", async () => {
    const res = await call(client(CHILD));
    expect(res.status).toBe(204);
    expect(res.headers.get("x-vw-user-id")).toBe("u-client");
    expect(res.headers.get("x-vw-org-id")).toBe(CHILD);
    expect(res.headers.get("x-vw-billing-org-id")).toBe(ORG);
    expect(res.headers.get("x-vw-user-kind")).toBe("client");
  });

  it("staff choose any organization; none named = the internal account", async () => {
    const chosen = await call(staff("operator", { "x-vw-org": OTHER }));
    expect([chosen.status, chosen.headers.get("x-vw-org-id"), chosen.headers.get("x-vw-role")]).toEqual([204, OTHER, "operator"]);
    const none = await call(staff("owner"));
    expect([none.status, none.headers.get("x-vw-org-id"), none.headers.get("x-vw-billing-org-id")]).toEqual([204, INTERNAL, INTERNAL]);
  });
});
