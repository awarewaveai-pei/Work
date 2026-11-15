// Step ③ of the direct upload (plan lobster-factory/docs/PLAN-designs-direct-upload.md §2, I3/I4): POST {upload:{key}} registers
// what the browser PUT to uploads/pending/<org>/. A fake bucket stands in for R2 (REST + S3); sharp is the real one.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "cccccccc-0000-4000-8000-000000000003";
const KEY = "designs/2026-11/11111111-1111-4111-8111-111111111111.png";
const SRC_KEY = "designs/2026-11/11111111-1111-4111-8111-111111111111.psd";
const P_IMG = `uploads/pending/${ORG}/22222222-2222-4222-8222-222222222222.png`;
const P_SRC = `uploads/pending/${ORG}/33333333-3333-4333-8333-333333333333.psd`;

const st = vi.hoisted(() => ({
  bucket: new Map<string, { body: Buffer; type: string; size?: number }>(),
  copies: [] as Array<[string, string]>,
  rows: [] as Array<Record<string, unknown>>,
  insertError: null as null | { message: string },
  /** what CopyObject writes at the formal key when set (pending and formal then differ) */
  copyOverride: null as null | Buffer,
  /** the PUT lands in R2 but its answer is lost */
  putLost: false,
}));

vi.mock("../../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "operator", source: "test" }), canCreateAiImageJob: () => true }));
vi.mock("../../../../lib/tenant-guard", () => ({
  effectiveOrgId: (_r: Request, org: string | null) => org,
  assertOrgAccess: () => undefined,
  resolveTenant: () => ({ userKind: "staff" }),
  OrgAccessError: class extends Error {},
  toOrgAccessResponse: () => new Response(null, { status: 403 }),
}));
// The WordPress-reference guard as it answers when a site cannot be scanned: it refuses. Rollback must not depend on it.
vi.mock("../../../../lib/content/r2-delete-guard", () => ({
  deleteUnreferencedAsset: async () => ({ ok: false, error: "reference_scan_no_sites", message: "x" }),
}));
vi.mock("../../../../lib/studio/designs-list", () => ({ decodeCursor: vi.fn(), listDesigns: vi.fn() }));
vi.mock("../../../../lib/storage/r2", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/storage/r2")>()),
  isR2Configured: () => true,
  buildDesignKey: () => KEY,
  putDesignObject: async (key: string, body: Buffer, type: string) => {
    st.bucket.set(key, { body, type });
    if (st.putLost) return { ok: false, error: "r2_network_error" };
    return { ok: true, objectKey: key, publicUrl: `https://r2.test/${key}`, byteSize: body.length, checksumSha256: "x" };
  },
  r2DeleteObject: async (_b: string, key: string) => { st.bucket.delete(key); return { ok: true }; },
  deleteDesignObject: async (key: string) => { st.bucket.delete(key); return { ok: true }; },
}));
vi.mock("../../../../lib/storage/r2-s3", () => ({
  isR2S3Configured: () => true,
  headObject: async (key: string) => {
    const o = st.bucket.get(key);
    return o ? { ok: true, contentLength: o.size ?? o.body.length, contentType: o.type } : { ok: false, error: "r2_not_found" };
  },
  getObject: async (key: string, opts: { maxBytes: number }) => {
    const o = st.bucket.get(key);
    if (!o) return { ok: false, error: "r2_not_found", status: 404 };
    if (o.body.length > opts.maxBytes) return { ok: false, error: "r2_object_too_large" };
    return { ok: true, body: o.body };
  },
  copyObject: async (src: string, dst: string) => {
    st.copies.push([src, dst]);
    const o = st.bucket.get(src)!;
    st.bucket.set(dst, { body: st.copyOverride ?? o.body, type: o.type });
    return { ok: true };
  },
}));
vi.mock("../../../../lib/supabase-server", () => ({
  getSupabaseReadClient: () => null,
  getSupabaseWriteClient: () => ({
    from: (table: string) => ({
      // upload_key lookup (registration is idempotent): a row already inserted for that key
      select: () => {
        const f: Record<string, string> = {};
        const q = { eq: (c: string, v: string) => ((f[c] = v), q), limit: () => q,
          maybeSingle: async () => ({ data: st.rows.find((r) => (r.metadata as Record<string, unknown>)?.upload_key === f["metadata->>upload_key"]) ? { id: "a1" } : null, error: null }) };
        return q;
      },
      insert: (row: Record<string, unknown>) => {
        if (table === "media_assets") st.rows.push(row);
        return {
          select: () => ({ single: async () => (st.insertError ? { data: null, error: st.insertError } : { data: { id: "a1", object_key: KEY, byte_size: 1 }, error: null }) }),
          then: (ok: (v: unknown) => unknown) => ok({ error: null }),
        };
      },
    }),
  }),
}));

import { POST } from "./route";

const png = (r: number) => sharp({ create: { width: 2, height: 2, channels: 3, background: { r, g: 0, b: 0 } } }).png().toBuffer();
const psd = () => { const b = Buffer.alloc(40); b.write("8BPS", 0, "latin1"); b.writeUInt16BE(1, 4); return b; };
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const designsKeys = () => [...st.bucket.keys()].filter((k) => k.startsWith("designs/"));
const save = (extra: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/tools/designs", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "tarot", organizationId: ORG, ...extra }),
  }));

beforeEach(() => {
  vi.stubEnv("POD_DESIGNS_ENABLED", "true");
  st.bucket.clear(); st.copies = []; st.rows = []; st.insertError = null; st.copyOverride = null; st.putLost = false;
});

describe("POST upload:{key}", () => {
  it("verifies and records the FORMAL copy, not the pending object; pending removed after the row", async () => {
    const pending = await png(10), formal = await png(200);
    st.bucket.set(P_IMG, { body: pending, type: "image/png" });
    st.copyOverride = formal;
    const res = await save({ upload: { key: P_IMG } });
    expect(res.status).toBe(200);
    expect(st.copies).toEqual([[P_IMG, KEY]]);
    expect(st.rows[0]).toMatchObject({ object_key: KEY, mime_type: "image/png", checksum_sha256: sha(formal), byte_size: formal.length });
    expect(sha(formal)).not.toBe(sha(pending));
    expect(st.bucket.has(P_IMG)).toBe(false);
    expect(designsKeys()).toEqual([KEY]);
  });

  it("registering the same key again (answer lost) returns the saved row, not 'expired'", async () => {
    st.bucket.set(P_IMG, { body: await png(1), type: "image/png" });
    expect((await save({ upload: { key: P_IMG } })).status).toBe(200);
    expect(st.bucket.has(P_IMG)).toBe(false);
    const again = await save({ upload: { key: P_IMG } });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, reused: true });
    expect(st.rows).toHaveLength(1);
  });

  it("Content-Length over 64 MiB: refused before any copy", async () => {
    st.bucket.set(P_IMG, { body: await png(1), type: "image/png", size: 64 * 1024 * 1024 + 1 });
    expect((await save({ upload: { key: P_IMG } })).status).toBe(413);
    expect(st.copies).toEqual([]);
    expect(designsKeys()).toEqual([]);
  });

  it("a key of another org, or outside uploads/pending/: 4xx, nothing copied", async () => {
    const foreign = `uploads/pending/${OTHER}/22222222-2222-4222-8222-222222222222.png`;
    for (const key of [foreign, KEY, `uploads/other/${ORG}/22222222-2222-4222-8222-222222222222.png`, `uploads/pending/${ORG}/../x.png`]) {
      st.bucket.set(key, { body: await png(1), type: "image/png" });
      const res = await save({ upload: { key } });
      expect(res.status, key).toBeGreaterThanOrEqual(400);
      expect(res.status, key).toBeLessThan(500);
    }
    expect(st.copies).toEqual([]);
    expect(st.rows).toEqual([]);
  });

  it("bytes that are not the image the key names: 400 and the formal copy is gone", async () => {
    for (const body of [Buffer.from("<html>not an image</html>"), await sharp({ create: { width: 2, height: 2, channels: 3, background: "#000" } }).jpeg().toBuffer()]) {
      st.bucket.clear();
      st.bucket.set(P_IMG, { body, type: "image/png" });
      expect((await save({ upload: { key: P_IMG } })).status).toBe(400);
      expect(designsKeys()).toEqual([]);
    }
    expect(st.rows).toEqual([]);
  });

  it("sourceUpload whose bytes are not a .psd: 400, neither preview nor original stays", async () => {
    st.bucket.set(P_IMG, { body: await png(1), type: "image/png" });
    st.bucket.set(P_SRC, { body: Buffer.from("not a psd at all, just text....."), type: "application/octet-stream" });
    expect((await save({ upload: { key: P_IMG }, sourceUpload: { key: P_SRC, name: "a.psd" } })).status).toBe(400);
    expect(designsKeys()).toEqual([]);
    expect(st.rows).toEqual([]);
  });

  it("sourceUpload ok: original stored next to the preview with its name", async () => {
    st.bucket.set(P_IMG, { body: await png(1), type: "image/png" });
    st.bucket.set(P_SRC, { body: psd(), type: "application/octet-stream" });
    expect((await save({ upload: { key: P_IMG }, sourceUpload: { key: P_SRC, name: "c:\\x\\poster.psd" } })).status).toBe(200);
    expect(st.rows[0].metadata).toMatchObject({ source_key: SRC_KEY, source_name: "poster.psd", source_bytes: 40 });
    expect(designsKeys().sort()).toEqual([KEY, SRC_KEY].sort());
  });
});

describe("insert failure deletes every formal object of the request", () => {
  it("direct upload: preview and original both removed", async () => {
    st.bucket.set(P_IMG, { body: await png(1), type: "image/png" });
    st.bucket.set(P_SRC, { body: psd(), type: "application/octet-stream" });
    st.insertError = { message: "boom" };
    expect((await save({ upload: { key: P_IMG }, sourceUpload: { key: P_SRC } })).status).toBe(500);
    expect(designsKeys()).toEqual([]);
  });

  it("Printful mockup PUT stored but its answer lost: the object is removed", async () => {
    st.putLost = true;
    const body = await png(1);
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(body), { status: 200, headers: { "content-type": "image/png" } }));
    try {
      expect((await save({ sourceUrl: "https://files.cdn.printful.com/x.png" })).status).toBe(502);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(designsKeys()).toEqual([]);
  });
});
