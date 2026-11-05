// video-workbench asset ingest (P6 D3): token deny paths fail closed, size/type guards, idempotency by the caller's key
// (not by bytes), and the request path never deletes a content-addressed object.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory media_assets enforcing the unique index the route relies on (uq_media_assets_org_backend_key_version,
// migrations 0011/0038) and eq filters; insertError forces any other insert failure (e.g. the asset_domain CHECK).
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: [] as Row[], insertError: null as null | { message: string }, inserts: [] as unknown[], db: true, beforeInsert: null as null | (() => void) }));
const r2 = vi.hoisted(() => ({ puts: [] as string[], deletes: [] as string[] }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => (state.db ? { from: () => {
    const filters: Array<[string, unknown]> = [];
    let insertRow: Row | null = null;
    let desc = "";
    // "metadata->>k" = PostgREST JSON path (text); is(k, null) = absent.
    const col = (r: Row, k: string) => (k.startsWith("metadata->>") ? (r.metadata as Row | undefined)?.[k.slice(11)] ?? null : r[k]);
    const match = (r: Row) => filters.every(([k, v]) => col(r, k) === v);
    const q = { select: () => q, limit: () => q,
      order: (k: string, o?: { ascending?: boolean }) => { if (o?.ascending === false) desc = k; return q; },
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      is: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      maybeSingle: async () => {
        const hits = state.rows.filter(match);
        if (desc) hits.sort((a, b) => Number(b[desc]) - Number(a[desc]));
        return { data: hits[0] ?? null, error: null };
      },
      insert: (row: Row) => { state.inserts.push(row); insertRow = row; return q; },
      single: async () => {
        const hook = state.beforeInsert; state.beforeInsert = null; hook?.();
        if (state.insertError) return { data: null, error: state.insertError };
        const row: Row = { id: `asset-${state.rows.length + 1}`, version: 1, ...insertRow };
        if (state.rows.some((r) => r.id === row.id)) row.id = `asset-${state.rows.length + 100}`;
        const clash = state.rows.some((r) => ["organization_id", "storage_backend", "object_key", "version"].every((k) => r[k] === row[k]));
        if (clash) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        state.rows.push(row);
        return { data: { id: row.id }, error: null };
      } };
    return q;
  } } : null),
}));
vi.mock("@/lib/storage/r2", () => ({
  isR2Configured: () => true,
  r2PutObject: async (_b: string, key: string) => { r2.puts.push(key); return { ok: true }; },
  r2DeleteObject: async (_b: string, key: string) => { r2.deletes.push(key); return { ok: true }; },
}));
import { POST } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 1)]);
const at = "http://next-admin:3000/api/internal/video/workbench/assets";
const post = (headers: Record<string, string>, body: Buffer = PNG) => POST(new Request(at, { method: "POST", body: new Uint8Array(body),
  headers: { "content-type": "image/png", "x-vw-org-id": ORG, "x-vw-origin": "ai_generated", ...headers } }));
const auth = { authorization: "Bearer right-token" };

beforeEach(() => {
  Object.assign(state, { rows: [], insertError: null, inserts: [], db: true, beforeInsert: null });
  Object.assign(r2, { puts: [], deletes: [] });
  vi.stubEnv("VW_INTERNAL_TOKEN", "right-token");
  vi.stubEnv("R2_VIDEO_PUBLIC_BASE", "https://videos.example");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/internal/video/workbench/assets", () => {
  it("VW_INTERNAL_TOKEN unset: even a bearer is refused (fail closed)", async () => {
    vi.stubEnv("VW_INTERNAL_TOKEN", "");
    expect((await post(auth)).status).toBe(401);
    expect((await post({ authorization: "Bearer " })).status).toBe(401);
  });

  it("no bearer or a wrong one is refused before anything is read or stored", async () => {
    expect((await post({})).status).toBe(401);
    expect((await post({ authorization: "Bearer wrong-token" })).status).toBe(401);
    expect((await post({ authorization: "right-token" })).status).toBe(401);
    expect([state.inserts.length, r2.puts.length]).toEqual([0, 0]);
  });

  it("refuses a bad org, origin, type, a body over the cap, and bytes that are not the declared type", async () => {
    expect((await post({ ...auth, "x-vw-org-id": "nope" })).status).toBe(400);
    expect((await post({ ...auth, "x-vw-origin": "wp_product" })).status).toBe(400);
    expect((await post({ ...auth, "content-type": "text/html" })).status).toBe(415);
    vi.stubEnv("VW_INGEST_MAX_BYTES", "10");
    expect((await post(auth)).status).toBe(413);
    vi.stubEnv("VW_INGEST_MAX_BYTES", "");
    expect((await post(auth, Buffer.alloc(24, 0))).status).toBe(422);
    expect(r2.puts).toEqual([]);
  });

  it("stores a new file under the org's checksum key and registers it", async () => {
    const res = await post(auth);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(r2.puts).toEqual([`video/workbench/${ORG}/${json.checksumSha256}.png`]);
    expect(state.inserts[0]).toMatchObject({ organization_id: ORG, asset_domain: "ai_generated", checksum_sha256: json.checksumSha256, metadata: { source: "video_workbench" } });
  });

  it("takes every media type the workbench produces (MOV render stays workbench_render); bytes of another type are refused", async () => {
    const box = (tag: string) => Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from(tag, "ascii"), Buffer.alloc(16, 2)]);
    const files: Array<[string, Buffer, string, string]> = [
      ["video/quicktime", box("ftypqt  "), "mov", "workbench_render"],
      ["video/webm", Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20, 3)]), "webm", "workbench_render"],
      ["audio/mp4", box("ftypM4A "), "m4a", "ai_generated"],
      ["image/gif", Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(18, 4)]), "gif", "real_footage"],
    ];
    for (const [type, bytes, ext, origin] of files) {
      const res = await post({ ...auth, "content-type": type, "x-vw-origin": origin }, bytes);
      expect(res.status, type).toBe(201);
      const json = await res.json();
      expect(r2.puts.at(-1), type).toBe(`video/workbench/${ORG}/${json.checksumSha256}.${ext}`);
      expect(state.inserts.at(-1), type).toMatchObject({ mime_type: type, asset_domain: origin });
    }
    expect((await post({ ...auth, "content-type": "video/quicktime" })).status).toBe(422);   // PNG bytes declared MOV
    expect((await post({ ...auth, "content-type": "application/x-bvh" })).status).toBe(415);   // non-media stays local
  });

  it("records a deliverable ratio in metadata and refuses any other value", async () => {
    const meta = (m: object) => ({ "x-vw-meta": Buffer.from(JSON.stringify(m)).toString("base64url") });
    expect((await post({ ...auth, ...meta({ ratio: "1x1" }) })).status).toBe(400);
    expect((await post({ ...auth, ...meta({ ratio: "16:9" }) })).status).toBe(400);
    expect(state.inserts).toEqual([]);
    expect((await post({ ...auth, ...meta({ ratio: "9x16" }) })).status).toBe(201);
    expect(state.inserts[0]).toMatchObject({ metadata: { ratio: "9x16" } });
  });

  it("same org + origin + checksum again returns the existing row and uploads nothing", async () => {
    const first = await (await post(auth)).json();
    const json = await (await post(auth)).json();
    expect([json.existing, json.assetId, r2.puts.length, state.inserts.length]).toEqual([true, first.assetId, 1, 1]);
  });

  it("the same bytes from another origin or job register their own row (origin, job) over the same object", async () => {
    const upload = await (await post({ ...auth, "x-vw-origin": "real_footage" })).json();
    const meta = (m: object) => Buffer.from(JSON.stringify(m)).toString("base64url");
    const ai = await post({ ...auth, "x-vw-meta": meta({ vwJobId: "job-1", costUsd: 0.04 }) });
    expect(ai.status).toBe(201);
    const aiJson = await ai.json();
    expect(aiJson.assetId).not.toBe(upload.assetId);
    const again = await (await post({ ...auth, "x-vw-meta": meta({ vwJobId: "job-1", costUsd: 0.04 }) })).json();
    expect([again.existing, again.assetId]).toEqual([true, aiJson.assetId]);   // a retry of job-1 is idempotent
    const other = await (await post({ ...auth, "x-vw-meta": meta({ vwJobId: "job-2" }) })).json();
    expect(other.assetId).not.toBe(aiJson.assetId);
    expect(state.rows.map((r) => [r.asset_domain, (r.metadata as Row).vwJobId ?? null, r.version, r.object_key])).toEqual([
      ["real_footage", null, 1, upload.objectUrl.replace("https://videos.example/", "")],
      ["ai_generated", "job-1", 2, upload.objectUrl.replace("https://videos.example/", "")],
      ["ai_generated", "job-2", 3, upload.objectUrl.replace("https://videos.example/", "")],
    ]);
    expect(r2.deletes).toEqual([]);
  });

  it("concurrent same-content uploads: the race loser returns the winner's row and never deletes the shared object", async () => {
    // The winner commits between the loser's checksum lookup and its insert.
    state.beforeInsert = () => { const r = state.inserts[0] as Row; state.rows.push({ ...r, id: "winner", version: 1 }); };
    const res = await post(auth);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect([json.existing, json.assetId]).toEqual([true, "winner"]);
    expect(r2.deletes).toEqual([]);
    expect(state.rows).toHaveLength(1);
  });

  it("a failed insert leaves the object: the request path never deletes a content-addressed key", async () => {
    state.insertError = { message: "violates check constraint" };
    expect((await post({ ...auth, "x-vw-origin": "workbench_render" })).status).toBe(502);
    expect(r2.puts).toHaveLength(1);
    expect(r2.deletes).toEqual([]);
  });
});
