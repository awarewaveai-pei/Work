// K29: an article's cover in each social channel's size. A topic whose drafts reach Facebook, Instagram and Bluesky gets
// one portrait base picture (drawn once) and the 1080x1350 cover on all three drafts, the website keeping 1200x900;
// without such channels no extra picture is drawn or reserved; a portrait base that fails is the website's base cropped
// in; a shared draft of mixed channels takes the size most of them need and a check names the rest.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostRow } from "@/lib/social/store";

const m = vi.hoisted(() => ({
  calls: [] as Array<{ aspectRatio: string }>,
  failRatio: null as string | null,
  published: [] as Array<Record<string, unknown>>,
  rendered: [] as Array<{ bg: string; size: { width: number; height: number } }>,
  stored: 0,
  accounts: [] as string[],
  posts: new Map<string, PostRow>(),
  uploads: [] as Array<{ url: string; fileName: string }>,
}));
vi.mock("@/lib/entitlements/grant", () => ({ runForOrg: (_o: string, _a: string, fn: () => unknown) => fn(), grantFor: async () => ({ actor: "staff:x" }) }));
vi.mock("@/lib/content/brand-voice-store", () => ({ loadSiteBrand: async () => ({ organizationId: "org1", defaults: {} }) }));
vi.mock("@/lib/storage/r2", () => ({
  isR2Configured: () => true,
  isDesignsAsset: (u: unknown) => typeof u === "string" && u.startsWith("https://cdn/"),
  getDesignObjectByUrl: async (u: string) => ({ ok: true, body: Buffer.from(u), contentType: "image/webp" }),
  parseImageDataUrl: () => null,
  buildDesignKey: () => "designs/2026-11/cover.webp",
  putDesignObject: async () => ({ ok: true, publicUrl: `https://cdn/cover-${++m.stored}.webp` }),
}));
vi.mock("@/lib/content/cover/render", () => ({
  renderCover: async (bg: Buffer, _text: unknown, _settings: unknown, size: { width: number; height: number }) => {
    m.rendered.push({ bg: bg.toString(), size });
    return { buffer: Buffer.from("cover"), mime: "image/webp" };
  },
}));
vi.mock("@/lib/content/image/make-image", () => ({
  makeContentImage: async (i: { aspectRatio: string }) => {
    m.calls.push(i);
    if (i.aspectRatio === m.failRatio) return { ok: false, error: "model down" };
    return { ok: true, stored: true, imageUrl: `https://cdn/${m.calls.length}.webp`, seed: null };
  },
}));
vi.mock("@/lib/content/pipeline", () => ({
  runContentPipeline: async (input: Record<string, unknown>, opts: { stages: string[] }) => {
    if (opts.stages[0] === "article") return { ok: true, markdown: ARTICLE };
    m.published.push(input);
    return { ok: true, publish: { post_id: 1, edit_url: "e" }, qualityReport: { score: 80 } };
  },
}));
// account id = its platform
vi.mock("@/lib/social/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/social/store")>()),
  listAccounts: async () => m.accounts.map((p) => ({ id: p, platform: p, status: "connected" })),
  accountPlatforms: async (_o: string, ids: string[]) => new Map(ids.map((id) => [id, id])),
  getPost: async (_o: string, id: string) => structuredClone(m.posts.get(id)!),
  addImage: async (_o: string, url: string, fileName: string) => { m.uploads.push({ url, fileName }); return { id: `m${m.uploads.length}` }; },
  savePost: async (_o: string, id: string, _v: number, _f: unknown, _t: unknown, media: Array<{ media_id: string; position: number; alt_text?: string | null }> | null) => {
    const p = m.posts.get(id)!;
    m.posts.set(id, { ...p, version: p.version + 1, ...(media ? { media: media.map((x) => ({ media_id: x.media_id, position: x.position, alt_text: x.alt_text ?? null })) } : {}) });
    return { id, version: p.version + 1 };
  },
}));

const { attachTopicCover, topicDeps } = await import("../make");
const { stepUpperTwd } = await import("../budget");
import type { Topic } from "../store";

const ARTICLE = [
  "<!-- CONTENT_META_START -->", "SEO_TITLE: 正念呼吸 7 個方法", "META_DESC: 描述", "FOCUS_KEYWORD: 正念",
  "COVER_SCENE: A quiet lake at sunrise", "COVER_TITLE: 正念呼吸入門", "COVER_SUBTITLE: 五分鐘找回平靜", "<!-- CONTENT_META_END -->", "# 正念呼吸",
  ...[1, 2, 3, 4].map((n) => `![第${n}段](IMAGE_PLACEHOLDER_${n} "Scene ${n}")`),
].join("\n\n");
const sb = { from: () => ({ select: () => { const q = { eq: () => q, gte: () => q, order: () => q, range: async () => ({ data: [], error: null }) }; return q; } }) };
const draft = (id: string, platforms: string[]) => ({ id, state: "draft", version: 1, media: [], targets: platforms.map((p) => ({ account_id: p })) }) as unknown as PostRow;
// the social drafts exist already (makeSocial is not under test): the other channels', Facebook's and Instagram's
const social = { post_id: "o", link_in_comment: [{ post_id: "fb", channel: "facebook" }, { post_id: "ig", channel: "instagram" }], checks: [] };
const topic = (): Topic => ({
  id: "11111111-1111-4111-8111-111111111111", organization_id: "org1", site_id: "s1", title: "正念", keyword: "正念", angle: null,
  source: "manual", source_ref: {}, month: "2026-11-01", scheduled_for: null, formats: ["article", "social"], status: "generating",
  artifacts: { social }, review: null, version: 1, last_error: null, started_on: null, created_by: "x", created_at: "", updated_at: "",
});
const make = () => topicDeps(sb as never, "org1", "staff:x", { capTwd: 100 }).make(topic());
type Art = { article: { cover: Record<string, unknown>; checks: Array<{ detail: string }> }; social: { checks: Array<{ name: string; detail: string }> }; budget: { spentTwd: number } };
const media = (id: string) => m.posts.get(id)!.media.map((x) => x.media_id);

beforeEach(() => {
  Object.assign(m, { calls: [], failRatio: null, published: [], rendered: [], stored: 0, uploads: [] });
  m.accounts = ["bluesky", "facebook", "instagram"];
  m.posts.clear();
  for (const [id, p] of [["o", ["bluesky"]], ["fb", ["facebook"]], ["ig", ["instagram"]]] as const) m.posts.set(id, draft(id, [...p]));
  vi.stubEnv("SERPER_API_KEY", "");
});

describe("K29: the cover in each channel's size", () => {
  it("Facebook + Instagram + Bluesky: one portrait base drawn once; all three drafts get the 1080x1350 cover; the website keeps 1200x900", async () => {
    const made = await make();
    const a = made.artifacts as unknown as Art;
    expect(m.calls.map((c) => c.aspectRatio)).toEqual(["4:3", "4:3", "4:3", "4:3", "16:9", "1:1"]);
    expect(m.rendered.map((r) => [r.bg, r.size])).toEqual([["https://cdn/5.webp", { width: 1200, height: 900 }], ["https://cdn/6.webp", { width: 1080, height: 1350 }]]);
    expect(m.published[0].featuredImageUrl).toBe("https://cdn/cover-1.webp");
    expect(a.article.cover).toMatchObject({ image_url: "https://cdn/cover-1.webp", base_url: "https://cdn/5.webp",
      sizes: { "1080x1350": { image_url: "https://cdn/cover-2.webp", base_url: "https://cdn/6.webp" } } });
    expect(m.uploads).toEqual([{ url: "https://cdn/cover-2.webp", fileName: "topic-11111111-1111-4111-8111-111111111111-cover-1080x1350.webp" }]);
    for (const id of ["o", "fb", "ig"]) expect(media(id)).toEqual(["m1"]);
    expect(a.budget.spentTwd).toBe(stepUpperTwd.article(6));
  });

  it("only YouTube, or no social channel: no portrait base drawn, none reserved", async () => {
    for (const accounts of [["youtube"], []]) {
      Object.assign(m, { calls: [], rendered: [], stored: 0 });
      m.accounts = accounts;
      const a = (await make()).artifacts as unknown as Art;
      expect(m.calls.map((c) => c.aspectRatio)).toEqual(["4:3", "4:3", "4:3", "4:3", "16:9"]);
      expect(m.rendered.map((r) => r.size)).toEqual([{ width: 1200, height: 900 }]);
      expect(a.budget.spentTwd).toBe(stepUpperTwd.article(5));
    }
  });

  it("the portrait base fails: the website's base is cropped into the portrait cover, and a check says so", async () => {
    m.failRatio = "1:1";
    const a = (await make()).artifacts as unknown as Art;
    expect(m.rendered.map((r) => [r.bg, r.size])).toEqual([["https://cdn/5.webp", { width: 1200, height: 900 }], ["https://cdn/5.webp", { width: 1080, height: 1350 }]]);
    expect(a.article.checks.map((c) => c.detail)).toContain("社群封面（1080x1350）的 1:1 底圖沒有生成，改用網站封面的底圖裁進去");
    for (const id of ["o", "fb", "ig"]) expect(media(id)).toEqual(["m1"]);
  });

  it("a shared draft of mixed channels takes the size most need; a check names the channel off its own size", async () => {
    m.posts.set("o", draft("o", ["bluesky", "threads", "x"]));
    const artifacts = {
      article: { wp_post_id: 5, seo_score: 80, wp_edit_url: null, summary: "s", source: "s", checks: [], title: "正念",
        cover: { image_url: "https://cdn/site.webp", sizes: { "1080x1350": { image_url: "https://cdn/portrait.webp", base_url: "https://cdn/b.webp" } } } },
      social: structuredClone(social),
    } as Parameters<typeof attachTopicCover>[1];
    await attachTopicCover(topic(), artifacts, "schedule:x");
    expect(m.uploads.map((u) => u.url)).toEqual(["https://cdn/portrait.webp"]);
    for (const id of ["o", "fb", "ig"]) expect(media(id)).toEqual(["m1"]);
    expect(artifacts.social!.checks).toEqual([{ name: "cover", pass: true, detail: "封面不是這些頻道自己的尺寸：x 用了 1080×1350 的封面" }]);
    expect(artifacts.social!.cover_media).toEqual({ media_id: null, done: ["o", "fb", "ig"], media_ids: { "1080x1350": "m1" } });
  });
});
