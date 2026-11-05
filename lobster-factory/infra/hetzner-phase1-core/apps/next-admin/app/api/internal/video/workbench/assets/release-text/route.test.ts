// video-workbench release text: the words a render shows reach editorial + caption QA; wrong org / checksum / source refused.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: [] as Row[], updates: [] as Row[], rights: [] as unknown[], captions: [] as unknown[], rightsFail: false, captionFail: false }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => {
    const filters: Array<[string, unknown]> = [];
    let patch: Row | null = null;
    const find = () => state.rows.find((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      update: (p: Row) => { patch = p; return q; },
      maybeSingle: async () => ({ data: find() ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        const row = patch ? find() : null;
        if (row && patch) { Object.assign(row, patch); state.updates.push(patch); }
        resolve({ error: null });
      },
    };
    return q;
  } }),
}));
vi.mock("@/lib/content/video/editorial-rights-persist", () => ({
  persistEditorialRightsQa: async (_db: unknown, p: unknown) => { state.rights.push(p); if (state.rightsFail) return { ok: false, status: 502, error: "qa_report_insert_failed" }; return { ok: true, persisted: [{ qaKind: "editorial", status: "passed" }] }; },
}));
vi.mock("@/lib/content/video/caption-qa-persistence", () => ({
  persistAutomaticCaptionQa: async (p: unknown) => { state.captions.push(p); if (state.captionFail) return null; return { id: "cap-1", status: "passed" }; },
}));
import { POST } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ASSET = "aaaaaaaa-0000-4000-8000-000000000001";
const SHA = "a".repeat(64);
const good = { organizationId: ORG, assetId: ASSET, checksumSha256: SHA, title: "春季新品", script: "第一行\n第二行", captions: [{ startMs: 0, endMs: 1000, text: "第一行" }] };
const post = (body: unknown, headers: Record<string, string> = { authorization: "Bearer right-token" }) =>
  POST(new Request("http://next-admin:3000/api/internal/video/workbench/assets/release-text", { method: "POST", headers, body: JSON.stringify(body) }));

beforeEach(() => {
  Object.assign(state, { rows: [{ id: ASSET, organization_id: ORG, mime_type: "video/mp4", checksum_sha256: SHA, metadata: { source: "video_workbench", vwJobId: "j1", rightsSources: [] } }], updates: [], rights: [], captions: [], rightsFail: false, captionFail: false });
  vi.stubEnv("VW_INTERNAL_TOKEN", "right-token");
  vi.stubEnv("MEDIA_PRODUCTION_PERSISTENCE_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/internal/video/workbench/assets/release-text", () => {
  it("no bearer or a wrong one: 401, nothing written", async () => {
    expect((await post(good, {})).status).toBe(401);
    expect((await post(good, { authorization: "Bearer wrong" })).status).toBe(401);
    expect(state.updates).toEqual([]);
  });

  it("an asset of another organization is 404 and untouched", async () => {
    expect((await post({ ...good, organizationId: OTHER })).status).toBe(404);
    expect([state.updates, state.rights, state.captions]).toEqual([[], [], []]);
  });

  it("checksum mismatch is 409; a row not made by the workbench or not a video is refused", async () => {
    expect((await post({ ...good, checksumSha256: "b".repeat(64) })).status).toBe(409);
    state.rows[0].metadata = { source: "wp_product" };
    expect((await post(good)).status).toBe(403);
    state.rows[0].metadata = { source: "video_workbench" };
    state.rows[0].mime_type = "image/png";
    expect((await post(good)).status).toBe(422);
    expect(state.updates).toEqual([]);
  });

  it("writes title and script beside the other metadata, then runs editorial/rights and caption QA with the cues", async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(state.rows[0].metadata).toEqual({ source: "video_workbench", vwJobId: "j1", rightsSources: [], title: "春季新品", script: "第一行\n第二行" });
    expect(state.rights).toEqual([{ organizationId: ORG, candidateAssetId: ASSET, candidateChecksum: SHA }]);
    expect(state.captions).toEqual([{ organizationId: ORG, candidateAssetId: ASSET, candidateChecksum: SHA, captions: good.captions }]);
    expect((await post(good)).status).toBe(200);
    expect(state.updates).toHaveLength(1);   // the resend wrote no second update
  });

  it("QA persistence off is 503 (VW keeps it unsent and retries), nothing written", async () => {
    vi.stubEnv("MEDIA_PRODUCTION_PERSISTENCE_ENABLED", "false");
    expect((await post(good)).status).toBe(503);
    expect([state.updates, state.rights, state.captions]).toEqual([[], [], []]);
  });

  it("a QA report that was not stored is a failure, never ok", async () => {
    state.rightsFail = true;
    expect((await post(good)).status).toBe(502);
    state.rightsFail = false; state.captionFail = true;
    expect((await post(good)).status).toBe(502);
  });

  it("bad shapes are 400", async () => {
    for (const bad of [{ ...good, title: "x".repeat(201) }, { ...good, captions: [{ startMs: "0", endMs: 1, text: "a" }] }, { ...good, assetId: "nope" }, { ...good, script: 5 }])
      expect((await post(bad)).status).toBe(400);
  });
});
