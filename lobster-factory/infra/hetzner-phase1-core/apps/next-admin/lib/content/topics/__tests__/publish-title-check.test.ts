// C (2026-11-20): an article made before the title-spacing check keeps its old passing checks, so on an auto-publish
// site it stops before anything goes out; a person's press still publishes it. Same harness as publish-gate.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Topic } from "../store";

const wp = vi.hoisted(() => ({ updateWpPost: vi.fn() }));
vi.mock("@/lib/content/publish/wp-post-core", () => wp);
vi.mock("@/lib/content/brand-voice-store", () => ({
  loadSiteBrand: async (_sb: unknown, siteId: string) => ({ siteId, organizationId: ORG, name: "s", defaults: { publishMode: "ai_review_auto" } }),
}));

const { topicDeps } = await import("../make");
const { continuePublishing, requestPublish } = await import("../tick");

const ORG = "11111111-1111-4111-8111-111111111111";
const oldChecks = [{ name: "seo", pass: true, detail: "SEO 90 分" }];
const row = (checks: unknown[]): Topic => ({
  id: "a", organization_id: ORG, site_id: "s1", title: "題目", keyword: "k", angle: null, source: "manual", source_ref: {},
  month: "2026-11-01", scheduled_for: null, formats: ["article"], status: "publishing", review: { pass: true, checks, at: "2026-11-19T00:00:00Z" },
  artifacts: { article: { wp_post_id: 5, wp_edit_url: "https://wp.example/wp-admin/post.php?post=5", required: [], checks } },
  version: 3, last_error: null, started_on: "2026-11-19", created_by: "staff:x", created_at: "2026-11-19T00:00:00Z", updated_at: "2026-11-19T00:00:00Z",
});

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
  wp.updateWpPost.mockReset();
  wp.updateWpPost.mockResolvedValue({ ok: true, post: { status: "publish", link: "https://wp.example/a" } });
});

describe("C title check on articles made before it", () => {
  it("old checks (no title_spacing) on an auto-publish site: not published, WordPress untouched, reason written", async () => {
    const { db, d } = deps(row(oldChecks));
    expect(await continuePublishing(d, db.row, true)).toBe("failed");
    expect(wp.updateWpPost).not.toHaveBeenCalled();
    expect(db.row.last_error).toContain("標題空格");
  });

  it("a person's press still publishes the old article; a new article with the check auto-publishes", async () => {
    const old = deps({ ...row(oldChecks), status: "reviewed" });
    const moved = await requestPublish(old.d, old.db.row, "ops:operator:u1");
    expect(await continuePublishing(old.d, moved!, true)).toBe("published");
    const fresh = deps(row([...oldChecks, { name: "title_spacing", pass: true, detail: "標題是自然的句子" }]));
    expect(await continuePublishing(fresh.d, fresh.db.row, true)).toBe("published");
  });
});
