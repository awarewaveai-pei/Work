// Mockup presets on the design door (step-8 card D-R1): a customer lists, saves and deletes only in its own
// organization, whatever the request names, and deletes only what it saved. ops-role and tenant-guard are the real ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  eqs: [] as Array<[string, unknown]>, inserted: [] as Record<string, unknown>[], asset: null as Record<string, unknown> | null, deleted: false,
}));
vi.mock("../../../../lib/entitlements/grant", () => ({ withFeature: (_k: string, h: (r: Request) => Promise<Response>) => h }));
vi.mock("../../../../lib/storage/r2", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/storage/r2")>()),
  isR2Configured: () => true,
  buildDesignKey: () => "designs/p.png",
  putDesignObject: async () => ({ ok: true, objectKey: "designs/p.png", publicUrl: "https://r2.example/p.png", byteSize: 10, checksumSha256: "c" }),
}));
vi.mock("../../../../lib/content/r2-delete-guard", () => ({ deleteUnreferencedAsset: async () => ({ ok: true }) }));
vi.mock("../../../../lib/supabase-server", () => {
  const client = {
    from: (table: string) => {
      const q = {
        select: () => q, in: () => q, order: () => q,
        eq: (c: string, v: unknown) => { if (table === "media_assets") db.eqs.push([c, v]); return q; },
        limit: async () => ({ data: [], error: null }),
        single: async () => ({ data: db.asset, error: db.asset ? null : { message: "none" } }),
        insert: (row: Record<string, unknown>) => {
          if (table === "media_assets") db.inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "a1" }, error: null }) }), then: (ok: (v: unknown) => unknown) => ok({ error: null }) };
        },
        delete: () => ({ eq: async () => { db.deleted = true; return { error: null }; } }),
      };
      return q;
    },
  };
  return { getSupabaseReadClient: () => client, getSupabaseWriteClient: () => client };
});
import { DELETE, GET, POST } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const ME = "22222222-2222-4222-8222-222222222222";
const STAFF_USER = "33333333-3333-4333-8333-333333333333";
const ASSET = "44444444-4444-4444-8444-444444444444";
const client = { "x-ops-user-kind": "client", "x-ops-org-id": ORG, "x-ops-user-id": ME };
const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const at = (q: string) => `https://design.aware-wave.com/api/tools/presets${q}`;
const png = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
const orgFilter = () => db.eqs.filter(([c]) => c === "organization_id").map(([, v]) => v);

beforeEach(() => { vi.stubEnv("POD_DESIGNS_ENABLED", "true"); db.eqs = []; db.inserted = []; db.asset = null; db.deleted = false; });
afterEach(() => vi.unstubAllEnvs());

describe("mockup presets for a customer", () => {
  it("lists only its own organization's presets, whatever organizationId it names", async () => {
    expect((await GET(new Request(at(`?organizationId=${OTHER}`), { headers: client }))).status).toBe(200);
    expect(orgFilter()).toEqual([ORG]);
  });

  it("saves under its own organization and its own user, whatever the body names", async () => {
    const res = await POST(new Request(at(""), { method: "POST", headers: { "content-type": "application/json", ...client },
      body: JSON.stringify({ image: png, presetType: "model", presetName: "m", organizationId: OTHER }) }));
    expect(res.status).toBe(200);
    expect(db.inserted[0]).toMatchObject({ organization_id: ORG, created_by: ME });
  });

  it("deletes only within its own organization, whatever organizationId it names", async () => {
    db.asset = { id: ASSET, object_key: "designs/p.png", organization_id: ORG, created_by: ME };
    expect((await DELETE(new Request(at(`?id=${ASSET}&organizationId=${OTHER}`), { method: "DELETE", headers: client }))).status).toBe(200);
    expect(orgFilter()).toEqual([ORG]);
  });

  it("deletes only what it saved itself; staff-made presets of its organization stay", async () => {
    db.asset = { id: ASSET, object_key: "designs/p.png", organization_id: ORG, created_by: STAFF_USER };
    expect((await DELETE(new Request(at(`?id=${ASSET}`), { method: "DELETE", headers: client }))).status).toBe(403);
    expect(db.deleted).toBe(false);
  });

  it("staff name any organization and delete any preset in it", async () => {
    expect((await GET(new Request(at(`?organizationId=${OTHER}`), { headers: staff }))).status).toBe(200);
    expect(orgFilter()).toEqual([OTHER]);
    db.asset = { id: ASSET, object_key: "designs/p.png", organization_id: OTHER, created_by: ME };
    expect((await DELETE(new Request(at(`?id=${ASSET}&organizationId=${OTHER}`), { method: "DELETE", headers: staff }))).status).toBe(200);
    expect(db.deleted).toBe(true);
  });
});
