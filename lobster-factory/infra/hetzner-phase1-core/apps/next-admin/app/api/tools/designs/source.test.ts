// A design = preview image + optional original file (sourceFile .vectorcraft / .svg), stored as its own R2 object.
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET = "bbbbbbbb-0000-4000-8000-000000000002";
const KEY = "designs/2026-11/11111111-1111-4111-8111-111111111111.png";
const SRC_KEY = "designs/2026-11/11111111-1111-4111-8111-111111111111.vectorcraft";

const st = vi.hoisted(() => ({ puts: [] as { key: string; type: string; bytes: number }[], rows: [] as { metadata: Record<string, unknown> }[], guardDeleted: [] as string[], r2Deleted: [] as string[] }));

vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ format: "png" }) }) }));
vi.mock("../../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "operator", source: "test" }), canCreateAiImageJob: () => true }));
vi.mock("../../../../lib/tenant-guard", () => ({
  effectiveOrgId: (_r: Request, org: string | null) => org,
  assertOrgAccess: () => undefined,
  resolveTenant: () => ({ userKind: "staff" }),
  OrgAccessError: class extends Error {},
  toOrgAccessResponse: () => new Response(null, { status: 403 }),
}));
vi.mock("../../../../lib/content/r2-delete-guard", () => ({
  deleteUnreferencedAsset: async (k: string) => { st.guardDeleted.push(k); return { ok: true, deleted: 1 }; },
}));
vi.mock("../../../../lib/studio/designs-list", () => ({ decodeCursor: vi.fn(), listDesigns: vi.fn() }));
vi.mock("../../../../lib/storage/r2", () => ({
  isR2Configured: () => true,
  buildDesignKey: () => KEY,
  parseImageDataUrl: () => ({ mime: "image/png", buffer: Buffer.from("png") }),
  deleteDesignObject: async (k: string) => { st.r2Deleted.push(k); return { ok: true }; },
  putDesignObject: async (key: string, body: Buffer, type: string) => {
    st.puts.push({ key, type, bytes: body.length });
    return { ok: true, objectKey: key, publicUrl: `https://r2.test/${key}`, byteSize: body.length, checksumSha256: "x" };
  },
}));
vi.mock("../../../../lib/supabase-server", () => ({
  getSupabaseReadClient: () => null,
  getSupabaseWriteClient: () => ({
    from: (table: string) => {
      if (table === "ops_audit_events") return { insert: async () => ({ error: null }) };
      const q = {
        select: () => q, eq: () => q,
        single: async () => ({ data: { id: ASSET, object_key: KEY, mime_type: "image/png", organization_id: ORG, created_by: null, metadata: st.rows[0]?.metadata ?? {} }, error: null }),
        insert: (row: { metadata: Record<string, unknown> }) => { st.rows.push(row); return { select: () => ({ single: async () => ({ data: { id: ASSET, object_key: KEY, byte_size: 3 }, error: null }) }) }; },
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
      return q;
    },
  }),
}));

import { DELETE, POST } from "./route";

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64");
const save = (sourceFile?: unknown) =>
  POST(new Request("http://localhost/api/tools/designs", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,cG5n", source: "vector-pro", organizationId: ORG, ...(sourceFile ? { sourceFile } : {}) }),
  }));

beforeEach(() => {
  vi.stubEnv("POD_DESIGNS_ENABLED", "true");
  st.puts = []; st.rows = []; st.guardDeleted = []; st.r2Deleted = [];
});

describe("POST sourceFile", () => {
  it("accepts a gzip .vectorcraft and a JSON .vectorcraft; stores them as octet-stream next to the preview, key in metadata", async () => {
    for (const data of [gzipSync(Buffer.from('{"format":"vectorcraft"}')), Buffer.from('{ "format": "drawcraft", "version": 4 }\n...blob bytes')]) {
      st.puts = []; st.rows = [];
      const res = await save({ name: "a.vectorcraft", data: b64(data) });
      expect(res.status).toBe(200);
      expect(st.puts.map((p) => p.key)).toEqual([KEY, SRC_KEY]);
      expect(st.puts[1].type).toBe("application/octet-stream");
      expect(st.rows[0].metadata).toMatchObject({ source: "vector-pro", source_key: SRC_KEY, source_name: "a.vectorcraft", source_bytes: data.length });
    }
  });

  it("accepts an .svg behind an XML declaration and a comment", async () => {
    const svg = '﻿<?xml version="1.0"?>\n<!-- x -->\n<svg xmlns="http://www.w3.org/2000/svg"/>';
    expect((await save({ name: "a.svg", data: b64(svg) })).status).toBe(200);
    expect(st.puts[1].key).toBe(SRC_KEY.replace(".vectorcraft", ".svg"));
  });

  it("rejects a disguise (name says one thing, bytes another) and stores nothing", async () => {
    for (const sf of [
      { name: "a.vectorcraft", data: b64("<svg xmlns='x'/>") },
      { name: "a.vectorcraft", data: b64('{"format":"other"}') },
      { name: "a.svg", data: b64("<html><svg/></html>") },
      { name: "a.svg", data: b64(gzipSync(Buffer.from("x"))) },
      { name: "a.exe", data: b64("<svg/>") },
    ]) {
      expect((await save(sf)).status).toBe(400);
    }
    expect(st.puts).toEqual([]);
  });

  it("rejects a source over the 20 MB limit (413)", async () => {
    const big = Buffer.alloc(20 * 1024 * 1024 + 1, 0x20);
    big.write('{"format":"vectorcraft"}', 0);
    expect((await save({ name: "big.vectorcraft", data: b64(big) })).status).toBe(413);
    expect(st.puts).toEqual([]);
  });
});

describe("DELETE removes the original file too", () => {
  it("deletes the preview and metadata.source_key through the reference guard; ignores a source_key it would not mint", async () => {
    st.rows = [{ metadata: { source_key: SRC_KEY } }];
    const url = `http://localhost/api/tools/designs?id=${ASSET}`;
    expect((await DELETE(new Request(url, { method: "DELETE" }))).status).toBe(200);
    expect(st.guardDeleted).toEqual([KEY, SRC_KEY]);
    st.guardDeleted = []; st.rows = [{ metadata: { source_key: "designs/../../other-bucket/x.vectorcraft" } }];
    await DELETE(new Request(url, { method: "DELETE" }));
    expect(st.guardDeleted).toEqual([KEY]);
  });
});
