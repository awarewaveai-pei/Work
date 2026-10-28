// V4.8: caption reburn is tenant-scoped, never changes bytes under a Release, and a finished job re-pins QA to the new checksum.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
const submitCaptionReburn = vi.hoisted(() => vi.fn());
const pollRenderJob = vi.hoisted(() => vi.fn());
const persistTech = vi.hoisted(() => vi.fn());
const persistCaption = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
vi.mock("@/lib/content/video/render-client", () => ({ submitCaptionReburn, pollRenderJob }));
vi.mock("@/lib/content/video/qa-persistence", () => ({ persistAutomaticTechnicalQa: persistTech }));
vi.mock("@/lib/content/video/caption-qa-persistence", () => ({ persistAutomaticCaptionQa: persistCaption }));

import { POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001";
const other = "123e4567-e89b-42d3-a456-426614174009";
const id = "123e4567-e89b-42d3-a456-426614174002";
const url = "https://v.example.com/video/dir/16x9.mp4";
const row = (orgId: string) => ({ id, organization_id: orgId, object_key: "video/dir/16x9.mp4", object_url: url, metadata: { cleanUrl: "https://v.example.com/videoclean/dir/16x9.mp4" } });
const cues = [{ startMs: 0, endMs: 1000, text: "hi" }];

function fakeDb(tables: Record<string, unknown>) {
  const update = vi.fn();
  const chain = (table: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: tables[table] ?? null, error: null });
    q.then = (resolve: (v: unknown) => void) => resolve({ data: Array.isArray(tables[table]) ? tables[table] : [], error: null });
    q.update = (v: unknown) => { update(v); return q; };
    return q;
  };
  return { db: { from: chain }, update };
}
const client = (u: string, init?: RequestInit) => new NextRequest(u, { ...init, headers: { "content-type": "application/json", "x-ops-claims-role": "owner", "x-ops-user-kind": "client", "x-ops-org-id": org } });
const post = () => POST(client("http://localhost/api/video/captions/reburn", { method: "POST", body: JSON.stringify({ assetId: id, cues }) }));

beforeEach(() => vi.clearAllMocks());

describe("/api/video/captions/reburn", () => {
  it("POST refuses another organization's video and a video that already has a Release; submits nothing", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb({ media_assets: row(other) }).db);
    expect((await post()).status).toBe(403);
    getSupabaseWriteClient.mockReturnValue(fakeDb({ media_assets: row(org), media_releases: [{ id: "r1" }] }).db);
    expect((await post()).status).toBe(409);
    expect(submitCaptionReburn).not.toHaveBeenCalled();
  });

  it("POST submits one job per ratio that kept a caption-less video", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb({ media_assets: row(org), media_releases: [] }).db);
    submitCaptionReburn.mockResolvedValue({ ok: true, jobId: "j1" });
    const res = await post();
    expect(res.status).toBe(202);
    expect(submitCaptionReburn).toHaveBeenCalledWith({ cleanUrl: "https://v.example.com/videoclean/dir/16x9.mp4", format: "16x9", objectKey: "video/dir/16x9.mp4", cues });
  });

  it("finish (jobId): row takes the new checksum and both QA kinds run on it; another video's job is refused", async () => {
    const { db, update } = fakeDb({ media_assets: row(org) });
    getSupabaseWriteClient.mockReturnValue(db);
    const meta = { width: 1920, height: 1080, byteSize: 9, checksumSha256: "a".repeat(64) };
    const done = (outUrl: string) => ({ status: "done", outputs: { "16x9": outUrl }, out_dir: "video/dir", outputMeta: { "16x9": meta }, captions: { source: "script_tts", cues, srt: "s", vtt: "v" } });
    const get = () => POST(client("http://localhost/api/video/captions/reburn", { method: "POST", body: JSON.stringify({ assetId: id, jobId: "j1" }) }));
    pollRenderJob.mockResolvedValue(done("https://v.example.com/video/other/16x9.mp4"));
    expect((await get()).status).toBe(409);
    expect(update).not.toHaveBeenCalled();
    pollRenderJob.mockResolvedValue(done(url));
    expect((await get()).status).toBe(200);
    expect(update.mock.calls[0][0]).toMatchObject({ checksum_sha256: "a".repeat(64), metadata: { captionCues: cues } });
    expect(persistTech).toHaveBeenCalledWith(expect.objectContaining({ candidateChecksum: "a".repeat(64) }));
    expect(persistCaption).toHaveBeenCalledWith(expect.objectContaining({ candidateChecksum: "a".repeat(64), captions: cues }));
  });
});
