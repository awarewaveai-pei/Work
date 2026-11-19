// B26 part 2: a resume that declares a re-render never lets auto-advance take the earlier cut (A), and the social drafts follow
// a re-rendered cut (B). A = the guard that keeps an old video from being reviewed, approved and sent out.
import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ posts: {} as Record<string, { id: string; version: number; state: string; targets: Array<{ state: string }>; media: Array<{ media_id: string; position?: number; alt_text: string | null }> }>, saves: [] as unknown[][], uploads: 0, getPostCalls: 0 }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({}), runForOrg: async (_o: string, _a: string, fn: () => unknown) => fn() }));
vi.mock("@/lib/social/store", () => ({
  listAccounts: async () => [],
  getPost: async (_org: string, id: string) => { store.getPostCalls++; return store.posts[id]; },
  addVideo: async () => ({ id: "media-new-" + ++store.uploads }),
  savePost: async (...args: unknown[]) => { store.saves.push(args); return { id: args[1], version: 2 }; },
}));
vi.mock("../job-store", () => ({ readJob: async (id: string) => ({ id, recordParams: { formats: ["16x9"] } }) }));
vi.mock("../finalize", () => ({ finalizeVideoJob: async () => ({ status: "done" }) }));
vi.mock("../social-drafts-deps", () => ({ draftDeps: () => ({ releases: async () => [{ releaseId: "rel", ratio: "16x9", videoUrl: "https://r2/a-new.mp4", coverUrl: null }] }) }));
import { fakeDb } from "./fake-db";
import { advanceDeps } from "../project-advance-deps";
import { advanceProject } from "../project-advance";

const MARK = "2026-11-19T10:00:00.000Z";
const asset = (id: string, at: string, sum: string) => ({ id, organization_id: "org", media_project_id: "p", is_current: true, mime_type: "video/mp4", object_url: `https://r2/${id}.mp4`, checksum_sha256: sum, metadata: { ratio: "16x9" }, created_at: at });
const project = (brief: Record<string, unknown>) => ({ id: "p", organization_id: "org", autonomy: "auto_after_render", updated_at: "2026-11-19T09:30:00.000Z", brief_json: brief });
const budget = { runId: "r1", budgetTwd: 20, spentTwd: 1, renderRatios: ["16x9"], startedAt: "2026-11-19T08:00:00.000Z" };
const advance = (tables: Record<string, Array<Record<string, unknown>>>) => {
  const d = advanceDeps(fakeDb(() => tables) as never, "org", "actor");
  const spies = { qaProblems: vi.fn(async () => [] as string[]), release: vi.fn(async () => {}), drafts: vi.fn(async () => "草稿") };
  const deps = { ...d, ...spies, update: vi.fn(async () => {}) };
  return { spies, run: () => advanceProject(deps, { id: "p", organizationId: "org", title: "t", updatedAtMs: Date.now(), runId: "r1" }) };
};
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-19T10:30:00.000Z")); store.saves = []; store.uploads = 0; store.getPostCalls = 0; store.posts = {}; });

describe("A: resume with rerender -> only a cut made after it counts", () => {
  const oldJob = { id: "j-old", organization_id: "org", record_params: { projectId: "p", autoRunId: "r1" }, created_at: "2026-11-19T09:00:00.000Z" };
  const marked = { autoBudget: budget, autoRerender: { runId: "r1", at: MARK } };

  it("the new cut has not arrived: waiting, the earlier cut is not reviewed, approved or drafted", async () => {
    const { run, spies } = advance({ media_production_projects: [project(marked)], video_jobs: [oldJob], media_assets: [asset("a-old", "2026-11-19T09:05:00.000Z", "s-old")] });
    expect(await run()).toMatchObject({ result: "waiting" });
    expect(spies.qaProblems).not.toHaveBeenCalled();
    expect(spies.release).not.toHaveBeenCalled();
    expect(spies.drafts).not.toHaveBeenCalled();
  });

  it("render sent after the mark and finished: the NEW cut (and only it) goes on to review and Release", async () => {
    const { run, spies } = advance({ media_production_projects: [project(marked)], video_jobs: [oldJob, { ...oldJob, id: "j-new", created_at: "2026-11-19T10:01:00.000Z" }],
      media_assets: [asset("a-old", "2026-11-19T09:05:00.000Z", "s-old"), asset("a-new", "2026-11-19T10:03:00.000Z", "s-new")] });
    expect(await run()).toMatchObject({ result: "done" });
    expect(spies.release.mock.calls.map((c) => (c as unknown as [{ id: string }])[0].id)).toEqual(["a-new"]);
  });

  it("another run's mark is ignored (a new run is not held back by an older resume)", async () => {
    const { run, spies } = advance({ media_production_projects: [project({ autoBudget: budget, autoRerender: { runId: "other-run", at: MARK } })], video_jobs: [oldJob], media_assets: [asset("a-old", "2026-11-19T09:05:00.000Z", "s-old")] });
    expect(await run()).toMatchObject({ result: "done" });
    expect(spies.release).toHaveBeenCalledTimes(1);
  });
});

describe("B: the drafts follow a re-rendered cut", () => {
  const rows = [{ id: "a-new", ratio: "16x9", checksum: "s-new" }];
  const post = (state = "draft", targets: string[] = []) => ({ id: "po1", version: 1, state, targets: targets.map((s) => ({ state: s })), media: [{ media_id: "media-old", position: 0, alt_text: "標題" }, { media_id: "media-user", position: 1, alt_text: null }] });
  const tables = (autoDrafts: unknown) => ({ media_production_projects: [project({ autoBudget: budget, autoDrafts })], media_assets: [asset("a-new", "2026-11-19T10:03:00.000Z", "s-new")] });
  const drafts = (t: ReturnType<typeof tables>) => advanceDeps(fakeDb(() => t) as never, "org", "actor").drafts({ id: "p", organizationId: "org", title: "t", updatedAtMs: 0, runId: "r1" }, rows);
  const record = { at: "2026-11-19T09:40:00.000Z", count: 1, posts: [{ postId: "po1", ratio: "16x9", checksum: "s-old", mediaId: "media-old" }] };

  it("cut changed: the draft's media is swapped to the new cut, once (run twice -> one upload, one save)", async () => {
    store.posts.po1 = post();
    const t = tables(record);
    expect(await drafts(t)).toContain("1 個社群草稿換成新版影片");
    expect(store.uploads).toBe(1);
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0].slice(1, 3)).toEqual(["po1", 1]);
    expect(store.saves[0][5]).toEqual([{ media_id: "media-new-1", position: 0, alt_text: "標題" }, { media_id: "media-user", position: 1, alt_text: null }]); // only the draft's own video is replaced
    expect((t.media_production_projects[0].brief_json as { autoDrafts: { posts: unknown[] } }).autoDrafts.posts).toEqual([{ postId: "po1", ratio: "16x9", checksum: "s-new", mediaId: "media-new-1" }]);
    expect(await drafts(t)).toBe("社群草稿先前已建立");
    expect(store.saves).toHaveLength(1);
    expect(store.uploads).toBe(1);
  });

  it("the swap went through but the record was not saved: the next run settles it from the post, no second swap, the new media is remembered", async () => {
    store.posts.po1 = post();
    const t = tables(record);
    const real = fakeDb(() => t) as never;
    let writes = 0;
    const flaky = { ...(real as object), from: (table: string) => { const q = (real as { from: (t: string) => { update: (p: unknown) => unknown } }).from(table); const upd = q.update.bind(q); q.update = (patch: unknown) => { if (table === "media_production_projects" && ++writes === 2) throw new Error("record write failed"); return upd(patch); }; return q; } };
    await expect(advanceDeps(flaky as never, "org", "actor").drafts({ id: "p", organizationId: "org", title: "t", updatedAtMs: 0, runId: "r1" }, rows)).rejects.toThrow("record write failed");
    store.posts.po1 = { ...store.posts.po1, media: [{ media_id: "media-new-1", position: 0, alt_text: "標題" }, { media_id: "media-user", position: 1, alt_text: null }] }; // what the swap left on the post
    expect(await drafts(t)).toBe("社群草稿先前已建立");
    expect(store.saves).toHaveLength(1);
    expect((t.media_production_projects[0].brief_json as { autoDrafts: { posts: unknown[] } }).autoDrafts.posts).toEqual([{ postId: "po1", ratio: "16x9", checksum: "s-new", mediaId: "media-new-1" }]);
  });

  it("a post that already went out is not touched; it is remembered and named, once", async () => {
    store.posts.po1 = post("queued", ["queued"]);
    const t = tables(record);
    expect(await drafts(t)).toBe("已發布的 1 則貼文用的是舊版影片");
    expect(store.saves).toHaveLength(0);
    expect(store.uploads).toBe(0);
    expect((t.media_production_projects[0].brief_json as { autoDrafts: { posts: Array<{ kept?: string }> } }).autoDrafts.posts[0]).toMatchObject({ checksum: "s-old", kept: "s-new" });
    store.getPostCalls = 0;
    expect(await drafts(t)).toBe("社群草稿先前已建立"); // a repeat reads nothing and touches nothing
    expect(store.getPostCalls).toBe(0);
  });

  it("an old record ({at,count}, no cut recorded) is unknown: nothing rebuilt, nothing read, no error", async () => {
    const t = tables({ at: "2026-11-19T09:40:00.000Z", count: 2 });
    expect(await drafts(t)).toBe("社群草稿先前已建立");
    expect(store.getPostCalls).toBe(0);
    expect(store.saves).toHaveLength(0);
  });
});
