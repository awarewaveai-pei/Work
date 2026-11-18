import { beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const MISSING = "44444444-4444-4444-8444-444444444444";
const dbState = vi.hoisted(() => ({ active: true, brokenRoot: false }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({ from: () => {
  const filters: Record<string, string> = {};
  const q = { select: () => q, limit: () => q, eq: (key: string, value: string) => { filters[key] = value; return q; },
    maybeSingle: async () => {
      const id = filters.id;
      const exists = [ROOT, CHILD, OTHER].includes(id) && !(dbState.brokenRoot && id === ROOT);
      return { error: null, data: exists && (!filters.status || dbState.active)
        ? { id, parent_organization_id: id === CHILD ? ROOT : null, kind: "customer" } : null };
    } };
  return q;
} }) }));
import { POST } from "./route";
import { resetSubjectCache } from "@/lib/entitlements/subject";

const at = "https://video.aware-wave.com/api/video/workbench/organization";
const staff = { "x-ops-user-kind": "staff", "x-ops-user-id": "staff", "x-ops-claims-role": "operator" };
const client = { "x-ops-user-kind": "client", "x-ops-user-id": "client", "x-ops-org-id": CHILD };
const call = (organizationId: string, headers: Record<string, string> = staff) => POST(new Request(at, {
  method: "POST", headers: { origin: new URL(at).origin, "content-type": "application/json", ...headers }, body: JSON.stringify({ organizationId }),
}));
beforeEach(() => { resetSubjectCache(); dbState.active = true; dbState.brokenRoot = false; vi.stubEnv("VW_INTERNAL_TOKEN", "test-token"); });

describe("POST /api/video/workbench/organization", () => {
  it("replaces a staff selection only after the existing authorization and billing checks", async () => {
    const res = await call(CHILD, { ...staff, cookie: `__Host-vw-organization=${OTHER}`, "x-vw-org": OTHER });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, organizationId: CHILD });
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`__Host-vw-organization=${CHILD}`);
    for (const attribute of ["HttpOnly", "Secure", "SameSite=strict", "Path=/"]) expect(cookie).toContain(attribute);
    expect(cookie.toLowerCase()).not.toContain("domain=");
  });

  it("rejects untrusted origins, including same-site sibling hosts and missing positive origin evidence", async () => {
    for (const headers of [{ origin: "https://evil.example" }, { origin: "https://app.aware-wave.com" }, { "sec-fetch-site": "same-site" }, { origin: "null" }]) {
      expect((await call(CHILD, { ...staff, ...headers })).status).toBe(403);
    }
    const missing = await POST(new Request(at, { method: "POST", headers: staff, body: JSON.stringify({ organizationId: CHILD }) }));
    expect(missing.status).toBe(403);
    expect((await call(CHILD, { ...staff, "sec-fetch-site": "same-origin" })).status).toBe(200);
  });

  it("client can select only its own account, regardless of the old cookie", async () => {
    expect((await call(CHILD, { ...client, cookie: `__Host-vw-organization=${OTHER}` })).status).toBe(200);
    const forbidden = await call(OTHER, client);
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("set-cookie")).toBeNull();
  });

  it("refuses unauthenticated, low-role, malformed, nonexistent and inactive selections", async () => {
    expect((await call(CHILD, {})).status).toBe(401);
    expect((await call(CHILD, { ...staff, "x-ops-claims-role": "viewer" })).status).toBe(403);
    expect((await call("../oops")).status).toBe(400);
    expect((await call(MISSING)).status).toBe(403);
    dbState.active = false;
    const inactive = await call(CHILD);
    expect(inactive.status).toBe(403);
    expect(inactive.headers.get("set-cookie")).toBeNull();
  });

  it("never sets a cookie when the root billing organization is unavailable", async () => {
    dbState.brokenRoot = true;
    const res = await call(CHILD);
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
