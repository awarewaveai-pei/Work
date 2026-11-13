// /api/social/prefs (a person's display zone, on their profiles row) and the zone check on the one org-zone write path.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rows: new Map<string, { metadata: unknown }>(), updates: [] as Array<{ id: string; patch: Record<string, unknown> }>, orgUpdates: 0, orgPatch: null as unknown, logs: [] as unknown[], members: new Map<string, string>() }));
vi.mock("@/lib/supabase-server", () => {
  const profiles = () => {
    let id = "";
    let patch: Record<string, unknown> | null = null;
    const q = {
      select: () => q,
      update: (p: Record<string, unknown>) => { patch = p; return q; },
      eq: (_c: string, v: string) => {
        id = v;
        if (patch) { m.updates.push({ id, patch }); m.rows.set(id, { metadata: patch.metadata }); return Promise.resolve({ error: null }); }
        return q;
      },
      maybeSingle: async () => ({ data: m.rows.get(id) ?? null, error: null }),
      in: () => q, order: () => q,
    };
    return q;
  };
  const organizations = () => {
    const row = { id: "o", status: "active", default_locale: "en", default_timezone: "UTC" };
    const q = { select: () => q, eq: () => q, update: (p: unknown) => { m.orgUpdates++; m.orgPatch = p; return q; }, single: async () => ({ data: row, error: null }),
      maybeSingle: async () => ({ data: row, error: null }), then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r), insert: async () => ({}) };
    return q;
  };
  const audit = { insert: async (r: unknown) => { m.logs.push(r); return { error: null }; } };
  const client = { from: (t: string) => (t === "profiles" ? profiles() : t === "social_audit_log" ? audit : t === "organizations" || t === "ops_audit_events" ? organizations() : profiles()) };
  return { getSupabaseWriteClient: () => client, getSupabaseReadClient: () => client, getSupabaseServerClient: () => client };
});
vi.mock("@/lib/social/store", async (orig) => ({ ...(await orig<typeof import("@/lib/social/store")>()), memberRoles: async () => m.members }));

const { GET, PUT } = await import("../prefs/route");
const { PATCH } = await import("../../ops/tenants/[id]/config/route");
const settings = await import("../settings/route");

const USER = "11111111-1111-4111-8111-111111111111";
const STAFF = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator", "x-ops-user-id": USER };
const req = (method: string, body?: unknown, headers: Record<string, string> = STAFF) =>
  new Request("http://localhost/api/social/prefs", { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => { m.rows.clear(); m.updates.length = 0; m.orgUpdates = 0; m.orgPatch = null; m.logs.length = 0; m.members = new Map(); });

describe("/api/social/prefs", () => {
  it("defaults to the organisation's zone; a saved choice comes back and keeps the rest of metadata", async () => {
    m.rows.set(USER, { metadata: { other: 1, social: { kept: true } } });
    expect(await (await GET(req("GET"))).json()).toMatchObject({ displayTz: "org" });
    expect((await PUT(req("PUT", { displayTz: "UTC" }))).status).toBe(200);
    expect(m.updates[0]).toMatchObject({ id: USER, patch: { metadata: { other: 1, social: { kept: true, display_tz: "UTC" } } } });
    expect(await (await GET(req("GET"))).json()).toMatchObject({ displayTz: "UTC" });
  });

  it("refuses a zone that is not one of the buttons, and a request with no signed-in user", async () => {
    m.rows.set(USER, { metadata: {} });
    expect((await PUT(req("PUT", { displayTz: "Mars/Olympus" }))).status).toBe(400);
    expect((await PUT(req("PUT", { displayTz: "UTC" }, { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner" }))).status).toBe(400);
    expect(m.updates).toEqual([]);
  });
});

describe("PATCH /api/ops/tenants/<id>/config -- default_timezone", () => {
  const patch = (defaultTimezone: string) => PATCH(
    new Request("http://localhost/api/ops/tenants/x/config", { method: "PATCH", headers: { "content-type": "application/json", "x-ops-user-kind": "staff", "x-ops-claims-role": "owner" }, body: JSON.stringify({ defaultTimezone }) }),
    { params: Promise.resolve({ id: "39ad4149-5044-4077-8d9a-b6b916de0e21" }) });

  it("an unknown zone is refused before any write", async () => {
    const res = await patch("Taiwan");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_timezone" });
    expect(m.orgUpdates).toBe(0);
  });

  it("a zone that is not a string is a 400, not a 500", async () => {
    expect((await patch(null as unknown as string)).status).toBe(400);
    expect((await patch(8 as unknown as string)).status).toBe(400);
    expect(m.orgUpdates).toBe(0);
  });

  it("Asia/Taipei is written", async () => {
    expect((await patch("Asia/Taipei")).status).toBe(200);
    expect(m.orgUpdates).toBe(1);
  });
});

describe("PUT /api/social/settings { timezone } -- the brand owner sets the organisation's zone", () => {
  const BRAND = "39ad4149-5044-4077-8d9a-b6b916de0e21";
  const put = (timezone: unknown, role = "owner") => settings.PUT(new Request("http://localhost/api/social/settings", {
    method: "PUT", headers: { "content-type": "application/json", "x-ops-user-kind": "staff", "x-ops-claims-role": role, "x-ops-user-id": USER },
    body: JSON.stringify({ brand: BRAND, timezone }) }));

  it("writes organizations.default_timezone and logs from -> to", async () => {
    const res = await put("Asia/Taipei");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ timezone: "Asia/Taipei" });
    expect(m.orgPatch).toEqual({ default_timezone: "Asia/Taipei" });
    expect(m.logs[0]).toMatchObject({ organization_id: BRAND, action: "timezone_setting", detail: { from: "UTC", to: "Asia/Taipei" } });
  });

  it("an unknown zone or a non-owner is refused before any write", async () => {
    expect((await put("Taiwan")).status).toBe(400);
    expect((await put("Asia/Taipei", "operator")).status).toBe(403);
    expect(m.orgUpdates).toBe(0);
  });

  it("a customer made brand owner may not change the organisation's zone (same people as the ops PATCH)", async () => {
    m.members = new Map([[BRAND, "owner"]]);   // social_brand_members owner: passes requireBrandRole
    expect((await settings.GET(new Request(`http://localhost/api/social/settings?brand=${BRAND}`, { headers: { "x-ops-user-kind": "client", "x-ops-org-id": BRAND, "x-ops-user-id": USER } }))).status).not.toBe(403);
    const res = await settings.PUT(new Request("http://localhost/api/social/settings", {
      method: "PUT", headers: { "content-type": "application/json", "x-ops-user-kind": "client", "x-ops-org-id": BRAND, "x-ops-user-id": USER },
      body: JSON.stringify({ brand: BRAND, timezone: "Asia/Taipei" }) }));
    expect(res.status).toBe(403);
    expect(m.orgUpdates).toBe(0);
  });
});
