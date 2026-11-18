// One site, one channel (Soulful 2026-11-18: draft #7753 made through the bridge, the embed sent to /wp/v2 with a dead
// application password). Real woo.ts + real wordpress-core: on a bridge site create, read, write and the draft list all
// go to the signed bridge routes and no request reaches /wp-json; a site without a bridge keeps REST.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { orgIdentity } from "@/lib/tenant-guard";

const ORG = "11111111-1111-1111-1111-111111111111";
const BRIDGE = "https://soulful.example";
const REST_SITE = "https://acme.example";

const resolveWpSite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/wp-sites", () => ({
  resolveWpSite,
  getWpSites: async () => ({ sites: [{ id: "s" }], tokens: {}, usernames: {} }),
  wpAuthHeader: () => "Basic dead",
}));
vi.mock("@/lib/system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

const receipts = vi.hoisted(() => ({
  enabled: false,
  claimed: true,
  ensureDeliveryReceipt: vi.fn(async () => ({ id: "r1" })),
  claimDeliveryReceipt: vi.fn(async () => ({ claimed: receipts.claimed, receipt: { id: "r1" } })),
  recordDeliveryReceipt: vi.fn(async (_r: unknown, _t: { type: string }) => ({ id: "r1" })),
}));
vi.mock("@/lib/content/video/delivery-receipts", () => ({
  mediaPersistenceEnabled: () => receipts.enabled,
  ensureDeliveryReceipt: receipts.ensureDeliveryReceipt,
  claimDeliveryReceipt: receipts.claimDeliveryReceipt,
  recordDeliveryReceipt: receipts.recordDeliveryReceipt,
}));

/** The plugin's answers by route; a test overrides one to model a refusal. */
const plugin = vi.hoisted(() => ({ routes: {} as Record<string, { status: number; body: unknown }> }));
const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const { embedVideoInPost, embedVideoInNewDraft, listNotLiveDrafts } = await import("../embed-in-post");

const SEED_B64 = Buffer.alloc(32, 7).toString("base64");
const savedEnv = { ...process.env };
const VIDEO = "https://cdn.example/v.mp4";
const RELEASE = "22222222-2222-4222-8222-222222222222";
const SHA = "a".repeat(64);

const site = (url: string, token = "") => ({ site: { id: "s", name: "s", color: "#000", username: "", url, organizationId: ORG }, token, username: token ? "Admin" : "", authHeader: token ? "Basic dead" : "" });
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const bridgeRoute = (u: string) => decodeURIComponent(u).match(/rest_route=\/aware-wave-bridge\/v1([^&]*)/)?.[1] ?? null;
const bodyOf = (route: string) => JSON.parse(fetchMock.mock.calls.find((c) => bridgeRoute(String(c[0])) === route)![1].body);

beforeEach(() => {
  process.env.WPBRIDGE_BASE_URL = BRIDGE;
  process.env.WPBRIDGE_KEY_ID = "SE-01";
  process.env.WPBRIDGE_PRIVATE_KEY = SEED_B64;
  resolveWpSite.mockReset();
  resolveWpSite.mockResolvedValue(site(BRIDGE));   // no REST credential at all: the bridge site must not need one
  receipts.enabled = false;
  receipts.claimed = true;
  for (const m of [receipts.ensureDeliveryReceipt, receipts.claimDeliveryReceipt, receipts.recordDeliveryReceipt]) m.mockClear();
  plugin.routes = {
    "/post": { status: 201, body: { ok: true, status: "committed", post_id: 7753, edit_url: `${BRIDGE}/wp-admin/post.php?post=7753&action=edit` } },
    "/post/read": { status: 200, body: { ok: true, status: "ok", post_id: 7753, post_status: "draft", title: "新品", content: "<p>intro</p>", content_sha256: SHA } },
    "/draft/update": { status: 200, body: { ok: true, status: "committed", post_id: 7753, post_status: "draft" } },
    "/drafts": { status: 200, body: { ok: true, status: "ok", posts: [{ id: 7753, title: "", status: "draft", modified: "2026-11-18T10:00:00" }] } },
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: { body?: unknown }) => {
    const route = bridgeRoute(url);
    if (route !== null) {
      const r = plugin.routes[route] ?? { status: 404, body: { code: "rest_no_route" } };
      // /draft/update answers with what it saved: the content sent, unless a test set one
      if (route === "/draft/update" && r.status < 300 && !("content" in (r.body as object))) {
        return { ok: true, status: 200, json: async () => ({ ...(r.body as object), content: JSON.parse(String(init?.body)).content }) };
      }
      return { ok: r.status < 300, status: r.status, json: async () => r.body };
    }
    if (url.includes("context=edit")) return { ok: true, status: 200, json: async () => ({ status: "draft", content: { raw: "body" }, title: { raw: "t" } }) };
    return { ok: true, status: 200, json: async () => ({}) };
  });
});
afterEach(() => { process.env = { ...savedEnv }; });

describe("bridge site: every read and write goes through the bridge", () => {
  it("建新草稿文章並嵌入: create, read and write are signed bridge calls, none goes to /wp-json", async () => {
    const res = await embedVideoInNewDraft(orgIdentity(ORG), { siteId: "s", title: "新品", videoUrl: VIDEO });
    expect(res).toMatchObject({ ok: true, postId: 7753, editUrl: `${BRIDGE}/wp-admin/post.php?post=7753&action=edit` });
    expect(urls().map(bridgeRoute)).toEqual(["/post", "/post/read", "/draft/update"]);
    expect(urls().some((u) => u.includes("/wp-json/"))).toBe(false);
    expect(fetchMock.mock.calls.every((c) => typeof c[1].headers["X-AWBridge-Signature"] === "string" && !("Authorization" in c[1].headers))).toBe(true);
    expect(bodyOf("/post/read")).toEqual({ post_id: 7753 });
    expect(bodyOf("/draft/update")).toEqual({ post_id: 7753, content: `<p>intro</p>\n\n${VIDEO}\n`, expect_sha256: SHA });
  });

  it("嵌入影片 into a listed draft: through the bridge", async () => {
    const res = await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 7753, videoUrl: VIDEO, draftOnly: true });
    expect(res).toEqual({ ok: true, postId: 7753, videoUrl: VIDEO });
    expect(urls().map(bridgeRoute)).toEqual(["/post/read", "/draft/update"]);
  });

  it("the draft list: through the bridge, untitled drafts named", async () => {
    const r = await listNotLiveDrafts(site(BRIDGE));
    expect(r).toEqual({ ok: true, posts: [{ id: 7753, title: "（無標題 #7753）", status: "draft", modified: "2026-11-18T10:00:00" }] });
    expect(urls().map(bridgeRoute)).toEqual(["/drafts"]);
  });

  it("a published post: refused after the read, nothing is written (draftOnly and the pipeline alike)", async () => {
    plugin.routes["/post/read"] = { status: 200, body: { ok: true, status: "ok", post_id: 9, post_status: "publish", title: "t", content: "<p>live</p>", content_sha256: SHA } };
    const res = await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 9, videoUrl: VIDEO, draftOnly: true });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect((res as { error: string }).error).toContain("建新草稿文章並嵌入");
    const piped = await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 9, videoUrl: VIDEO, once: true });
    expect(piped).toMatchObject({ ok: false, status: 409 });
    expect(urls().map(bridgeRoute)).toEqual(["/post/read", "/post/read"]);
  });

  it("once: a published post that already holds the video is done, not refused (Codex 7ab1abb3 F2)", async () => {
    plugin.routes["/post/read"] = { status: 200, body: { ok: true, status: "ok", post_id: 9, post_status: "publish", title: "t", content: `<p>x</p>\n${VIDEO}\n`, content_sha256: SHA } };
    expect(await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 9, videoUrl: VIDEO, once: true })).toEqual({ ok: true, postId: 9, videoUrl: VIDEO });
    expect(urls().map(bridgeRoute)).toEqual(["/post/read"]);
  });

  it("the draft was edited after the read: the plugin refuses, 409, nothing overwritten", async () => {
    plugin.routes["/draft/update"] = { status: 409, body: { ok: false, status: "refused", reason: "content_changed" } };
    const res = await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 7753, videoUrl: VIDEO, draftOnly: true });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect((res as { error: string }).error).toContain("改過");
  });

  it("published between the read and the write: the plugin refuses the update, 409", async () => {
    plugin.routes["/draft/update"] = { status: 409, body: { ok: false, status: "refused", reason: "post_not_draft" } };
    const res = await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 9, videoUrl: VIDEO });
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("WordPress saved the draft without the video: a failed delivery, the receipt is not marked done", async () => {
    receipts.enabled = true;
    plugin.routes["/draft/update"] = { status: 200, body: { ok: true, status: "committed", post_id: 7753, post_status: "draft", content: "<p>intro</p>" } };
    const res = await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 7753, videoUrl: VIDEO, releaseId: RELEASE, draftOnly: true });
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(receipts.recordDeliveryReceipt.mock.calls.map((c) => c[1].type)).toEqual(["failed"]);
  });

  it("a plugin without the /draft routes (older than 0.22.0) says so, and never falls back to REST", async () => {
    delete plugin.routes["/post/read"];
    const res = await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 9, videoUrl: VIDEO, draftOnly: true });
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect((res as { error: string }).error).toContain("0.22.0");
    expect(urls().some((u) => u.includes("/wp-json/"))).toBe(false);
  });

  it("receipts: a claimed delivery is recorded drafted + published; an already-claimed one writes nothing", async () => {
    receipts.enabled = true;
    const res = await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 7753, videoUrl: VIDEO, releaseId: RELEASE, draftOnly: true });
    expect(res).toEqual({ ok: true, postId: 7753, videoUrl: VIDEO });
    expect(receipts.ensureDeliveryReceipt).toHaveBeenCalledWith({ organizationId: ORG, releaseId: RELEASE, destination: "wordpress", variant: "default:post-7753" });
    expect(receipts.recordDeliveryReceipt.mock.calls.map((c) => c[1].type)).toEqual(["drafted", "published"]);

    fetchMock.mockClear();
    receipts.claimed = false;
    const again = await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 7753, videoUrl: VIDEO, releaseId: RELEASE, draftOnly: true });
    expect(again).toMatchObject({ ok: true, idempotent: true, postId: 7753 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a site without a bridge keeps REST", () => {
  it("embed and list go to /wp-json with the site's credential, never to the bridge", async () => {
    resolveWpSite.mockResolvedValue(site(REST_SITE, "tok"));
    expect(await embedVideoInPost(orgIdentity(ORG), { siteId: "s", postId: 5, videoUrl: VIDEO, draftOnly: true })).toEqual({ ok: true, postId: 5, videoUrl: VIDEO });
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => [{ id: 5, title: { raw: "a" }, status: "draft", modified: "m" }] }));
    expect(await listNotLiveDrafts(site(REST_SITE, "tok"))).toEqual({ ok: true, posts: [{ id: 5, title: "a", status: "draft", modified: "m" }] });
    expect(urls().every((u) => u.startsWith(`${REST_SITE}/wp-json/wp/v2/posts`))).toBe(true);
  });
});
