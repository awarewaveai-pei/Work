// B1: a draft item may name the ratio the operator picked for its channel; it wins over the platform default, and a ratio with no approved Release is refused before anything is uploaded.
import { describe, expect, it, vi } from "vitest";
import { saveVideoSocialDrafts, type DraftDeps } from "./social-drafts";

const releases = [{ releaseId: "r1", ratio: "16x9", videoUrl: "https://r2/16x9.mp4" }, { releaseId: "r2", ratio: "4x5", videoUrl: "https://r2/4x5.mp4" }];
function deps() {
  const addVideo = vi.fn(async (url: string) => ({ id: "m:" + url }));
  const savePost = vi.fn(async () => ({ id: "p" }));
  const d: DraftDeps = {
    accounts: async () => [{ id: "yt", platform: "youtube", status: "connected", label: "YT" }, { id: "ig", platform: "instagram", status: "connected", label: "IG" }],
    releases: async () => releases, assertWithinLimits: async () => {}, addVideo, savePost,
  };
  return { d, addVideo, savePost };
}

describe("saveVideoSocialDrafts ratio pick", () => {
  it("no pick = platform default; a pick wins over it", async () => {
    const { d } = deps();
    const r = await saveVideoSocialDrafts(d, "t", [{ accountId: "yt", text: "a" }, { accountId: "ig", text: "b", ratio: "16x9" }]);
    expect(r).toMatchObject({ ok: true, drafts: [{ accountId: "yt", ratio: "16x9" }, { accountId: "ig", ratio: "16x9" }] });
  });
  it("a ratio without an approved Release is refused and nothing is uploaded", async () => {
    const { d, addVideo, savePost } = deps();
    const r = await saveVideoSocialDrafts(d, "t", [{ accountId: "yt", text: "a", ratio: "9x16" }]);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(addVideo).not.toHaveBeenCalled(); expect(savePost).not.toHaveBeenCalled();
  });
});
