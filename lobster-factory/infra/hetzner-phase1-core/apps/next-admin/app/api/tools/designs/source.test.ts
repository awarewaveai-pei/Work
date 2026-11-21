// A design = preview image + optional original file (sourceUpload .vectorcraft / .svg / .psd), stored as its own R2 object.
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET = "bbbbbbbb-0000-4000-8000-000000000002";
const KEY = "designs/2026-11/11111111-1111-4111-8111-111111111111.png";
const SRC_KEY = "designs/2026-11/11111111-1111-4111-8111-111111111111.vectorcraft";

const st = vi.hoisted(() => ({ puts: [] as { key: string; bytes: number }[], rows: [] as { metadata: Record<string, unknown> }[], guardDeleted: [] as string[],
  pending: new Map<string, Buffer>() }));

vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ format: "png" }) }) }));
vi.mock("../../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "operator", source: "test" }), canCreateAiImageJob: () => true }));
vi.mock("../../../../lib/tenant-guard", () => ({
  effectiveOrgId: (_r: Request, org: string | null) => org,
  assertOrgAccess: () => undefined,
  resolveTenant: () => ({ userKind: "staff" }),
  OrgAccessError: class extends Error {},
  toOrgAccessResponse: () => new Response(null, { status: 403 }),
}));
vi.mock("../../../../lib/content/media-asset-delete", () => ({
  deleteMediaAsset: async (_db: unknown, a: { object_key: string }, o?: { extraKeys?: string[] }) => { st.guardDeleted.push(a.object_key, ...(o?.extraKeys ?? [])); return { ok: true, deletedIds: [] }; },
}));
vi.mock("../../../../lib/studio/designs-list",() => ({ decodeCursor: vi.fn(), listDesigns: vi.fn() }));
vi.mock("../../../../lib/storage/r2", () => ({
  isR2Configured: () => true,
  buildDesignKey: () => KEY,
  getDesignsPublicBase: () => "https://r2.test",
  sha256Hex: () => "x",
}));
vi.mock("../../../../lib/storage/r2-s3", () => ({ isR2S3Configured: () => true }));
// pending key -> the bytes the browser PUT there; a claim = one copy into designs/ (copy-then-read itself: upload.test.ts).
vi.mock("../../../../lib/studio/design-pending", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/studio/design-pending")>()),
  claimPendingUpload: async (p: { key: string }, formal: string) => {
    const b = st.pending.get(p.key)!;
    st.puts.push({ key: formal, bytes: b.length });
    return { ok: true, buffer: b };
  },
  discardPendingUpload: async () => undefined,
  discardUnregisteredDesignObjects: async (keys: string[]) => { st.puts = st.puts.filter((x) => !keys.includes(x.key)); },
}));
vi.mock("../../../../lib/supabase-server", () => ({
  getSupabaseReadClient: () => null,
  getSupabaseWriteClient: () => ({
    from: (table: string) => {
      if (table === "ops_audit_events") return { insert: async () => ({ error: null }) };
      const q = {
        select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: { id: ASSET, object_key: KEY, mime_type: "image/png", organization_id: ORG, created_by: null, metadata: st.rows[0]?.metadata ?? {} }, error: null }),
        insert: (row: { metadata: Record<string, unknown> }) => { st.rows.push(row); return { select: () => ({ single: async () => ({ data: { id: ASSET, object_key: KEY, byte_size: 3 }, error: null }) }) }; },
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
      return q;
    },
  }),
}));

import { DELETE, POST } from "./route";

const IMG = `uploads/pending/${ORG}/22222222-2222-4222-8222-222222222222.png`;
/** The original as the browser uploaded it: kind "source" with this extension, then registered under `name`. */
const save = (ext: string, data: Buffer | string, name?: string) => {
  const key = `uploads/pending/${ORG}/33333333-3333-4333-8333-333333333333.${ext}`;
  st.pending.set(key, Buffer.from(data));
  return POST(new Request("http://localhost/api/tools/designs", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ upload: { key: IMG }, sourceUpload: { key, name: name ?? `a.${ext}` }, source: "vector-pro", organizationId: ORG }),
  }));
};

beforeEach(() => {
  vi.stubEnv("POD_DESIGNS_ENABLED", "true");
  st.puts = []; st.rows = []; st.guardDeleted = []; st.pending = new Map([[IMG, Buffer.from("png")]]);
});

describe("POST sourceUpload", () => {
  it("accepts a gzip .vectorcraft and a JSON .vectorcraft; stored next to the preview, key in metadata", async () => {
    for (const data of [gzipSync(Buffer.from('{"format":"vectorcraft"}')), Buffer.from('{ "format": "drawcraft", "version": 4 }\n...blob bytes')]) {
      st.puts = []; st.rows = [];
      const res = await save("vectorcraft", data);
      expect(res.status).toBe(200);
      expect(st.puts.map((p) => p.key)).toEqual([KEY, SRC_KEY]);
      expect(st.rows[0].metadata).toMatchObject({ source: "vector-pro", source_key: SRC_KEY, source_name: "a.vectorcraft", source_bytes: data.length });
    }
  });

  it("accepts an .svg behind an XML declaration and a comment", async () => {
    const svg = '﻿<?xml version="1.0"?>\n<!-- x -->\n<svg xmlns="http://www.w3.org/2000/svg"/>';
    expect((await save("svg", svg)).status).toBe(200);
    expect(st.puts[1].key).toBe(SRC_KEY.replace(".vectorcraft", ".svg"));
  });

  it("rejects a disguise (key / name say one thing, bytes another) and keeps nothing", async () => {
    for (const [ext, data, name] of [
      ["vectorcraft", "<svg xmlns='x'/>"],
      ["vectorcraft", '{"format":"other"}'],
      ["svg", "<html><svg/></html>"],
      ["svg", gzipSync(Buffer.from("x"))],
      ["svg", "<svg/>", "a.exe"],
      ["exe", "<svg/>"],
    ] as Array<[string, Buffer | string, string?]>) {
      expect((await save(ext, data, name)).status, `${ext} ${name ?? ""}`).toBe(400);
    }
    expect(st.puts).toEqual([]);
    expect(st.rows).toEqual([]);
  });
});

describe("DELETE removes the original file too", () => {
  it("hands the preview and metadata.source_key to deleteMediaAsset; ignores a source_key it would not mint", async () => {
    st.rows = [{ metadata: { source_key: SRC_KEY } }];
    const url = `http://localhost/api/tools/designs?id=${ASSET}`;
    expect((await DELETE(new Request(url, { method: "DELETE" }))).status).toBe(200);
    expect(st.guardDeleted).toEqual([KEY, SRC_KEY]);
    st.guardDeleted = []; st.rows = [{ metadata: { source_key: "designs/../../other-bucket/x.vectorcraft" } }];
    await DELETE(new Request(url, { method: "DELETE" }));
    expect(st.guardDeleted).toEqual([KEY]);
  });
});
