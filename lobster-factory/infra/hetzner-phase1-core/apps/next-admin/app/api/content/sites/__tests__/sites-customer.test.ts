// A customer on the content door (step-8 card C-R2): it may not put a URL into wp_sites -- stored URLs are fetched with
// the site's credentials by code that neither pins the address nor scopes by organization (wp-sites.ts
// siteUrlWriteGate) -- but saves the edit form of its own site unchanged; the env fallback sites belong to no
// organization, so it sees none. ops-role and tenant-guard are the real ones.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = vi.hoisted(() => "11111111-1111-4111-8111-111111111111");
const db = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[], updated: [] as Record<string, unknown>[], supabase: true }));
vi.mock("@/lib/supabase-server", () => {
  const q = {
    select: () => q, eq: () => q,
    maybeSingle: async () => ({ data: { organization_id: ORG, url: "https://shop.example.com/" }, error: null }),   // a legacy row kept its slash
    single: async () => ({ data: { id: "s1", name: "n", url: "https://shop.example.com", color: "#5855d0", active: true, note: null, created_at: "t", organization_id: db.inserted[0]?.organization_id ?? null }, error: null }),
    insert: (row: Record<string, unknown>) => { db.inserted.push(row); return q; },
    update: (row: Record<string, unknown>) => { db.updated.push(row); return q; },
  };
  return { getSupabaseWriteClient: () => (db.supabase ? { from: () => q } : null) };
});
vi.mock("@/lib/content/wp-sites", async (orig) => ({
  ...(await orig<typeof import("@/lib/content/wp-sites")>()),
  getWpSites: async () => ({ sites: [{ id: "env-1", name: "env", url: "https://env.example.com", color: "#111", username: "", organizationId: null }], tokens: {}, usernames: {} }),
}));
import { GET, POST } from "../route";
import { PATCH } from "../[id]/route";

const client = { "x-ops-user-kind": "client", "x-ops-org-id": ORG };
const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const at = "https://content.aware-wave.com/api/content/sites";
const add = (b: object, h: Record<string, string>) =>
  POST(new Request(at, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify({ name: "n", username: "u", token: "p", ...b }) }));
const edit = (b: object, h: Record<string, string>) =>
  PATCH(new Request(`${at}/s1`, { method: "PATCH", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) }), { params: Promise.resolve({ id: "s1" }) });

beforeEach(() => { db.inserted = []; db.updated = []; db.supabase = true; });

describe("sites for a customer", () => {
  it("may not add a site", async () => {
    expect((await add({ url: "https://shop.example.com" }, client)).status).toBe(403);
    expect(db.inserted).toEqual([]);
  });

  it("may not change its site's URL", async () => {
    expect((await edit({ name: "x", url: "https://other.example.com" }, client)).status).toBe(403);
    expect(db.updated).toEqual([]);
  });

  it("saves the edit form of its own site when the URL is unchanged", async () => {
    expect((await edit({ name: "x", url: "https://shop.example.com/" }, client)).status).toBe(200);
    expect(db.updated[0]).toMatchObject({ name: "x" });
    expect(db.updated[0]).not.toHaveProperty("url");
  });

  it("sees none of the env fallback sites, which belong to no organization", async () => {
    db.supabase = false;
    expect((await (await GET(new Request(at, { headers: client }))).json()).sites).toEqual([]);
    expect((await (await GET(new Request(at, { headers: staff }))).json()).sites).toHaveLength(1);
  });

  it("staff add sites, assigned to an organization or not, and change URLs", async () => {
    expect((await add({ url: "http://10.0.0.5/wp" }, staff)).status).toBe(201);
    expect(db.inserted[0]).toMatchObject({ organization_id: null });
    expect((await add({ url: "https://b.example.com", organizationId: ORG }, staff)).status).toBe(201);
    expect(db.inserted[1]).toMatchObject({ organization_id: ORG });
    expect((await edit({ url: "https://other.example.com" }, staff)).status).toBe(200);
    expect(db.updated[0]).toMatchObject({ url: "https://other.example.com" });
  });
});
