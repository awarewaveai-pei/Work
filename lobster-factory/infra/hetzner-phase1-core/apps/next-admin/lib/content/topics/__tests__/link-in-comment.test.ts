// K23: the auto pipeline's Facebook and Instagram drafts carry no web address in their text; the article's link goes in
// their first comment (operator's wording, verbatim). The other channels' draft and a topic made before K23 (one shared
// draft) go out as before, with link_url. Runs the real publish (tick.ts continuePublishing -> make.ts sendSocial) over an
// in-memory social store, then reads what the sender would send (compose.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Topic } from "../store";
import type { PostRow } from "@/lib/social/store";

const posts = vi.hoisted(() => new Map<string, PostRow>());
const PLATFORM = vi.hoisted(() => ({ "a-fb": "facebook", "a-ig": "instagram", "a-x": "x" } as Record<string, string>));
vi.mock("@/lib/social/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/social/store")>()),
  getPost: async (_org: string, id: string) => structuredClone(posts.get(id)!),
  accountPlatforms: async (_org: string, ids: string[]) => new Map(ids.map((id) => [id, PLATFORM[id]])),
  savePost: async (_org: string, id: string, _v: number, fields: Record<string, unknown>, targets: Array<{ account_id: string; custom_body: string | null; format?: string }> | null,
    _m: unknown, _a: string, children: { comments?: Array<{ body: string; delay_minutes?: number; media_id?: string | null }> | null } = {}) => {
    const p = posts.get(id)!;
    const next: PostRow = { ...p, ...fields, version: p.version + 1 } as PostRow;
    if (targets) next.targets = targets.map((x) => ({ ...p.targets.find((o) => o.account_id === x.account_id)!, custom_body: x.custom_body, format: x.format ?? "post" }));
    if (children.comments) next.comments = children.comments.map((c, i) => ({ position: i, body: c.body, delay_minutes: c.delay_minutes ?? 0, media_id: c.media_id ?? null }));
    posts.set(id, next);
    return { id, version: next.version };
  },
}));
vi.mock("@/lib/social/actions", () => ({
  applyAction: async (_org: string, p: PostRow) => { posts.set(p.id, { ...posts.get(p.id)!, state: "scheduled" }); return { state: "scheduled" }; },
}));
vi.mock("@/lib/social/review", () => ({ requiresReview: async () => false }));
const wp = vi.hoisted(() => ({ updateWpPost: vi.fn() }));
vi.mock("@/lib/content/publish/wp-post-core", () => wp);
vi.mock("@/lib/content/video/embed-in-post", () => ({ swapEmbeddedVideo: vi.fn(), embedVideoInPost: vi.fn() }));
vi.mock("@/lib/content/brand-voice-store", () => ({
  loadSiteBrand: async (_sb: unknown, siteId: string) => ({ siteId, organizationId: ORG, name: "s", defaults: { publishMode: "ai_review_auto" } }),
}));

const { topicDeps, draftGroups } = await import("../make");
const { continuePublishing } = await import("../tick");
const { compose, composeText } = await import("@/lib/social/compose");

const ORG = "11111111-1111-4111-8111-111111111111";
const LINK = "https://wp.example/a";
const PUBLISHED_TITLE = "發佈時的標題";
const SUMMARY = "這是文章摘要";

function post(id: string, accounts: Array<[string, string | null]>): PostRow {
  return {
    id, state: "draft", body: SUMMARY, scheduled_at: null, list_id: null, list_position: null, first_comment: null, link_url: null, link_utm: false,   // what makeSocial's drafts get (0105 social_save_post default)
    notes: null, source_url: null, published_at: null, deleted_at: null, version: 1, repeat: null, repeat_of: null, origin_slot: null, auto_mode: "brand",
    targets: accounts.map(([account_id, custom_body]) => ({ id: `t-${account_id}`, account_id, custom_body, format: "post", state: "draft", postiz_post_id: null, release_url: null, error: null })),
    media: [], comments: [], tags: [],
  };
}
const row = (social: Record<string, unknown>): Topic => ({
  id: "a", organization_id: ORG, site_id: "s1", title: "題目卡的暫定標題", keyword: "k", angle: null, source: "manual", source_ref: {},
  month: "2026-11-01", scheduled_for: null, formats: ["article", "social"], status: "publishing", review: null,
  artifacts: { article: { wp_post_id: 5, required: [], checks: [{ name: "title_spacing", pass: true, detail: "" }] }, social },
  version: 3, last_error: null, started_on: "2026-11-24", created_by: "staff:x", created_at: "2026-11-24T00:00:00Z", updated_at: "2026-11-24T00:00:00Z",
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
/** What the sender sends for the post's first target (dispatch.ts -> compose). */
const sent = (id: string, platform: string) => {
  const p = posts.get(id)!;
  const t = p.targets[0];
  const input = { body: p.body, customBody: t.custom_body, linkUrl: p.link_url, linkUtm: p.link_utm, platform, format: t.format, media: [],
    comments: p.comments.map((c) => ({ body: c.body, delayMinutes: c.delay_minutes, media: null })) };
  return { text: composeText(input), composed: compose(input), comments: p.comments };
};
const split = { post_id: "o", link_in_comment: [{ post_id: "fb", channel: "facebook" }, { post_id: "ig", channel: "instagram" }] };

beforeEach(() => {
  posts.clear();
  posts.set("o", post("o", [["a-x", "X 的貼文"]]));
  posts.set("fb", post("fb", [["a-fb", null]]));
  posts.set("ig", post("ig", [["a-ig", "IG 的專屬貼文 #台灣"]]));
  wp.updateWpPost.mockReset();
  wp.updateWpPost.mockResolvedValue({ ok: true, post: { id: 5, status: "publish", date: "", link: LINK, title: PUBLISHED_TITLE } });
});

describe("K23: Facebook / Instagram take the article's link in the first comment", () => {
  it("Facebook, UTM off (the pipeline's default): the comment carries the plain link", async () => {
    const { db, d } = deps(row(split));
    expect(await continuePublishing(d, db.row, false)).toBe("published");
    expect(sent("fb", "facebook").comments[0].body).toBe(`完整文章｜〈${PUBLISHED_TITLE}〉\n${LINK}`);
  });

  it("Facebook, UTM on: the text ends with the line and has no address; the first comment names the published title and the link with UTM, line break kept", async () => {
    posts.set("fb", { ...posts.get("fb")!, link_utm: true });
    const { db, d } = deps(row(split));
    expect(await continuePublishing(d, db.row, false)).toBe("published");
    const fb = sent("fb", "facebook");
    expect(fb.text).toBe(`${SUMMARY}\n\n完整文章內容請看「留言區」`);
    expect(fb.text).not.toMatch(/https?:|wp\.example/);
    expect(posts.get("fb")!.link_url).toBeNull();
    expect(fb.comments[0].body).toBe(`完整文章｜〈${PUBLISHED_TITLE}〉\n${LINK}?utm_source=facebook&utm_medium=social`);
    expect(fb.composed.values[1].content).toBe(`<p>完整文章｜〈${PUBLISHED_TITLE}〉</p><p>${LINK}?utm_source=facebook&amp;utm_medium=social</p>`);
    expect(fb.composed.values[0].content).toBe(`<p>${SUMMARY}</p><p></p><p>完整文章內容請看「留言區」</p>`);
  });

  it("Instagram: the text's ending and the first comment are the two lines, neither with an address", async () => {
    const { db, d } = deps(row(split));
    expect(await continuePublishing(d, db.row, false)).toBe("published");
    const ig = sent("ig", "instagram");
    const lines = `完整文章｜〈${PUBLISHED_TITLE}〉\n點擊「個人檔案連結」，搜尋文章標題`;
    expect(ig.text).toBe(`IG 的專屬貼文 #台灣\n\n${lines}`);
    expect(ig.comments.map((c) => c.body)).toEqual([lines]);
    for (const s of [ig.text, ig.comments[0].body]) expect(s).not.toMatch(/https?:|wp\.example/);
    expect(ig.composed.values[1].content).toBe(`<p>完整文章｜〈${PUBLISHED_TITLE}〉</p><p>點擊「個人檔案連結」，搜尋文章標題</p>`);
  });

  it("the other channels' draft goes out as before: link_url set, the address under its text; only Facebook / Instagram get their own drafts", async () => {
    const { db, d } = deps(row(split));
    expect(await continuePublishing(d, db.row, false)).toBe("published");
    expect(posts.get("o")!.link_url).toBe(LINK);
    expect(sent("o", "x").text).toBe(`X 的貼文\n\n${LINK}`);
    expect(posts.get("o")!.comments).toEqual([]);
    const accounts = ["facebook", "instagram", "instagram-standalone", "x", "youtube", "threads"].map((platform) => ({ platform }));
    const g = draftGroups(accounts, true);
    expect([g.facebook, g.instagram, g.youtube, g.other].map((x) => x.map((a) => a.platform)))
      .toEqual([["facebook"], ["instagram", "instagram-standalone"], ["youtube"], ["x", "threads"]]);
    expect(draftGroups(accounts, false).other.map((a) => a.platform)).toEqual(["facebook", "instagram", "instagram-standalone", "x", "threads"]);
  });

  it("a rerun of the step (crash after the write, before its record) adds nothing a second time", async () => {
    const first = deps(row(split));
    expect(await continuePublishing(first.d, first.db.row, false)).toBe("published");
    for (const id of ["fb", "ig"]) posts.set(id, { ...posts.get(id)!, state: "draft" });
    const again = deps(row(split));
    expect(await continuePublishing(again.d, again.db.row, false)).toBe("published");
    expect(sent("fb", "facebook").text).toBe(`${SUMMARY}\n\n完整文章內容請看「留言區」`);
    expect(posts.get("fb")!.comments).toHaveLength(1);
    expect(posts.get("ig")!.comments).toHaveLength(1);
    expect(sent("ig", "instagram").text.split("點擊「個人檔案連結」").length).toBe(2);
  });

  it("a topic made before K23 (Facebook and Instagram in the one shared draft) keeps the old way: link_url, no comment", async () => {
    posts.set("shared", post("shared", [["a-fb", null], ["a-ig", null]]));
    const { db, d } = deps(row({ post_id: "shared" }));
    expect(await continuePublishing(d, db.row, false)).toBe("published");
    const p = posts.get("shared")!;
    expect(p.link_url).toBe(LINK);
    expect(p.comments).toEqual([]);
    expect(p.body).toBe(SUMMARY);
    expect(sent("shared", "facebook").text).toBe(`${SUMMARY}\n\n${LINK}`);
  });
});

describe("K23: the ending goes above a closing row of hashtags", () => {
  const ending = "完整文章｜〈一個人也自在〉\n點擊「個人檔案連結」，搜尋文章標題";
  it("the operator's example: text, the two lines, then the tags; a second run adds nothing", async () => {
    const { withEnding } = await import("@/lib/social/link-in-comment");
    const out = withEnding("一個人吃飯、一個人旅行，不是孤單，是練習。\n\n#獨處 #自我成長 #正念", ending);
    expect(out).toBe(`一個人吃飯、一個人旅行，不是孤單，是練習。\n\n${ending}\n\n#獨處 #自我成長 #正念`);
    expect(withEnding(out, ending)).toBe(out);
  });
  it("no closing row of tags (none, or a tag inside the last sentence): the ending is last", async () => {
    const { withEnding } = await import("@/lib/social/link-in-comment");
    expect(withEnding("練習獨處。", ending)).toBe(`練習獨處。\n\n${ending}`);
    expect(withEnding("練習 #獨處 的一天。", ending)).toBe(`練習 #獨處 的一天。\n\n${ending}`);
  });
});
