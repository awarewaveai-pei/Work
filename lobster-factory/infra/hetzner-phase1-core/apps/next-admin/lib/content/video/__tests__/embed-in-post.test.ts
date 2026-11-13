// embedVideoInPost: the core shared by the embed-to-wp route and the pipeline clock.
// Route-level behavior is covered by app/api/video/embed-to-wp/route.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orgIdentity } from "@/lib/tenant-guard";

const ORG = "11111111-1111-1111-1111-111111111111";
const resolveWpSite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/wp-sites", () => ({ resolveWpSite }));

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_c: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string }> => ({ allowed: true, mode: "normal" })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

const publishToWordPress = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/publish/wordpress-core", () => ({ publishToWordPress }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const { embedVideoInPost, embedVideoInNewDraft } = await import("../embed-in-post");

beforeEach(() => {
  for (const m of [resolveWpSite, checkProductionChangeAllowed, fetchMock, publishToWordPress]) m.mockReset();
  checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });
  resolveWpSite.mockResolvedValue({
    site: { id: "1", url: "https://acme.example", organizationId: ORG },
    token: "tok",
    username: "admin",
    authHeader: "Basic xxx",
  });
});

describe("embedVideoInPost", () => {
  const INPUT = { siteId: "1", postId: 5, videoUrl: "https://cdn.example/v$&.mp4" };

  it("passes the identity to resolveWpSite and replaces every placeholder literally", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("context=edit")
        ? { ok: true, json: async () => ({ content: { raw: "a <!-- VIDEO_PLACEHOLDER --> b <!-- VIDEO_PLACEHOLDER -->" } }) }
        : { ok: true, json: async () => ({}) },
    );
    const identity = orgIdentity(ORG);
    const res = await embedVideoInPost(identity, INPUT);
    expect(res).toEqual({ ok: true, postId: 5, videoUrl: INPUT.videoUrl });
    expect(resolveWpSite.mock.calls[0][0]).toBe(identity);
    expect(resolveWpSite.mock.calls[0][1]).toBe("1");
    const patch = fetchMock.mock.calls.find((c) => !String(c[0]).includes("context=edit"))!;
    expect(JSON.parse(patch[1].body).content).toBe(`a ${INPUT.videoUrl} b ${INPUT.videoUrl}`);
  });

  it("a blank siteId is refused before resolveWpSite (its fallback would pick the first accessible site)", async () => {
    const res = await embedVideoInPost(orgIdentity(ORG), { ...INPUT, siteId: "  " });
    expect(res).toEqual({ ok: false, status: 400, error: "siteId required" });
    expect(resolveWpSite).not.toHaveBeenCalled();
  });

  it("gate not allowed: blockedMode, no WordPress request", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const res = await embedVideoInPost(orgIdentity(ORG), INPUT);
    expect(res).toEqual({ ok: false, blockedMode: "emergency_stop" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("once: an article that already carries the video is not written again", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: { raw: `intro\n\n${INPUT.videoUrl}\n` } }) });
    const res = await embedVideoInPost(orgIdentity(ORG), { ...INPUT, once: true });
    expect(res).toEqual({ ok: true, postId: 5, videoUrl: INPUT.videoUrl });
    expect(fetchMock).toHaveBeenCalledTimes(1);   // the GET only
  });

  // P6.10 defect B (2026-11-13): the release page listed published posts and its embed edited them live.
  // draftOnly: a post that is not a draft is refused before any write, so the release page cannot put anything live.
  it.each(["publish", "future", "private"])("draftOnly: a %s post is refused, nothing written", async (status) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status, content: { raw: "body" } }) });
    const res = await embedVideoInPost(orgIdentity(ORG), { ...INPUT, draftOnly: true });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);   // the GET only, no PATCH
  });
  it("draftOnly: a draft is embedded", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("context=edit") ? { ok: true, json: async () => ({ status: "draft", content: { raw: "body" } }) } : { ok: true, json: async () => ({}) });
    const res = await embedVideoInPost(orgIdentity(ORG), { ...INPUT, draftOnly: true });
    expect(res).toEqual({ ok: true, postId: 5, videoUrl: INPUT.videoUrl });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // the write carries the status it read, so a post published in between is not left live (Codex 67aa39bb F1)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).status).toBe("draft");
  });
  it("without draftOnly the write leaves the status alone (content pipeline)", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("context=edit") ? { ok: true, json: async () => ({ status: "publish", content: { raw: "body" } }) } : { ok: true, json: async () => ({}) });
    await embedVideoInPost(orgIdentity(ORG), INPUT);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("status");
  });
});

describe("embedVideoInNewDraft", () => {
  it("creates the post through publishToWordPress as a draft, then embeds draft-only into that post", async () => {
    publishToWordPress.mockResolvedValue({ ok: true, post_id: 77, edit_url: "https://acme.example/wp-admin/post.php?post=77&action=edit" });
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("context=edit") ? { ok: true, json: async () => ({ status: "draft", content: { raw: "intro" } }) } : { ok: true, json: async () => ({}) });
    const identity = orgIdentity(ORG);
    const res = await embedVideoInNewDraft(identity, { siteId: "1", title: "新品介紹", intro: "", videoUrl: "https://cdn.example/v.mp4" });
    expect(res).toMatchObject({ ok: true, postId: 77, editUrl: "https://acme.example/wp-admin/post.php?post=77&action=edit" });
    const [input, who] = publishToWordPress.mock.calls[0];
    expect(input).toMatchObject({ siteId: "1", publishStatus: "draft" });
    expect(input.markdown).toMatch(/^# 新品介紹\n/);
    expect(who).toBe(identity);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/posts/77?context=edit");
  });
  it("draft made but the embed failed: the error names the draft, so a retry does not make another", async () => {
    publishToWordPress.mockResolvedValue({ ok: true, post_id: 78 });
    fetchMock.mockResolvedValue({ ok: false, status: 504, json: async () => ({ message: "timeout" }) });
    const res = await embedVideoInNewDraft(orgIdentity(ORG), { siteId: "1", title: "t", videoUrl: "https://cdn.example/v.mp4" });
    expect(res).toMatchObject({ ok: false, status: 504 });
    expect((res as { error: string }).error).toContain("#78");
  });
  it("a blocked or failed draft creation embeds nothing", async () => {
    publishToWordPress.mockResolvedValue({ ok: false, status: 423, error: "blocked", wire: "json", mode: "emergency_stop" });
    expect(await embedVideoInNewDraft(orgIdentity(ORG), { siteId: "1", title: "t", videoUrl: "https://cdn.example/v.mp4" })).toEqual({ ok: false, blockedMode: "emergency_stop" });
    publishToWordPress.mockResolvedValue({ ok: false, status: 502, error: "bridge: down", wire: "json" });
    expect(await embedVideoInNewDraft(orgIdentity(ORG), { siteId: "1", title: "t", videoUrl: "https://cdn.example/v.mp4" })).toEqual({ ok: false, status: 502, error: "bridge: down" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
