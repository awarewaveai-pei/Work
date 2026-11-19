// N5b swapEmbeddedVideo: the video a draft already embeds becomes another (a re-rendered cut, or the topic's YouTube
// link), through the site's one channel (here the bridge: read, then write over the sha256 it read), drafts only, once.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { orgIdentity } from "@/lib/tenant-guard";

const ORG = "11111111-1111-1111-1111-111111111111";
const BRIDGE = "https://soulful.example";

const resolveWpSite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/wp-sites", () => ({ resolveWpSite, getWpSites: async () => ({ sites: [{ id: "s" }], tokens: {}, usernames: {} }), wpAuthHeader: () => "Basic dead" }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));
vi.mock("@/lib/content/video/delivery-receipts", () => ({ mediaPersistenceEnabled: () => false, ensureDeliveryReceipt: vi.fn(), claimDeliveryReceipt: vi.fn(), recordDeliveryReceipt: vi.fn() }));

const post = vi.hoisted(() => ({ status: "draft", content: "" }));
const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const { swapEmbeddedVideo, SWAP_NOT_FOUND, SWAP_SHAPE_UNKNOWN } = await import("../embed-in-post");

const SEED_B64 = Buffer.alloc(32, 7).toString("base64");
const savedEnv = { ...process.env };
const OLD = "https://cdn.example/old.mp4";
const NEW = "https://cdn.example/new.mp4";
const YT = "https://www.youtube.com/watch?v=abc123";
const SHA = "a".repeat(64);
const route = (u: string) => decodeURIComponent(u).match(/rest_route=\/aware-wave-bridge\/v1([^&]*)/)?.[1] ?? null;
const writes = () => fetchMock.mock.calls.filter((c) => route(String(c[0])) === "/draft/update").map((c) => JSON.parse(c[1].body) as { content: string; expect_sha256: string });

beforeEach(() => {
  process.env.WPBRIDGE_BASE_URL = BRIDGE;
  process.env.WPBRIDGE_KEY_ID = "SE-01";
  process.env.WPBRIDGE_PRIVATE_KEY = SEED_B64;
  resolveWpSite.mockReset();
  resolveWpSite.mockResolvedValue({ site: { id: "s", name: "s", color: "#000", username: "", url: BRIDGE, organizationId: ORG }, token: "", username: "", authHeader: "" });
  post.status = "draft";
  post.content = `<p>intro</p>\n\n${OLD}\n\n<p>end</p>`;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: { body?: string }) => {
    const r = route(url);
    if (r === "/post/read") return { ok: true, status: 200, json: async () => ({ ok: true, status: "ok", post_id: 7, post_status: post.status, title: "t", content: post.content, content_sha256: SHA }) };
    if (r === "/draft/update") {
      post.content = JSON.parse(String(init?.body)).content;   // what WordPress saved: the content sent
      return { ok: true, status: 200, json: async () => ({ ok: true, status: "committed", post_id: 7, post_status: "draft", content: post.content }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
});
afterEach(() => { process.env = { ...savedEnv }; });

const swap = (to: { videoUrl: string } | { youtubeUrl: string }) => swapEmbeddedVideo(orgIdentity(ORG), { siteId: "s", postId: 7, fromUrl: OLD, to });

describe("swapEmbeddedVideo", () => {
  it("to YouTube: the file becomes WordPress's YouTube embed block, over the content read; no .mp4 left", async () => {
    expect(await swap({ youtubeUrl: YT })).toEqual({ ok: true, postId: 7, swapped: true });
    const [w] = writes();
    expect(w.expect_sha256).toBe(SHA);
    expect(w.content).toContain("<!-- wp:embed {\"url\":\"https://www.youtube.com/watch?v=abc123\"");
    expect(w.content).toContain(`\n${YT}\n`);
    expect(w.content).not.toContain(".mp4");
    expect(w.content.startsWith("<p>intro</p>") && w.content.endsWith("<p>end</p>")).toBe(true);
  });

  it("to a new cut: the old file (here inside a video block with a poster) becomes the new one, block and all", async () => {
    post.content = `<p>intro</p>\n<!-- wp:video -->\n<figure class="wp-block-video"><video controls poster="https://cdn.example/p.jpg" src="${OLD}"></video></figure>\n<!-- /wp:video -->\n<p>end</p>`;
    expect(await swap({ videoUrl: NEW })).toMatchObject({ ok: true, swapped: true });
    expect(writes()[0].content).toBe(`<p>intro</p>\n${NEW}\n<p>end</p>`);
  });

  it("the old video is not in the post: nothing written, said so", async () => {
    post.content = "<p>no video here</p>";
    expect(await swap({ youtubeUrl: YT })).toEqual({ ok: false, status: 404, error: SWAP_NOT_FOUND, notFound: true });
    expect(writes()).toHaveLength(0);
  });

  it("the old file is still there in a shape it does not recognise (a link in a sentence): nothing written, not reported as gone", async () => {
    post.content = `<p>see <a href="${OLD}">the file</a></p>`;
    expect(await swap({ youtubeUrl: YT })).toEqual({ ok: false, status: 409, error: SWAP_SHAPE_UNKNOWN });
    expect(writes()).toHaveLength(0);
  });

  it("run again after it went through: done, nothing written twice", async () => {
    await swap({ youtubeUrl: YT });
    expect(await swap({ youtubeUrl: YT })).toEqual({ ok: true, postId: 7, swapped: false });
    expect(writes()).toHaveLength(1);
  });

  it("a published article is not changed: refused after the read, before any write", async () => {
    post.status = "publish";
    expect(await swap({ videoUrl: NEW })).toMatchObject({ ok: false, status: 409, live: true });
    expect(writes()).toHaveLength(0);
  });
});
