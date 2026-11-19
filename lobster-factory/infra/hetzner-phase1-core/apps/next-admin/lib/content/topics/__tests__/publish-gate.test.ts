// N6: a topic goes out only when its site publishes by itself or a person pressed 發布 for that run (make.ts
// publishDrafts). The real topicDeps behind an in-memory topic row; WordPress and the site are fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Topic } from "../store";

const wp = vi.hoisted(() => ({ updateWpPost: vi.fn() }));
vi.mock("@/lib/content/publish/wp-post-core", () => wp);
const site = vi.hoisted(() => ({ mode: "human_review" as string }));
vi.mock("@/lib/content/brand-voice-store", () => ({
  loadSiteBrand: async (_sb: unknown, siteId: string) => ({ siteId, organizationId: ORG, name: "s", defaults: { publishMode: site.mode } }),
}));

const { topicDeps } = await import("../make");
const { continuePublishing, requestPublish, tickTopics } = await import("../tick");

const ORG = "11111111-1111-4111-8111-111111111111";
const review = { pass: true, checks: [], at: "2026-11-19T00:00:00Z" };
const row = (over: Partial<Topic> = {}): Topic => ({
  id: "a", organization_id: ORG, site_id: "s1", title: "題目", keyword: "k", angle: null, source: "manual", source_ref: {},
  month: "2026-11-01", scheduled_for: null, formats: ["article"], status: "reviewed", review,
  artifacts: { article: { wp_post_id: 5, wp_edit_url: "https://wp.example/wp-admin/post.php?post=5", required: [] } },
  version: 3, last_error: null, started_on: "2026-11-19", created_by: "staff:x", created_at: "2026-11-19T00:00:00Z", updated_at: "2026-11-19T00:00:00Z", ...over,
});

/** topicDeps with its store calls over one row (moves guarded by status + version, like store.ts). */
function deps(start: Topic) {
  const db = { row: { ...start } };
  const write = (cur: Topic, to: Topic["status"], patch: Partial<Topic> = {}) => {
    if (db.row.status !== cur.status || db.row.version !== cur.version) return null;
    db.row = { ...db.row, ...patch, status: to, version: db.row.version + 1 };
    return { ...db.row };
  };
  const d = {
    ...topicDeps({} as never, ORG, "ops:operator:u1", { capTwd: null }),
    inStatus: async (s: Topic["status"][]) => (s.includes(db.row.status) ? [{ ...db.row }] : []),
    due: async () => [],
    move: async (cur: Topic, to: Topic["status"], patch?: Partial<Topic>) => write(cur, to, patch),
    claim: async (cur: Topic, patch?: { artifacts: Record<string, unknown> }) => write(cur, cur.status, patch ?? {}),
  };
  return { db, d };
}

beforeEach(() => {
  site.mode = "human_review";
  wp.updateWpPost.mockReset();
  wp.updateWpPost.mockResolvedValue({ ok: true, post: { status: "publish", link: "https://wp.example/a" } });
});

describe("N6 publish gate (out only by auto publish or a person's press)", () => {
  it("沒人點頭的站不得發布: a human-review site's topic in 'publishing' without a press fails, WordPress untouched", async () => {
    const { db, d } = deps(row({ status: "publishing" }));
    expect(await continuePublishing(d, db.row, true)).toBe("failed");
    expect(wp.updateWpPost).not.toHaveBeenCalled();
    expect(db.row.last_error).toContain("沒有人按「發布」");
  });

  it("a person's press publishes through the same steps and records who and when", async () => {
    const { db, d } = deps(row());
    const moved = await requestPublish(d, db.row, "ops:operator:u1");
    expect(moved?.status).toBe("publishing");
    expect(await continuePublishing(d, moved!, true)).toBe("published");
    expect(wp.updateWpPost).toHaveBeenCalledTimes(1);
    expect(db.row.artifacts).toMatchObject({ publish: { requestedBy: "ops:operator:u1", requestedAt: expect.any(String) }, article: { published: { link: "https://wp.example/a" } } });
  });

  it("existing data: a reviewed topic made before N6 (no publish record) on a human-review site stays reviewed through the schedule", async () => {
    const { db, d } = deps(row());
    await tickTopics(d);
    expect(db.row.status).toBe("reviewed");
    expect(wp.updateWpPost).not.toHaveBeenCalled();
  });
});
