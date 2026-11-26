// K30: a topic with a video always goes to YouTube (no YouTube format of its own) and the article never holds the video
// file: only YouTube's player, put in once YouTube is live. Through the real makeDrafts and the real publish (tick.ts
// continuePublishing -> make.ts publishDrafts -> publish-steps.ts) over an in-memory social store. A row stored with the
// old "youtube" reads as "video"; a brand with no YouTube channel stops the topic (failed, the schedule's stop notice)
// with nothing sent, and 重試 after connecting goes on from the YouTube draft; a topic made before K30 (file in the
// article, no YouTube draft) gets its draft before its first step and the file is swapped for the player.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Topic } from "../store";
import type { PostRow } from "@/lib/social/store";

const s = vi.hoisted(() => ({ posts: new Map<string, PostRow>(), accounts: [] as Array<{ id: string; platform: string; status: string }>, calls: [] as string[], uploads: 0, next: 0 }));
vi.mock("@/lib/social/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/social/store")>()),
  listAccounts: async () => s.accounts,
  accountPlatforms: async (_org: string, ids: string[]) => new Map(ids.map((id) => [id, id === "a-yt" ? "youtube" : "x"])),
  getPost: async (_org: string, id: string) => structuredClone(s.posts.get(id)!),
  addVideo: async () => { s.uploads++; return { id: `m-new-${s.uploads}` }; },
  savePost: async (_org: string, id: string | null, _v: number | null, fields: Record<string, unknown>,
    targets: Array<{ account_id: string; custom_body: string | null; format?: string }> | null, media: Array<{ media_id: string }> | null) => {
    const pid = id ?? `p${++s.next}`;
    const p: PostRow = s.posts.get(pid) ?? ({ id: pid, state: "draft", body: "", version: 0, targets: [], media: [], comments: [] } as unknown as PostRow);
    const next = { ...p, ...fields, version: p.version + 1 } as PostRow;
    if (targets) next.targets = targets.map((x) => ({ id: `t-${x.account_id}`, account_id: x.account_id, custom_body: x.custom_body, format: x.format ?? "post",
      state: "draft", postiz_post_id: null, release_url: null, error: null })) as PostRow["targets"];
    if (media) next.media = media as PostRow["media"];
    s.posts.set(pid, next);
    return { id: pid, version: next.version };
  },
}));
vi.mock("@/lib/social/actions", () => ({
  applyAction: async (_org: string, p: PostRow) => { s.calls.push(`send:${p.id}`); s.posts.set(p.id, { ...s.posts.get(p.id)!, state: "scheduled" }); return { state: "scheduled" }; },
}));
vi.mock("@/lib/social/review", () => ({ requiresReview: async () => false }));
vi.mock("@/lib/social/write-posts", async (orig) => ({
  ...(await orig<typeof import("@/lib/social/write-posts")>()),
  writeSocialPosts: async (input: { keys: string[] }) => ({ posts: Object.fromEntries(input.keys.map((k) => [k, `${k} 的標題\n\n${k} 的說明`])), tooLong: [], missing: [], wrongLanguage: [], language: "zh-TW" }),
}));
vi.mock("@/lib/social/write-posts-claude", () => ({ claudeWriter: async () => ({ ask: async () => "", spent: { usd: 0 } }) }));
vi.mock("@/lib/entitlements/grant", () => ({ runForOrg: (_o: string, _a: string, fn: () => unknown) => fn(), grantFor: async () => ({}) }));
vi.mock("../budget", async (orig) => ({ ...(await orig<typeof import("../budget")>()), spentSince: async () => 0 }));
const wp = vi.hoisted(() => ({ updateWpPost: vi.fn() }));
vi.mock("@/lib/content/publish/wp-post-core", () => wp);
const embed = vi.hoisted(() => ({ swapEmbeddedVideo: vi.fn(), embedVideoInPost: vi.fn() }));
vi.mock("@/lib/content/video/embed-in-post", () => embed);
const pipeline = vi.hoisted(() => ({ runContentPipeline: vi.fn() }));
vi.mock("@/lib/content/pipeline", () => pipeline);
vi.mock("@/lib/content/brand-voice-store", () => ({
  loadSiteBrand: async (_sb: unknown, siteId: string) => ({ siteId, organizationId: ORG, name: "s", defaults: { publishMode: "ai_review_auto" } }),
}));

const { topicDeps, NO_YOUTUBE_TEXT } = await import("../make");
const { continuePublishing, makeStarted } = await import("../tick");
const { topicById } = await import("../store");
const { withTopicStopNotices } = await import("@/lib/schedules/stop-notice");

const ORG = "11111111-1111-4111-8111-111111111111";
const FILE = "https://cdn.example/v.mp4";
const YT = "https://www.youtube.com/watch?v=abc123";
const ARTICLE = { wp_post_id: 5, required: [], summary: "摘要", source: "內文", checks: [{ name: "title_spacing", pass: true, detail: "" }] };
const topic = (over: Partial<Topic> = {}): Topic => ({
  id: "a", organization_id: ORG, site_id: "s1", title: "題目", keyword: "k", angle: null, source: "manual", source_ref: {},
  month: "2026-11-01", scheduled_for: null, formats: ["article", "video"], status: "generating", review: null, artifacts: { article: ARTICLE },
  version: 3, last_error: null, started_on: "2026-11-26", created_by: "staff:x", created_at: "2026-11-26T00:00:00Z", updated_at: "2026-11-26T00:00:00Z", ...over,
});
function deps(start: Topic) {
  const db = { row: { ...start } };
  const write = (cur: Topic, to: Topic["status"], patch: Partial<Topic> = {}) => {
    if (db.row.status !== cur.status || db.row.version !== cur.version) return null;
    db.row = { ...db.row, ...patch, status: to, version: db.row.version + 1 };
    return { ...db.row };
  };
  return { db, d: { ...topicDeps({} as never, ORG, "schedule:x", { capTwd: null }),
    move: async (cur: Topic, to: Topic["status"], patch?: Partial<Topic>) => write(cur, to, patch),
    claim: async (cur: Topic, patch?: { artifacts: Record<string, unknown> }) => write(cur, cur.status, patch ?? {}) } };
}
const youtubeDrafts = () => [...s.posts.values()].filter((p) => p.targets.some((x) => x.account_id === "a-yt"));
const goLive = (id: string) => s.posts.set(id, { ...s.posts.get(id)!, targets: s.posts.get(id)!.targets.map((x) => ({ ...x, release_url: YT })) });
/** The legacy row as PostgREST returns it, read through the store (the only way rows reach the pipeline). */
const readRow = (raw: Record<string, unknown>) =>
  topicById({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: raw, error: null }) }) }) }) } as never, "a");
const REVIEWED = { pass: true, checks: [], at: "2026-11-26T00:00:00Z" };

beforeEach(() => {
  s.posts.clear(); s.calls.length = 0; s.uploads = 0; s.next = 0;
  s.accounts = [{ id: "a-yt", platform: "youtube", status: "connected" }, { id: "a-x", platform: "x", status: "connected" }];
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  pipeline.runContentPipeline.mockReset();
  wp.updateWpPost.mockReset();
  wp.updateWpPost.mockImplementation(async () => { s.calls.push("publish"); return { ok: true, post: { status: "publish", link: "https://wp.example/a" } }; });
  embed.swapEmbeddedVideo.mockReset();
  embed.swapEmbeddedVideo.mockImplementation(async () => { s.calls.push("swap"); return { ok: true, postId: 5, swapped: true }; });
  embed.embedVideoInPost.mockReset();
  embed.embedVideoInPost.mockImplementation(async () => { s.calls.push("embed"); return { ok: true, postId: 5, videoUrl: YT }; });
});

describe("K30 making", () => {
  it("article + video (no social): one YouTube draft, no other channel's draft, review passes", async () => {
    const made = await deps(topic()).d.make(topic());
    const social = (made.artifacts as { social: { post_id: string | null; youtube_post_id?: string } }).social;
    expect(social.post_id).toBeNull();
    expect(youtubeDrafts()).toHaveLength(1);
    expect(social.youtube_post_id).toBe(youtubeDrafts()[0].id);
    expect(s.posts.size).toBe(1);
    expect(made.review.pass).toBe(true);
  });

  it("a stored row with the old \"youtube\" (alone or beside \"video\") reads as \"video\" and makes one YouTube draft", async () => {
    for (const formats of [["article", "social", "video", "youtube"], ["article", "youtube"]]) {
      s.posts.clear();
      const t = (await readRow({ ...topic(), formats }))!;
      expect(t.formats).toEqual(formats.includes("social") ? ["article", "social", "video"] : ["article", "video"]);
      await deps(t).d.make(t);
      expect(youtubeDrafts()).toHaveLength(1);
    }
  });

  it("no YouTube channel: the topic fails before anything is made, the stop notice names it; 重試 after connecting makes only the YouTube draft", async () => {
    s.accounts = [{ id: "a-x", platform: "x", status: "connected" }];
    const started = topic({ formats: ["article", "social", "video"], artifacts: {} });
    const notices: Array<{ title: string }> = [];
    const { db, d } = deps(started);
    expect(await d.blocker(started)).toBe(NO_YOUTUBE_TEXT);   // the schedule returns it before using a daily slot
    expect(await makeStarted(withTopicStopNotices(d, async (n) => { notices.push(n); }), started)).toBe("failed");
    expect(db.row.last_error).toBe(NO_YOUTUBE_TEXT);
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toContain(NO_YOUTUBE_TEXT);
    expect(pipeline.runContentPipeline).not.toHaveBeenCalled();
    expect(s.posts.size).toBe(0);

    // a topic stopped later (its article and other posts made before K30), retried once YouTube is connected
    s.accounts.push({ id: "a-yt", platform: "youtube", status: "connected" });
    const other = "p-old";
    s.posts.set(other, { id: other, state: "draft", body: "", version: 1, media: [], comments: [],
      targets: [{ id: "t-a-x", account_id: "a-x", custom_body: "x", format: "post", state: "draft", postiz_post_id: null, release_url: null, error: null }] } as unknown as PostRow);
    const retried = topic({ formats: ["article", "social", "video"], artifacts: { article: ARTICLE, social: { post_id: other, checks: [] } } });
    const made = await deps(retried).d.make(retried);
    expect(pipeline.runContentPipeline).not.toHaveBeenCalled();
    expect((made.artifacts as { social: { post_id: string; youtube_post_id?: string } }).social).toMatchObject({ post_id: other, youtube_post_id: youtubeDrafts()[0].id });
    expect(s.posts.size).toBe(2);
  });
});

describe("K30 publishing", () => {
  it("made under K30: YouTube goes out first; once live its player goes into the article (no file, no swap), then the article", async () => {
    const yt = "y";
    s.posts.set(yt, { id: yt, state: "draft", body: "", version: 1, media: [{ media_id: "m0" }], comments: [],
      targets: [{ id: "t-a-yt", account_id: "a-yt", custom_body: "t\n\nd", format: "public", state: "draft", postiz_post_id: null, release_url: null, error: null }] } as unknown as PostRow);
    const { db, d } = deps(topic({ status: "publishing", review: REVIEWED,
      artifacts: { article: ARTICLE, social: { post_id: null, youtube_post_id: yt, checks: [] }, video: { job_id: "j", url: FILE, youtube_media_id: "m0" } } }));
    expect(await continuePublishing(d, db.row, true)).toBe("publishing");
    expect(s.calls).toEqual(["send:y"]);
    goLive("y");
    expect(await continuePublishing(d, db.row, false)).toBe("published");
    expect(s.calls).toEqual(["send:y", "embed", "publish"]);
    expect(embed.embedVideoInPost).toHaveBeenCalledWith(expect.anything(), { siteId: "s1", postId: 5, videoUrl: YT, once: true });
    expect(embed.swapEmbeddedVideo).not.toHaveBeenCalled();
  });

  const before = () => topic({ status: "publishing", review: REVIEWED,
    artifacts: { article: ARTICLE, social: { post_id: null, checks: [] }, video: { job_id: "j", url: FILE, embedded_at: "2026-11-26T00:00:00Z", media_id: "m-old" } } });

  it("made before K30 (file in the article, no YouTube draft): its draft gets the uploaded video, goes out first, then the file is swapped for the player", async () => {
    const { db, d } = deps(before());
    expect(await continuePublishing(d, db.row, true)).toBe("publishing");
    const [yt] = youtubeDrafts();
    expect(yt.media).toEqual([{ media_id: "m-old", position: 0 }]);
    expect(yt.body).toBe(`題目

摘要`);   // the article's title and summary: no AI call, nothing spent
    expect(s.uploads).toBe(0);
    expect(s.calls).toEqual([`send:${yt.id}`]);
    goLive(yt.id);
    expect(await continuePublishing(d, db.row, false)).toBe("published");
    expect(s.calls).toEqual([`send:${yt.id}`, "swap", "publish"]);
    expect(embed.swapEmbeddedVideo).toHaveBeenCalledWith(expect.anything(), { siteId: "s1", postId: 5, fromUrl: FILE, to: { youtubeUrl: YT } });
    expect(youtubeDrafts()).toHaveLength(1);
  });

  it("made before K30 with no YouTube channel: fails with nothing sent (the article stays a draft)", async () => {
    s.accounts = [];
    const { db, d } = deps(before());
    expect(await continuePublishing(d, db.row, true)).toBe("failed");
    expect(db.row.last_error).toBe(NO_YOUTUBE_TEXT);
    expect(s.calls).toEqual([]);
  });
});
