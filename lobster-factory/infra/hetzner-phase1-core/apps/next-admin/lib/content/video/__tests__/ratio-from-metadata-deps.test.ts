/** A workbench row (url without a ratio name, metadata.ratio "9x16") is found by social-drafts deps and project-advance deps. */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/social/posts", () => ({ assertWithinLimits: vi.fn() }));
vi.mock("@/lib/social/store", () => ({ addVideo: vi.fn(), listAccounts: vi.fn(), savePost: vi.fn() }));
vi.mock("@/app/(shell)/tools/video/qa-labels", () => ({ QA_LABELS: {}, findingLabel: vi.fn() }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: vi.fn(), runForOrg: vi.fn() }));
vi.mock("@/lib/content/brand-voice", () => ({ renderSiteVoice: vi.fn() }));
vi.mock("@/lib/social/write-posts", () => ({ textsForAccounts: vi.fn(), writerKeysFor: vi.fn(), writeSocialPosts: vi.fn() }));
vi.mock("@/lib/social/write-posts-claude", () => ({ claudeWriter: vi.fn() }));
vi.mock("../editorial-rights-persist", () => ({ persistEditorialRightsQa: vi.fn() }));
vi.mock("../finalize", () => ({ finalizeVideoJob: vi.fn() }));
vi.mock("../job-store", () => ({ readJob: vi.fn() }));
vi.mock("../release-evidence", () => ({ REQUIRED_RELEASE_QA_KINDS: [], loadAuthoritativeReleaseEvidence: vi.fn() }));
vi.mock("../release-create", () => ({ createApprovedRelease: vi.fn() }));

const { draftDeps } = await import("../social-drafts-deps");
const { advanceDeps } = await import("../project-advance-deps");

const WB = "https://r2.example/video/workbench/org/abc123.mp4";
const chain = (data: unknown) => {
  const q: Record<string, unknown> = {};
  const self = new Proxy(q, { get: (_t, p) => (p === "then" ? (res: (v: unknown) => void) => res({ data, error: null }) : () => self) });
  return self;
};

describe("workbench rows (ratio only in metadata)", () => {
  it("social drafts deps finds the Release's ratio", async () => {
    const rows = [{ id: "a1", object_url: WB, checksum_sha256: "sum", metadata: { ratio: "9x16" } }];
    const db = { from: () => chain([{ id: "r1", candidate_asset_id: "a1", candidate_checksum: "sum" }]) };
    const out = await draftDeps(db as never, "org", rows, "me").releases();
    expect(out).toEqual([{ releaseId: "r1", ratio: "9x16", videoUrl: WB }]);
  });

  it("project-advance deps rows() finds the ratio", async () => {
    const db = { from: () => chain([{ id: "a1", object_url: WB, checksum_sha256: "sum", metadata: { ratio: "9x16" } }]) };
    expect(await advanceDeps(db as never, "org", "me").rows("p1")).toEqual([{ id: "a1", ratio: "9x16", checksum: "sum" }]);
  });
});
