// pollTopicVideo: the topic's own job only, and a prepare that died is not waited on forever.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Topic } from "../store";

const getJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/job-store", () => ({ readJob: getJob }));
const finalizeVideoJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/finalize", () => ({ finalizeVideoJob }));
const embedVideoInPost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/embed-in-post", () => ({ embedVideoInPost }));
const social = vi.hoisted(() => ({ getPost: vi.fn(), addVideo: vi.fn(), savePost: vi.fn(), listAccounts: vi.fn() }));
vi.mock("@/lib/social/store", () => social);

const { attachTopicVideo, pollTopicVideo, STALE_PREPARE_MS, topicTargets } = await import("../make");

const ORG = "11111111-1111-4111-8111-111111111111";
const t = { id: "a", organization_id: ORG } as Topic;

beforeEach(() => {
  for (const f of [getJob, finalizeVideoJob, embedVideoInPost, social.getPost, social.addVideo, social.savePost]) f.mockReset();
});

describe("pollTopicVideo", () => {
  it("refuses another organization's job before finishing it", async () => {
    getJob.mockResolvedValue({ id: "j", status: "running", organizationId: "22222222-2222-4222-8222-222222222222", euJobId: "e", createdAt: Date.now() });
    await expect(pollTopicVideo(t, "j")).rejects.toThrow("another organization");
    expect(finalizeVideoJob).not.toHaveBeenCalled();
  });

  it("a job still unsubmitted long after its prepare should have ended is an error, not running", async () => {
    getJob.mockResolvedValue({ id: "j", status: "running", organizationId: ORG, createdAt: Date.now() - STALE_PREPARE_MS - 1 });
    expect(await pollTopicVideo(t, "j")).toEqual({ state: "error", error: "影片準備做到一半中斷了" });
  });
});

describe("attachTopicVideo", () => {
  const URL = "https://cdn.example/v.mp4";
  const topic = { ...t, site_id: "s1", artifacts: { article: { wp_post_id: 9 }, social: { post_id: "p1" }, video: { job_id: "j" } } } as unknown as Topic;

  it("saves the URL, then the embed, before touching the social post; a post that already has media is not uploaded to again", async () => {
    const saved: Array<Record<string, unknown>> = [];
    embedVideoInPost.mockResolvedValue({ ok: true, postId: 9, videoUrl: URL });
    social.getPost.mockResolvedValue({ id: "p1", state: "draft", version: 3, media: [{ media_id: "m0", position: 0, alt_text: null }] });
    const out = await attachTopicVideo(topic, URL, "schedule:x", async (a) => { saved.push(structuredClone(a)); return true; });
    expect(saved.map((a) => a.video)).toEqual([
      { job_id: "j", url: URL },
      { job_id: "j", url: URL, embedded_at: expect.any(String) },
      { job_id: "j", url: URL, embedded_at: expect.any(String), media_id: "m0" },
    ]);
    expect(embedVideoInPost.mock.calls[0][1]).toMatchObject({ siteId: "s1", postId: 9, videoUrl: URL, once: true });
    expect(social.addVideo).not.toHaveBeenCalled();
    expect(out.artifacts.video).toMatchObject({ media_id: "m0" });
  });
});

describe("topicTargets (P7.2)", () => {
  it("a YouTube channel only when the topic chose youtube; the other channels only when it chose social", () => {
    expect(topicTargets(["article", "social", "video"], "youtube")).toBe(false);
    expect(topicTargets(["article", "youtube"], "youtube")).toBe(true);
    expect(topicTargets(["article", "youtube"], "facebook")).toBe(false);
    expect(topicTargets(["social", "youtube"], "facebook")).toBe(true);
  });
});
