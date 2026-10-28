// finalizeVideoJob: the core shared by the status route and the pipeline clock.
// Route-level behavior is covered by video-status-tenant.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoJob } from "@/lib/content/video/job-store";

const { finishJob } = vi.hoisted(() => ({ finishJob: vi.fn() }));
vi.mock("@/lib/content/video/job-store", () => ({ finishJob }));

const { pollRenderJob } = vi.hoisted(() => ({ pollRenderJob: vi.fn() }));
vi.mock("@/lib/content/video/render-client", () => ({ pollRenderJob }));

const { recordVideoAsset, cleanupVideoInputKeys, pickPrimaryOutput } = vi.hoisted(() => ({
  recordVideoAsset: vi.fn(),
  cleanupVideoInputKeys: vi.fn(),
  pickPrimaryOutput: vi.fn(),
}));
vi.mock("@/lib/content/blocks/video-pipeline", () => ({ recordVideoAsset, cleanupVideoInputKeys, pickPrimaryOutput }));

const { persistAutomaticTechnicalQa } = vi.hoisted(() => ({ persistAutomaticTechnicalQa: vi.fn() }));
vi.mock("@/lib/content/video/qa-persistence", () => ({ persistAutomaticTechnicalQa }));

const ORG = "11111111-1111-1111-1111-111111111111";

const { finalizeVideoJob } = await import("../finalize");

const runningJob = (over: Partial<VideoJob> = {}): VideoJob => ({
  id: "j1",
  status: "running",
  createdAt: 0,
  euJobId: "eu1",
  r2Keys: ["k1", "k2"],
  recordParams: { title: "T", sceneCount: 2, organizationId: ORG, formats: ["16x9"] },
  ...over,
});
const OUT = { "16x9": "https://cdn.example/16x9.mp4" };

beforeEach(() => {
  for (const m of [persistAutomaticTechnicalQa, finishJob, pollRenderJob, recordVideoAsset, cleanupVideoInputKeys, pickPrimaryOutput]) m.mockReset();
  pickPrimaryOutput.mockReturnValue(OUT["16x9"]);
  recordVideoAsset.mockResolvedValue(null);
});

describe("finalizeVideoJob", () => {
  it("done job: returns done, never polls", async () => {
    const video = { outputs: OUT, out_dir: "x" };
    const res = await finalizeVideoJob(runningJob({ status: "done", video, title: "T" }));
    expect(res).toEqual({ status: "done", video, title: "T" });
    expect(pollRenderJob).not.toHaveBeenCalled();
  });

  it("poll done with a wrong-size 16x9: error 502, job marked error, nothing recorded", async () => {
    pollRenderJob.mockResolvedValue({ status: "done", outputs: OUT, out_dir: "x", outputMeta: { "16x9": { width: 1280, height: 720 } } });
    const res = await finalizeVideoJob(runningJob());
    expect(res).toMatchObject({ status: "error", statusCode: 502 });
    expect(finishJob).toHaveBeenCalledWith("j1", expect.objectContaining({ status: "error", statusCode: 502 }));
    expect(recordVideoAsset).not.toHaveBeenCalled();
  });

  it("poll done valid: job marked done+recorded, input keys cleaned", async () => {
    pollRenderJob.mockResolvedValue({ status: "done", outputs: OUT, out_dir: "x", outputMeta: { "16x9": { width: 1920, height: 1080 } } });
    const job = runningJob();
    const res = await finalizeVideoJob(job);
    expect(res).toMatchObject({ status: "done", title: "T" });
    expect(finishJob).toHaveBeenCalledWith("j1", expect.objectContaining({ status: "done", recorded: true }));
    expect(cleanupVideoInputKeys).toHaveBeenCalledWith(job.r2Keys);
  });

  it("a render of a project records the asset under that project", async () => {
    pollRenderJob.mockResolvedValue({ status: "done", outputs: OUT, out_dir: "x", outputMeta: { "16x9": { width: 1920, height: 1080 } } });
    await finalizeVideoJob(runningJob({ recordParams: { title: "T", sceneCount: 2, organizationId: ORG, projectId: "p1" } }));
    expect(recordVideoAsset).toHaveBeenCalledWith(expect.objectContaining({ mediaProjectId: "p1" }));
  });

  it("two ratios: technical QA is persisted once per ratio row, against that row's checksum", async () => {
    const out2 = { ...OUT, "9x16": "https://cdn.example/9x16.mp4" };
    const meta = { "16x9": { width: 1920, height: 1080 }, "9x16": { width: 1080, height: 1920 } };
    pollRenderJob.mockResolvedValue({ status: "done", outputs: out2, out_dir: "x", outputMeta: meta });
    recordVideoAsset.mockResolvedValue({ id: "a1", checksumSha256: "c1", rows: [
      { format: "16x9", id: "a1", url: out2["16x9"], checksumSha256: "c1" },
      { format: "9x16", id: "a2", url: out2["9x16"], checksumSha256: "c2" },
    ] });
    await finalizeVideoJob(runningJob());
    expect(persistAutomaticTechnicalQa).toHaveBeenCalledTimes(2);
    expect(persistAutomaticTechnicalQa).toHaveBeenNthCalledWith(2, expect.objectContaining({
      candidateAssetId: "a2", candidateChecksum: "c2", outputs: { "9x16": out2["9x16"] }, outputMeta: { "9x16": meta["9x16"] },
    }));
  });
});
