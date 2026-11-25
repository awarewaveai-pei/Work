// K27: a topic with an article and no video gets the article's laid-out cover on its social drafts (the other channels',
// Facebook's and Instagram's own), one upload shared, never on YouTube's; a person's draft and a person's media are
// left alone; no cover = nothing attached and a check says so. Runs attachTopicCover over an in-memory social store.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostRow } from "@/lib/social/store";
import type { Topic } from "../store";

const store = vi.hoisted(() => ({ posts: new Map<string, PostRow>(), uploads: [] as Array<{ url: string; fileName: string }> }));
vi.mock("@/lib/social/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/social/store")>()),
  getPost: async (_org: string, id: string) => structuredClone(store.posts.get(id)!),
  addImage: async (_org: string, url: string, fileName: string) => { store.uploads.push({ url, fileName }); return { id: `m${store.uploads.length}` }; },
  savePost: async (_org: string, id: string, _v: number, _f: unknown, _t: unknown, media: Array<{ media_id: string; position: number; alt_text?: string | null }> | null) => {
    const p = store.posts.get(id)!;
    store.posts.set(id, { ...p, version: p.version + 1, ...(media ? { media: media.map((m) => ({ media_id: m.media_id, position: m.position, alt_text: m.alt_text ?? null })) } : {}) });
    return { id, version: p.version + 1 };
  },
}));

const { attachTopicCover } = await import("../make");
type Artifacts = Parameters<typeof attachTopicCover>[1];

const ORG = "11111111-1111-4111-8111-111111111111";
const COVER = "https://cdn/cover-1.webp";
const draft = (id: string, extra: Partial<PostRow> = {}) => ({ id, state: "draft", version: 1, media: [], ...extra }) as unknown as PostRow;
const topic = (formats: Topic["formats"] = ["article", "social"]) => ({ id: "a", organization_id: ORG, title: "題目的暫定標題", formats });
const artifacts = (cover: string | null = COVER): Artifacts => ({
  article: { wp_post_id: 5, seo_score: 80, wp_edit_url: null, summary: "s", source: "s", checks: [], title: "正念呼吸 7 個方法", cover: { image_url: cover } },
  social: { post_id: "o", youtube_post_id: "yt", link_in_comment: [{ post_id: "fb", channel: "facebook" }, { post_id: "ig", channel: "instagram" }], checks: [] },
});
const media = (id: string) => store.posts.get(id)!.media;

beforeEach(() => {
  store.posts.clear();
  store.uploads = [];
  for (const id of ["o", "fb", "ig", "yt"]) store.posts.set(id, draft(id));
});

describe("K27: the article's cover on the topic's social drafts", () => {
  it("no video + a cover: Facebook, Instagram and the other channels each get the one upload, alt = the article's title; YouTube none", async () => {
    const a = artifacts();
    await attachTopicCover(topic(), a, "schedule:x");
    expect(store.uploads).toEqual([{ url: COVER, fileName: "topic-a-cover.webp" }]);
    for (const id of ["o", "fb", "ig"]) expect(media(id)).toEqual([{ media_id: "m1", position: 0, alt_text: "正念呼吸 7 個方法" }]);
    expect(media("yt")).toEqual([]);
    expect(a.social!.cover_media).toEqual({ media_id: "m1", done: ["o", "fb", "ig"] });
    expect(a.social!.checks).toEqual([]);
  });

  it("a topic with a video: no cover attached (its video goes on instead)", async () => {
    const a = artifacts();
    await attachTopicCover(topic(["article", "social", "video"]), a, "schedule:x");
    expect(store.uploads).toEqual([]);
    for (const id of ["o", "fb", "ig"]) expect(media(id)).toEqual([]);
    expect(a.social!.cover_media).toBeUndefined();
  });

  it("no cover: nothing attached; a check says the posts have no picture and holds the topic while Instagram has none", async () => {
    const a = artifacts(null);
    await attachTopicCover(topic(), a, "schedule:x");
    expect(store.uploads).toEqual([]);
    expect(a.social!.checks).toEqual([{ name: "social_image", pass: false, detail: "社群貼文沒有圖：文章沒有封面；Instagram 沒有圖發不出去，請到社群草稿加一張圖" }]);
    const noIg = artifacts(null);
    noIg.social!.link_in_comment = [{ post_id: "fb", channel: "facebook" }];
    await attachTopicCover(topic(), noIg, "schedule:x");
    expect(noIg.social!.checks).toEqual([{ name: "social_image", pass: true, detail: "社群貼文沒有圖：文章沒有封面" }]);
  });

  it("a draft with media of its own keeps it, and one a person scheduled is not touched", async () => {
    store.posts.set("fb", draft("fb", { media: [{ media_id: "mine", position: 0, alt_text: null }] }));
    store.posts.set("o", draft("o", { state: "scheduled" } as Partial<PostRow>));
    const a = artifacts();
    await attachTopicCover(topic(), a, "schedule:x");
    expect(media("fb")).toEqual([{ media_id: "mine", position: 0, alt_text: null }]);
    expect(media("o")).toEqual([]);
    expect(media("ig")).toEqual([{ media_id: "m1", position: 0, alt_text: "正念呼吸 7 個方法" }]);
    expect(store.uploads).toHaveLength(1);
  });

  it("a rerun adds nothing twice: no second upload, still one media per draft", async () => {
    const a = artifacts();
    await attachTopicCover(topic(), a, "schedule:x");
    await attachTopicCover(topic(), a, "schedule:x");
    // a crash before the record was saved: the drafts' own media says they are done
    await attachTopicCover(topic(), artifacts(), "schedule:x");
    expect(store.uploads).toHaveLength(1);
    for (const id of ["o", "fb", "ig"]) expect(media(id)).toHaveLength(1);
  });
});
