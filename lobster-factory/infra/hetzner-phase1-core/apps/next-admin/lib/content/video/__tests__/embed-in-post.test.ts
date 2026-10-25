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

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const { embedVideoInPost } = await import("../embed-in-post");

beforeEach(() => {
  for (const m of [resolveWpSite, checkProductionChangeAllowed, fetchMock]) m.mockReset();
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
});
