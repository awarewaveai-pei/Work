// Plan U7: the workbench's 重燒字幕 (Bearer) -- an edited line is burned and the video row then carries the new captions
// (what GET /api/video/subtitles answers); another org's video is refused before any render call.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
const submitCaptionReburn = vi.hoisted(() => vi.fn());
const pollRenderJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
vi.mock("@/lib/content/video/render-client", () => ({ submitCaptionReburn, pollRenderJob }));
vi.mock("@/lib/content/video/qa-persistence", () => ({ persistAutomaticTechnicalQa: vi.fn() }));
vi.mock("@/lib/content/video/caption-qa-persistence", () => ({ persistAutomaticCaptionQa: vi.fn() }));

import { POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001", other = "123e4567-e89b-42d3-a456-426614174009", id = "123e4567-e89b-42d3-a456-426614174002";
const row = (orgId: string) => ({ id, organization_id: orgId, object_key: "video/dir/16x9.mp4", object_url: "https://v.example.com/video/dir/16x9.mp4", metadata: { cleanUrl: "https://v.example.com/videoclean/dir/16x9.mp4", captionSrt: "1\n00:00:00,000 --> 00:00:01,500\n舊的第一句\n" } });
const edited = [{ startMs: 0, endMs: 1500, text: "改過的第一句" }];

function fakeDb(asset: unknown) {
  const update = vi.fn();
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: asset, error: null });
  q.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  q.update = (v: unknown) => { update(v); return q; };
  return { db: { from: () => q }, update };
}
const call = (body: unknown, token = "internal-secret") => POST(new Request("http://localhost/api/internal/video/workbench/caption-reburn", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("VW_INTERNAL_TOKEN", "internal-secret"); });

describe("POST /api/internal/video/workbench/caption-reburn", () => {
  it("another org's video or a wrong token: refused, nothing submitted", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(row(other)).db);
    expect((await call({ organizationId: org, assetId: id, cues: edited })).status).toBe(404);
    expect((await call({ organizationId: org, assetId: id, cues: edited }, "wrong")).status).toBe(401);
    expect(submitCaptionReburn).not.toHaveBeenCalled();
  });

  it("one edited line -> burned; when done the row carries the new captions", async () => {
    const { db, update } = fakeDb(row(org));
    getSupabaseWriteClient.mockReturnValue(db);
    submitCaptionReburn.mockResolvedValue({ ok: true, jobId: "j1" });
    const started = await call({ organizationId: org, assetId: id, cues: edited });
    expect(started.status).toBe(202);
    expect(submitCaptionReburn).toHaveBeenCalledWith(expect.objectContaining({ cues: edited, format: "16x9" }));
    const srt = "1\n00:00:00,000 --> 00:00:01,500\n改過的第一句\n";
    pollRenderJob.mockResolvedValue({ status: "done", outputs: { "16x9": "https://v.example.com/videorev/dir/0a1b2c3d/16x9.mp4" }, out_dir: "video/dir", outputMeta: { "16x9": { checksumSha256: "a".repeat(64), byteSize: 9 } }, captions: { source: "script_tts", cues: edited, srt, vtt: "WEBVTT" } });
    expect((await call({ organizationId: org, assetId: id, jobId: "j1" })).status).toBe(200);
    expect(update.mock.calls[0][0]).toMatchObject({ metadata: { captionSrt: srt, captionCues: edited } });
  });
});
