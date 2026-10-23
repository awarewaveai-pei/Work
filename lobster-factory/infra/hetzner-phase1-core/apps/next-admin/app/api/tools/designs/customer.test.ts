// A customer on a product door may save and delete designs (ADR 018 §2 開門規則 2): its identity comes from middleware,
// it deletes only what it saved, and only real images are stored. ops-role and tenant-guard are the real ones.
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[], asset: null as Record<string, unknown> | null, deleted: false }));
vi.mock("../../../../lib/storage/r2", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/storage/r2")>()),
  isR2Configured: () => true,
  buildDesignKey: () => "designs/x.png",
  putDesignObject: async () => ({ ok: true, objectKey: "designs/x.png", publicUrl: "https://r2.example/x.png", byteSize: 10, checksumSha256: "c" }),
}));
vi.mock("../../../../lib/content/r2-delete-guard", () => ({ deleteUnreferencedAsset: async () => ({ ok: true }) }));
vi.mock("../../../../lib/supabase-server", () => ({
  getSupabaseReadClient: () => null,
  getSupabaseWriteClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        (table === "media_assets" ? db.inserted : db.audits).push(row);
        return { select: () => ({ single: async () => ({ data: { id: "a1", object_key: "designs/x.png", byte_size: 10 }, error: null }) }), then: (ok: (v: unknown) => unknown) => ok({ error: null }) };
      },
      select: () => { const q = { eq: () => q, single: async () => ({ data: db.asset, error: db.asset ? null : { message: "none" } }) }; return q; },
      delete: () => ({ eq: async () => { db.deleted = true; return { error: null }; } }),
    }),
  }),
}));
import { DELETE, POST } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const STAFF_USER = "33333333-3333-4333-8333-333333333333";
const client = { "x-ops-user-kind": "client", "x-ops-org-id": ORG, "x-ops-user-id": ME };
const png = async () => `data:image/png;base64,${(await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).png().toBuffer()).toString("base64")}`;
const post = (body: object, headers: Record<string, string> = client) =>
  POST(new Request("https://tarot.aware-wave.com/api/tools/designs", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const del = (headers: Record<string, string> = client) => DELETE(new Request("https://tarot.aware-wave.com/api/tools/designs?id=44444444-4444-4444-8444-444444444444", { method: "DELETE", headers }));

beforeEach(() => { vi.stubEnv("POD_DESIGNS_ENABLED", "true"); db.inserted = []; db.audits = []; db.asset = null; db.deleted = false; });
afterEach(() => vi.unstubAllEnvs());

describe("designs for a customer", () => {
  it("saves under its own organization and its authenticated user, whatever the body claims", async () => {
    const res = await post({ image: await png(), organizationId: "99999999-9999-4999-8999-999999999999", actorUserId: STAFF_USER });
    expect(res.status).toBe(200);
    expect(db.inserted[0]).toMatchObject({ organization_id: ORG, created_by: ME });
    expect(db.audits[0]).toMatchObject({ actor_user_id: ME, payload: { role_source: "client" } });
  });

  it("refuses bytes that are not an image even when labelled as one", async () => {
    const res = await post({ image: `data:image/png;base64,${Buffer.from("not an image at all").toString("base64")}` });
    expect(res.status).toBe(400);
    expect(db.inserted).toEqual([]);
  });

  it("deletes only what it saved itself; staff-made assets of its organization stay", async () => {
    db.asset = { id: "a", object_key: "designs/x.png", mime_type: "image/png", organization_id: ORG, created_by: STAFF_USER, metadata: {} };
    expect((await del()).status).toBe(403);
    expect(db.deleted).toBe(false);
    db.asset = { ...db.asset, created_by: ME };
    expect((await del()).status).toBe(200);
    expect(db.deleted).toBe(true);
  });

  it("staff keep the advisory actor and may delete any asset of an organization", async () => {
    const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
    expect((await post({ image: await png(), organizationId: ORG, actorUserId: STAFF_USER }, staff)).status).toBe(200);
    expect(db.inserted[0]).toMatchObject({ created_by: STAFF_USER });
    db.asset = { id: "a", object_key: "designs/x.png", mime_type: "image/png", organization_id: ORG, created_by: ME, metadata: {} };
    expect((await del(staff)).status).toBe(200);
  });
});
