// Mockup presets on the design door (step-8 card D-R1): a customer lists, saves and deletes only in its own
// organization, whatever the request names, and deletes only what it saved. ops-role and tenant-guard are the real ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  eqs: [] as Array<[string, unknown]>, inserted: [] as Record<string, unknown>[], asset: null as Record<string, unknown> | null, deleted: false,
  updated: null as Record<string, unknown> | null, uploads: 0,
}));
vi.mock("../../../../lib/entitlements/grant", () => ({ withFeature: (_k: string, h: (r: Request) => Promise<Response>) => h }));
vi.mock("../../../../lib/storage/r2", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/storage/r2")>()),
  isR2Configured: () => true,
  buildDesignKey: () => "designs/p.png",
  putDesignObject: async () => { db.uploads++; return { ok: true, objectKey: "designs/p.png", publicUrl: "https://r2.example/p.png", byteSize: 10, checksumSha256: "c" }; },
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
        update: (row: Record<string, unknown>) => { db.updated = row; return q; },
      };
      return q;
    },
  };
  return { getSupabaseReadClient: () => client, getSupabaseWriteClient: () => client };
});
import { DELETE, GET, PATCH, POST } from "./route";

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

beforeEach(() => { vi.stubEnv("POD_DESIGNS_ENABLED", "true"); db.eqs = []; db.inserted = []; db.asset = null; db.deleted = false; db.updated = null; db.uploads = 0; });
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

  it("a model photo keeps its model, role and print box; a box outside the photo is refused before any upload", async () => {
    const key = "55555555-5555-4555-8555-555555555555";
    const save = (extra: Record<string, unknown>) => POST(new Request(at(""), { method: "POST", headers: { "content-type": "application/json", ...client },
      body: JSON.stringify({ image: png, presetType: "model", presetName: "Leo", modelKey: key, photoRole: "pose", ...extra }) }));
    expect((await save({ printBox: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, garmentColor: "white" })).status).toBe(200);
    expect(db.inserted[0].metadata).toMatchObject({ model_key: key, photo_role: "pose", garment_color: "white", print_box: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 } });
    expect((await save({ printBox: { x: 0.9, y: 0.3, w: 0.4, h: 0.4 } })).status).toBe(400);
    expect(db.uploads).toBe(1);
  });

  it("changes a print box only within its own organization and only on what it saved", async () => {
    const patch = (headers: Record<string, string>) => PATCH(new Request(at(`?id=${ASSET}&organizationId=${OTHER}`), { method: "PATCH",
      headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ printBox: { x: 0.2, y: 0.3, w: 0.5, h: 0.4 } }) }));
    db.asset = { id: ASSET, metadata: { model_key: "k", preset_name: "Leo" }, created_by: STAFF_USER };
    expect((await patch(client)).status).toBe(403);
    expect(db.updated).toBeNull();
    db.asset = { id: ASSET, metadata: { model_key: "k", preset_name: "Leo" }, created_by: ME };
    expect((await patch(client)).status).toBe(200);
    expect(orgFilter().every((o) => o === ORG)).toBe(true);
    expect(db.updated).toEqual({ metadata: { model_key: "k", preset_name: "Leo", print_box: { x: 0.2, y: 0.3, w: 0.5, h: 0.4 } } });
  });
});
