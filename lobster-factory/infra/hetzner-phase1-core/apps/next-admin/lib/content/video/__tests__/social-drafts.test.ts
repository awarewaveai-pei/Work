// V5.2: ticking YouTube and Instagram makes two drafts, one with the 16:9 video and one with the 4:5 video.
import { describe, expect, it, vi } from "vitest";
import { saveVideoSocialDrafts, type DraftDeps } from "../social-drafts";

const releases = [
  { releaseId: "r169", ratio: "16x9", videoUrl: "https://v.example.com/video/d/16x9.mp4" },
  { releaseId: "r45", ratio: "4x5", videoUrl: "https://v.example.com/video/d/4x5.mp4" },
];
const accounts = [
  { id: "yt", platform: "youtube", status: "connected", label: "YT" },
  { id: "ig", platform: "instagram", status: "connected", label: "IG" },
  { id: "old", platform: "tiktok", status: "expired", label: "TT" },
];
function deps(over: Partial<DraftDeps> = {}) {
  const d = {
    accounts: async () => accounts, releases: async () => releases, assertWithinLimits: vi.fn(async () => {}),
    addVideo: vi.fn(async (url: string) => ({ id: `media:${url}` })),
    savePost: vi.fn(async (_f: { body: string }, accountId: string) => ({ id: `post:${accountId}` })),
  };
  return { ...d, ...over } as typeof d;
}

describe("saveVideoSocialDrafts", () => {
  it("YouTube + Instagram -> two drafts: 16x9 and 4x5, each with its own video and text", async () => {
    const d = deps();
    const res = await saveVideoSocialDrafts(d, "t", [{ accountId: "yt", text: "yt text" }, { accountId: "ig", text: "ig text" }]);
    expect(res).toMatchObject({ ok: true, drafts: [{ accountId: "yt", ratio: "16x9" }, { accountId: "ig", ratio: "4x5" }] });
    expect(d.addVideo.mock.calls.map((c) => c[0])).toEqual([releases[0].videoUrl, releases[1].videoUrl]);
    expect(d.savePost.mock.calls[1][0].body).toBe("ig text");
  });

  it("refuses without saving when a channel has no released ratio, is expired, or a text is over its limit", async () => {
    const none = deps({ releases: async () => [] });
    expect((await saveVideoSocialDrafts(none, "t", [{ accountId: "yt", text: "x" }])).ok).toBe(false);
    const expired = deps();
    expect((await saveVideoSocialDrafts(expired, "t", [{ accountId: "old", text: "x" }])).ok).toBe(false);
    const long = deps({ assertWithinLimits: vi.fn(async () => { throw new Error("text longer than the platform allows"); }) });
    await expect(saveVideoSocialDrafts(long, "t", [{ accountId: "yt", text: "x" }])).rejects.toThrow("longer");
    for (const x of [none, expired, long]) { expect(x.addVideo).not.toHaveBeenCalled(); expect(x.savePost).not.toHaveBeenCalled(); }
  });

  it("a video made in one ratio still reaches every channel", async () => {
    const d = deps({ releases: async () => [releases[0]] });
    const res = await saveVideoSocialDrafts(d, "t", [{ accountId: "yt", text: "a" }, { accountId: "ig", text: "b" }]);
    expect(res).toMatchObject({ ok: true, drafts: [{ ratio: "16x9" }, { ratio: "16x9" }] });
    expect(d.addVideo).toHaveBeenCalledTimes(1);
  });
});
