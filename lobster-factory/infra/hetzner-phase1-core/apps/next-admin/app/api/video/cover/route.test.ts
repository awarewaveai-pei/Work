// Card VD.3: choosing / uploading a video's cover. Invariants: only a cover of THIS video in THIS org can be chosen; the
// video row is never written; another org is refused before any database read; an upload is a confirmed-rights image.
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: [] as Row[], log: { updates: [] as Array<{ table: string; id: unknown; patch: Row }>, inserts: [] as Array<{ table: string; row: Row }>, reads: 0 } }));
const r2 = vi.hoisted(() => ({ puts: [] as string[] }));
vi.mock("@/lib/supabase-server", async () => {
  const { fakeDb } = await import("@/lib/content/video/__tests__/fake-db");
  return { getSupabaseWriteClient: () => fakeDb(() => ({ media_assets: state.rows }), state.log) };
});
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => true, r2PutObject: async (_b: string, key: string) => { r2.puts.push(key); return { ok: true }; } }));

import { GET, POST } from "./route";

const ORG = "123e4567-e89b-42d3-a456-426614174001", OTHER = "123e4567-e89b-42d3-a456-426614174009";
const VIDEO = "123e4567-e89b-42d3-a456-426614174002", VIDEO2 = "123e4567-e89b-42d3-a456-426614174003";
const A0 = "123e4567-e89b-42d3-a456-4266141740a0", A1 = "123e4567-e89b-42d3-a456-4266141740a1", FOREIGN = "123e4567-e89b-42d3-a456-4266141740f0";
const staff = { "x-ops-claims-role": "owner", "x-ops-user-kind": "staff" };
const choose = (body: unknown, headers: Record<string, string> = staff) => POST(new NextRequest("http://localhost/api/video/cover", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
import sharp from "sharp";
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
let JPEG: Buffer;
beforeAll(async () => { JPEG = await sharp({ create: { width: 32, height: 18, channels: 3, background: "#c03030" } }).jpeg().toBuffer(); });
// The browser's request: organizationId in the query, a multipart body with its Content-Length.
const upload = async (fields: Record<string, string>, file: Blob | null, opts: { length?: string | null; headers?: Record<string, string> } = {}) => {
  const { organizationId = ORG, ...rest } = fields;
  const form = new FormData();
  for (const [k, v] of Object.entries(rest)) form.set(k, v);
  if (file) form.set("file", file, "cover.jpg");
  const encoded = new Response(form), body = new Uint8Array(await encoded.arrayBuffer());
  const headers: Record<string, string> = { ...(opts.headers ?? staff), "content-type": encoded.headers.get("content-type")! };
  if (opts.length !== null) headers["content-length"] = opts.length ?? String(body.byteLength);
  return POST(new NextRequest(`http://localhost/api/video/cover?organizationId=${organizationId}`, { method: "POST", headers, body }));
};

beforeEach(() => {
  Object.assign(state.log, { updates: [], inserts: [], reads: 0 });
  Object.assign(state, { rows: [
    { id: VIDEO, organization_id: ORG, mime_type: "video/mp4", object_url: "https://r2/v.mp4", metadata: { title: "影片" } },
    { id: VIDEO2, organization_id: ORG, mime_type: "video/mp4", object_url: "https://r2/v2.mp4", metadata: {} },
    { id: A0, organization_id: ORG, mime_type: "image/jpeg", object_url: "https://r2/a0.jpg", created_at: "2026-11-14T01:00:00Z", metadata: { coverOf: VIDEO, coverKind: "auto", vwJobId: "cover:j:0" } },
    { id: A1, organization_id: ORG, mime_type: "image/jpeg", object_url: "https://r2/a1.jpg", created_at: "2026-11-14T01:00:01Z", metadata: { coverOf: VIDEO, coverKind: "auto", vwJobId: "cover:j:1" } },
    { id: FOREIGN, organization_id: ORG, mime_type: "image/jpeg", object_url: "https://r2/f.jpg", created_at: "2026-11-14T01:00:00Z", metadata: { coverOf: VIDEO2, coverKind: "auto", vwJobId: "cover:k:0" } },
  ] });
  r2.puts = [];
  vi.stubEnv("R2_VIDEO_PUBLIC_BASE", "https://videos.example");
});

describe("/api/video/cover", () => {
  it("GET lists each video's covers with exactly one chosen", async () => {
    const res = await GET(new NextRequest(`http://localhost/api/video/cover?organizationId=${ORG}&assetIds=${VIDEO},${VIDEO2}`, { headers: staff }));
    const json = await res.json();
    expect(json.covers[VIDEO].map((c: { id: string; chosen: boolean }) => [c.id, c.chosen])).toEqual([[A0, true], [A1, false]]);
    expect(json.covers[VIDEO2].map((c: { id: string }) => c.id)).toEqual([FOREIGN]);
  });

  it("choosing writes chosenAt on the cover row only; the video row is untouched", async () => {
    expect((await choose({ organizationId: ORG, assetId: VIDEO, coverAssetId: A1 })).status).toBe(200);
    expect(state.log.updates.map((u) => u.id)).toEqual([A1]);
    expect(typeof (state.rows.find((r) => r.id === A1)?.metadata as Row).chosenAt).toBe("string");
    expect(state.rows.find((r) => r.id === VIDEO)?.metadata).toEqual({ title: "影片" });
  });

  it("a cover of another video, or a video itself, cannot be chosen", async () => {
    expect((await choose({ organizationId: ORG, assetId: VIDEO, coverAssetId: FOREIGN })).status).toBe(404);
    expect((await choose({ organizationId: ORG, assetId: VIDEO, coverAssetId: VIDEO2 })).status).toBe(404);
    expect(state.log.updates).toEqual([]);
  });

  it("a customer of another org is refused before any database read", async () => {
    const res = await choose({ organizationId: OTHER, assetId: VIDEO, coverAssetId: A1 }, { "x-ops-user-kind": "client", "x-ops-org-id": ORG });
    expect(res.status).toBe(403);
    expect(state.log.reads).toBe(0);
  });

  it("upload: rights must be confirmed, JPEG/PNG only, <= 2 MB, real bytes; then a chosen upload cover of that video", async () => {
    const jpeg = new Blob([new Uint8Array(JPEG)], { type: "image/jpeg" });
    expect(JPEG.length).toBeGreaterThan(100);
    expect((await upload({ organizationId: ORG, assetId: VIDEO }, jpeg)).status).toBe(400);
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, new Blob([new Uint8Array(JPEG)], { type: "image/gif" }))).status).toBe(415);
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, new Blob([new Uint8Array(3 * 1024 * 1024)], { type: "image/jpeg" }))).status).toBe(413);
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, new Blob([new Uint8Array(64)], { type: "image/jpeg" }))).status).toBe(422);
    // a signature with nothing behind it is not an image (Codex 63d19a26 F4)
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], { type: "image/jpeg" }))).status).toBe(422);
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, new Blob([new Uint8Array(PNG_SIG)], { type: "image/png" }))).status).toBe(422);
    // the byte shape of a PNG with nothing decodable inside (Codex 9bea8a27 F1), a cut-off JPEG, a JPEG declared as PNG
    const fakePng = Buffer.concat([Buffer.from(PNG_SIG), Buffer.from([0, 0, 0, 13]), Buffer.from("IHDR"), Buffer.alloc(30), Buffer.from([0, 0, 0, 0]), Buffer.from("IEND"), Buffer.alloc(4)]);
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, new Blob([new Uint8Array(fakePng)], { type: "image/png" }))).status).toBe(422);
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, new Blob([new Uint8Array(JPEG.subarray(0, JPEG.length - 40))], { type: "image/jpeg" }))).status).toBe(422);
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, new Blob([new Uint8Array(JPEG)], { type: "image/png" }))).status).toBe(422);
    // no length, or a declared length over the limit: refused before the body is read (Codex 63d19a26 F1)
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, jpeg, { length: null })).status).toBe(411);
    expect((await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, jpeg, { length: String(10 * 1024 * 1024) })).status).toBe(413);
    // another org's customer: refused before any database read
    const reads = state.log.reads;
    expect((await upload({ organizationId: OTHER, assetId: VIDEO, rightsConfirmed: "true" }, jpeg, { headers: { "x-ops-user-kind": "client", "x-ops-org-id": ORG } })).status).toBe(403);
    expect(state.log.reads).toBe(reads);
    expect((await upload({ organizationId: ORG, assetId: A0, rightsConfirmed: "true" }, jpeg)).status).toBe(404);
    expect(r2.puts).toEqual([]);
    const res = await upload({ organizationId: ORG, assetId: VIDEO, rightsConfirmed: "true" }, jpeg);
    expect(res.status).toBe(201);
    expect(state.log.inserts[0].row.metadata).toMatchObject({ coverOf: VIDEO, coverKind: "upload", rightsSources: [{ kind: "upload", rightsConfirmed: true }] });
    const json = await (await GET(new NextRequest(`http://localhost/api/video/cover?organizationId=${ORG}&assetIds=${VIDEO}`, { headers: staff }))).json();
    expect(json.covers[VIDEO].find((c: { chosen: boolean }) => c.chosen).kind).toBe("upload");
  });
});
