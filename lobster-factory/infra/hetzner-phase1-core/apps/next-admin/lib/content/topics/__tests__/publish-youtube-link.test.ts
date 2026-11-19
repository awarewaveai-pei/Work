// N5b (a): the article step of publish (publish-steps.ts, via make.ts publishDrafts) first swaps the article's video file
// for YouTube's link, while the article is still a draft; a site without YouTube publishes as before.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Topic } from "../store";

const calls = vi.hoisted(() => [] as string[]);
const wp = vi.hoisted(() => ({ updateWpPost: vi.fn() }));
vi.mock("@/lib/content/publish/wp-post-core", () => wp);
const embed = vi.hoisted(() => ({ swapEmbeddedVideo: vi.fn(), embedVideoInPost: vi.fn() }));
vi.mock("@/lib/content/video/embed-in-post", () => embed);
vi.mock("@/lib/content/brand-voice-store", () => ({
  loadSiteBrand: async (_sb: unknown, siteId: string) => ({ siteId, organizationId: ORG, name: "s", defaults: { publishMode: "ai_review_auto" } }),
}));

const { topicDeps } = await import("../make");
const { continuePublishing } = await import("../tick");
const { publishNote } = await import("../lanes");

const ORG = "11111111-1111-4111-8111-111111111111";
const FILE = "https://cdn.example/v.mp4";
const YT = "https://www.youtube.com/watch?v=abc123";
const youtubeDone = { youtube: { post_id: "y", started_at: "2026-11-19T00:00:00Z", sent_at: "2026-11-19T00:00:00Z", url: YT } };
const row = (artifacts: Record<string, unknown>): Topic => ({
  id: "a", organization_id: ORG, site_id: "s1", title: "題目", keyword: "k", angle: null, source: "manual", source_ref: {},
  month: "2026-11-01", scheduled_for: null, formats: ["article", "youtube"], status: "publishing", review: null,
  artifacts: { article: { wp_post_id: 5, required: [] }, video: { job_id: "j", url: FILE, embedded_at: "2026-11-19T00:00:00Z" }, ...artifacts },
  version: 3, last_error: null, started_on: "2026-11-19", created_by: "staff:x", created_at: "2026-11-19T00:00:00Z", updated_at: "2026-11-19T00:00:00Z",
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

beforeEach(() => {
  calls.length = 0;
  wp.updateWpPost.mockReset();
  wp.updateWpPost.mockImplementation(async () => { calls.push("publish"); return { ok: true, post: { status: "publish", link: "https://wp.example/a" } }; });
  embed.swapEmbeddedVideo.mockReset();
  embed.swapEmbeddedVideo.mockImplementation(async () => { calls.push("swap"); return { ok: true, postId: 5, swapped: true }; });
});

describe("N5b (a): the article goes live with YouTube's link", () => {
  it("YouTube's link is back: the file is swapped for it, then the article is published", async () => {
    const { db, d } = deps(row({ social: { post_id: null, youtube_post_id: "y" }, publish: youtubeDone }));
    expect(await continuePublishing(d, db.row, false)).toBe("published");
    expect(calls).toEqual(["swap", "publish"]);
    expect(embed.swapEmbeddedVideo).toHaveBeenCalledWith(expect.anything(), { siteId: "s1", postId: 5, fromUrl: FILE, to: { youtubeUrl: YT } });
  });

  it("a site without YouTube: no swap, the article goes out with its file as before", async () => {
    const { db, d } = deps(row({ social: { post_id: null } }));
    expect(await continuePublishing(d, db.row, false)).toBe("published");
    expect(calls).toEqual(["publish"]);
  });

  it("the swap could not be done (the draft changed meanwhile): the article is not published, the topic fails", async () => {
    embed.swapEmbeddedVideo.mockResolvedValue({ ok: false, status: 409, error: "這篇草稿剛被別人改過" });
    const { db, d } = deps(row({ social: { post_id: null, youtube_post_id: "y" }, publish: youtubeDone }));
    expect(await continuePublishing(d, db.row, false)).toBe("failed");
    expect(wp.updateWpPost).not.toHaveBeenCalled();
    expect(db.row.last_error).toContain("沒換成 YouTube 連結");
  });

  // N5b risk fix: an article a person already published keeps its file; the topic says so instead of only the server log
  it("an article a person already published: publish goes on and the topic carries a note; a draft article gets none", async () => {
    embed.swapEmbeddedVideo.mockResolvedValue({ ok: false, live: true, status: 409, error: "live" });
    const live = deps(row({ social: { post_id: null, youtube_post_id: "y" }, publish: youtubeDone }));
    expect(await continuePublishing(live.d, live.db.row, false)).toBe("published");
    const note = (live.db.row.artifacts as { publish: { article: { note?: string } } }).publish.article.note;
    expect(note).toBe("文章已先被手動發布，影片仍是原檔，沒有換成 YouTube 連結");
    expect(publishNote(live.db.row)).toBe(note);

    embed.swapEmbeddedVideo.mockResolvedValue({ ok: true, postId: 5, swapped: true });
    const draft = deps(row({ social: { post_id: null, youtube_post_id: "y" }, publish: youtubeDone }));
    expect(await continuePublishing(draft.d, draft.db.row, false)).toBe("published");
    expect(publishNote(draft.db.row)).toBeNull();
  });
});

