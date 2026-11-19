// pollTopicVideo: the topic's own job only, and a prepare that died is not waited on forever.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Topic } from "../store";
import type { TickDeps } from "../tick";

const getJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/job-store", () => ({ readJob: getJob }));
const finalizeVideoJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/finalize", () => ({ finalizeVideoJob }));
const embedVideoInPost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/embed-in-post", () => ({ embedVideoInPost }));
const social = vi.hoisted(() => ({ getPost: vi.fn(), addVideo: vi.fn(), savePost: vi.fn(), listAccounts: vi.fn() }));
vi.mock("@/lib/social/store", () => social);
// N1: the workbench's review deps (project-advance-deps.ts) over an in-memory database of the topic's project and video.
const gate = vi.hoisted(() => ({ rows: vi.fn(), qaProblems: vi.fn(), release: vi.fn(), tables: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("@/lib/content/video/project-advance-deps", () => ({ advanceDeps: () => gate }));
vi.mock("@/lib/supabase-server", async () => {
  const { fakeDb } = await import("@/lib/content/video/__tests__/fake-db");
  const db = fakeDb(() => gate.tables);
  return { getSupabaseWriteClient: () => db };
});

const { attachTopicVideo, pollTopicVideo, socialBody, STALE_PREPARE_MS, topicTargets } = await import("../make");
const { MakeError, tickTopics } = await import("../tick");

const ORG = "11111111-1111-4111-8111-111111111111";
const t = { id: "a", organization_id: ORG } as Topic;
const URL = "https://cdn.example/v.mp4";
const ROWS = [{ id: "v169", ratio: "16x9", checksum: "c1" }, { id: "v916", ratio: "9x16", checksum: "c2" }];

beforeEach(() => {
  for (const f of [getJob, finalizeVideoJob, embedVideoInPost, social.getPost, social.addVideo, social.savePost, gate.rows, gate.qaProblems, gate.release]) f.mockReset();
  gate.tables = {
    media_production_projects: [{ id: "p1", organization_id: ORG, source: "content_topic", source_ref: "a", last_error: null }],
    media_assets: [{ id: "v169", organization_id: ORG, media_project_id: "p1", object_url: URL, is_current: true, mime_type: "video/mp4", created_at: "2026-11-19T00:00:00Z" }],
    media_releases: [],
  };
  gate.rows.mockResolvedValue(ROWS);
  gate.qaProblems.mockResolvedValue([]);
  gate.release.mockImplementation(async (r: { id: string; checksum: string }) => {
    gate.tables.media_releases.push({ id: `rel-${r.id}`, organization_id: ORG, candidate_asset_id: r.id, candidate_checksum: r.checksum, status: "release_approved" });
  });
});

/** One topic row behind tickTopics' store calls (moves guarded by status + version), with the real attachTopicVideo. */
function oneTopic(row: Topic) {
  const db = { row: { ...row } };
  const write = (cur: Topic, to: Topic["status"], patch: Partial<Topic> = {}) => {
    if (db.row.status !== cur.status || db.row.version !== cur.version) return null;
    db.row = { ...db.row, ...patch, status: to, version: db.row.version + 1 };
    return { ...db.row };
  };
  const deps: TickDeps = {
    now: () => new Date(), due: async () => [], blocker: async () => null, start: async () => null,
    inStatus: async (s) => (s.includes(db.row.status) ? [{ ...db.row }] : []),
    move: async (cur, to, patch) => write(cur, to, patch), claim: async (cur, patch) => write(cur, cur.status, patch ?? {}),
    make: async () => { throw new Error("not in this test"); }, autoPublishes: async () => false, publish: async () => { throw new Error("not in this test"); },
    startVideo: async () => {}, pollVideo: async () => ({ state: "done", url: URL }),
    attachVideo: (cur, url, save) => attachTopicVideo(cur, url, "schedule:x", save),
  };
  return { db, deps };
}

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
  const topic = { ...t, site_id: "s1", artifacts: { article: { wp_post_id: 9 }, social: { post_id: "p1" }, video: { job_id: "j" } } } as unknown as Topic;

  it("review passed: every ratio released, the embed carries the primary's Release; then the social post (media already there: not uploaded again)", async () => {
    const saved: Array<Record<string, unknown>> = [];
    embedVideoInPost.mockResolvedValue({ ok: true, postId: 9, videoUrl: URL });
    social.getPost.mockResolvedValue({ id: "p1", state: "draft", version: 3, media: [{ media_id: "m0", position: 0, alt_text: null }] });
    const out = await attachTopicVideo(topic, URL, "schedule:x", async (a) => { saved.push(structuredClone(a)); return true; });
    expect(saved.map((a) => a.video)).toEqual([
      { job_id: "j", url: URL },
      { job_id: "j", url: URL, embedded_at: expect.any(String) },
      { job_id: "j", url: URL, embedded_at: expect.any(String), media_id: "m0" },
    ]);
    expect(gate.release.mock.calls.map((c) => c[0].id)).toEqual(["v169", "v916"]);
    expect(embedVideoInPost.mock.calls[0][1]).toMatchObject({ siteId: "s1", postId: 9, videoUrl: URL, releaseId: "rel-v169", once: true });
    expect(social.addVideo).not.toHaveBeenCalled();
    expect(out.artifacts.video).toMatchObject({ media_id: "m0" });
  });

  it("review failed: the topic fails with the ratio and check in Chinese, nothing embedded or released, the project says why", async () => {
    gate.qaProblems.mockImplementation(async (r: { ratio: string }) => (r.ratio === "9x16" ? ["版權 QA未通過（素材來源不明）"] : []));
    const q = oneTopic({ ...topic, status: "waiting_video", version: 1, updated_at: new Date().toISOString() } as Topic);
    await tickTopics(q.deps);
    expect(q.db.row).toMatchObject({ status: "failed", last_error: "影片審片沒過，沒有嵌入：直式 9:16：版權 QA未通過（素材來源不明）", artifacts: { article: { wp_post_id: 9 }, video: { url: URL } } });
    expect(embedVideoInPost).not.toHaveBeenCalled();
    expect(social.addVideo).not.toHaveBeenCalled();
    expect(gate.release).not.toHaveBeenCalled();
    expect(gate.tables.media_production_projects[0].last_error).toBe(q.db.row.last_error);
  });

  it("codex finding: a social-only topic whose post already has media is still reviewed; failed = nothing recorded as attached", async () => {
    gate.qaProblems.mockResolvedValue(["編輯 QA未通過"]);
    social.getPost.mockResolvedValue({ id: "p1", state: "draft", version: 3, media: [{ media_id: "m0", position: 0, alt_text: null }] });
    const socialOnly = { ...t, site_id: "s1", artifacts: { social: { post_id: "p1" }, video: { job_id: "j" } } } as unknown as Topic;
    const err = await attachTopicVideo(socialOnly, URL, "schedule:x", async () => true).catch((e) => e);
    expect(err).toBeInstanceOf(MakeError);
    expect(err.message).toBe("影片審片沒過，沒有嵌入：橫式 16:9：編輯 QA未通過；直式 9:16：編輯 QA未通過");
    expect((err.artifacts.video as { media_id?: string }).media_id).toBeUndefined();
  });

  it("existing data: a topic already embedded goes on through the tick, not reviewed again, not embedded again", async () => {
    const q = oneTopic({ ...topic, status: "embedded", version: 4, updated_at: new Date().toISOString(),
      artifacts: { ...topic.artifacts, video: { job_id: "j", url: URL, embedded_at: "2026-11-18T00:00:00Z", media_id: "m0" } } } as unknown as Topic);
    await tickTopics(q.deps);
    expect(q.db.row.status).toBe("reviewed");
    expect(embedVideoInPost).not.toHaveBeenCalled();
    expect(gate.qaProblems).not.toHaveBeenCalled();
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

describe("socialBody: the draft's shared text is in the posts' language", () => {
  it("an English summary of a Chinese article falls back to the title (the 2026-10-29 draft)", () => {
    const title = "萬聖節親子活動：用變裝遊戲幫孩子認識情緒";
    expect(socialBody("萬聖節親子活動 can teach feelings, not just fun. Try 7 simple costume games", title, "繁體中文")).toBe(title);
    expect(socialBody("萬聖節親子活動不只是要糖果！用5個變裝情緒遊戲，陪孩子認出生氣。", title, "繁體中文")).toBe("萬聖節親子活動不只是要糖果！用5個變裝情緒遊戲，陪孩子認出生氣。");
    expect(socialBody(undefined, title, "繁體中文")).toBe(title);
  });
});
