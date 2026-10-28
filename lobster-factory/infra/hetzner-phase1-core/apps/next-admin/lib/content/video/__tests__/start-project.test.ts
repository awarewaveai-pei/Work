// V7.1: the project a topic's video belongs to goes into the job's recordParams, so finalize records the render to it; a project that could not be made does not stop the video.
import { beforeEach, describe, expect, it, vi } from "vitest";

const finishJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/job-store", () => ({ createJob: async () => ({ id: "j1" }), finishJob, updateJobStep: async () => {} }));
vi.mock("@/lib/content/blocks/register-all", () => ({}));
vi.mock("@/lib/content/blocks/video-pipeline", () => ({ cleanupVideoInputKeys: async () => {} }));
vi.mock("@/lib/content/blocks/registry", () => ({ byId: () => ({ run: async () => ({ ok: true, euJobId: "e1", r2Keys: [], title: "t", sceneCount: 1 }) }) }));

const { startVideoJob } = await import("../start");
const input = { topic: "t", language: "繁體中文", brandVoice: "" };

beforeEach(() => finishJob.mockReset());

describe("startVideoJob projectFor", () => {
  it("records the project id with the running job", async () => {
    expect(await startVideoJob("o1", input, { projectFor: async () => "p1" })).toEqual({ ok: true, jobId: "j1" });
    expect(finishJob).toHaveBeenCalledWith("j1", expect.objectContaining({ status: "running", recordParams: expect.objectContaining({ projectId: "p1" }) }));
  });

  it("a project that failed to be made is logged and the video still starts, without a project id", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await startVideoJob("o1", input, { projectFor: async () => { throw new Error("db down"); } })).ok).toBe(true);
    expect(finishJob.mock.calls[0][1].recordParams.projectId).toBeUndefined();
  });
});
