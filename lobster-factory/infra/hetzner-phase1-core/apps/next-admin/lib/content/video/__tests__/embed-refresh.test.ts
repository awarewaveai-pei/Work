// N5b (b): the one-click render's site draft follows a re-rendered cut, like its social drafts (B26 part 2): the cut it
// embedded is recorded; a newer approved cut swaps the file in the draft; a live article keeps the old one and says so.
import { beforeEach, describe, expect, it, vi } from "vitest";
const swap = vi.hoisted(() => vi.fn());
vi.mock("../embed-in-post", () => ({ swapEmbeddedVideo: swap, embedVideoInNewDraft: vi.fn() }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({}), runForOrg: async (_o: string, _a: string, fn: () => unknown) => fn() }));
vi.mock("@/lib/social/store", () => ({ listAccounts: async () => [], getPost: vi.fn(), addVideo: vi.fn(), savePost: vi.fn() }));
import { fakeDb } from "./fake-db";
import { advanceDeps } from "../project-advance-deps";

const OLD = "https://r2/a-old.mp4", NEW = "https://r2/a-new.mp4";
const RELEASE = "33333333-3333-4333-8333-333333333333";
const budget = { runId: "r1", budgetTwd: 20, spentTwd: 1, renderRatios: ["16x9"], startedAt: "2026-11-19T08:00:00.000Z" };
const tables = (autoEmbedded: unknown) => ({
  media_production_projects: [{ id: "p", organization_id: "org", autonomy: "auto_after_render", updated_at: "2026-11-19T09:30:00.000Z", brief_json: { autoBudget: budget, autoDrafts: { at: "x", count: 0 }, autoEmbed: { siteId: "s1" }, autoEmbedded } }],
  media_assets: [{ id: "a-new", organization_id: "org", media_project_id: "p", is_current: true, mime_type: "video/mp4", object_url: NEW, checksum_sha256: "s-new", metadata: { ratio: "16x9" }, created_at: "2026-11-19T10:03:00.000Z" }],
  media_releases: [{ id: RELEASE, organization_id: "org", candidate_asset_id: "a-new", candidate_checksum: "s-new", status: "release_approved" }],
});
const drafts = (t: ReturnType<typeof tables>) => advanceDeps(fakeDb(() => t) as never, "org", "actor").drafts({ id: "p", organizationId: "org", title: "t", updatedAtMs: 0, runId: "r1" }, [{ id: "a-new", ratio: "16x9", checksum: "s-new" }]);
const recordOf = (t: ReturnType<typeof tables>) => (t.media_production_projects[0].brief_json as { autoEmbedded: Record<string, unknown> }).autoEmbedded;
const embedded = { at: "2026-11-19T09:40:00.000Z", postId: 77, siteId: "s1", videoUrl: OLD, checksum: "s-old" };

beforeEach(() => { swap.mockReset(); });

describe("N5b: the site draft follows a re-rendered cut", () => {
  it("cut changed, article still a draft: the old file swapped for the new cut with its Release, the record moves on", async () => {
    swap.mockResolvedValue({ ok: true, postId: 77, swapped: true });
    const t = tables(embedded);
    expect(await drafts(t)).toContain("已把網站草稿文章 #77 換成新版影片");
    expect(swap).toHaveBeenCalledWith(expect.anything(), { siteId: "s1", postId: 77, fromUrl: OLD, to: { videoUrl: NEW, releaseId: RELEASE } });
    expect(recordOf(t)).toMatchObject({ postId: 77, videoUrl: NEW, checksum: "s-new" });
    swap.mockClear();
    await drafts(t);   // the next advance: nothing left to swap
    expect(swap).not.toHaveBeenCalled();
  });

  it("the article went live meanwhile: not changed, remembered as kept for that cut and named", async () => {
    swap.mockResolvedValue({ ok: false, status: 409, error: "live", live: true });
    const t = tables(embedded);
    expect(await drafts(t)).toContain("網站文章 #77 已發布，用的是舊版影片");
    expect(recordOf(t)).toMatchObject({ videoUrl: OLD, checksum: "s-old", kept: "s-new" });
    swap.mockClear();
    await drafts(t);
    expect(swap).not.toHaveBeenCalled();
  });

  it("existing data: a record without the cut ({at, postId}) is unknown -- never swapped, no error", async () => {
    const t = tables({ at: "2026-11-19T09:40:00.000Z", postId: 77 });
    expect(await drafts(t)).toBe("社群草稿先前已建立");
    expect(swap).not.toHaveBeenCalled();
  });
});
