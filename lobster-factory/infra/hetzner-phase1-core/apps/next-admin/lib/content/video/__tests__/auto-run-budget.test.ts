import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ brief: {} as Record<string, unknown>, calls: 0, spent: { usd: 0, model: "" } }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({}), runForOrg: async (_o: string, _a: string, fn: () => unknown) => fn() }));
vi.mock("@/lib/social/store", () => ({ listAccounts: async () => [{ id: "fb", platform: "facebook", status: "connected" }] }));
vi.mock("@/lib/social/write-posts-claude", () => ({ claudeWriter: async () => ({ spent: state.spent, ask: async () => { state.calls++; state.spent.usd += 0.001; return "{}"; } }) }));
vi.mock("@/lib/social/write-posts", async (original) => ({ ...await original(), writeSocialPosts: async (_i: unknown, ask: (p: string) => Promise<string>) => { await ask("測試社群文案"); return { tooLong: [], wrongLanguage: [], posts: { facebook: "文案" } }; } }));
vi.mock("../social-drafts-deps", () => ({ draftDeps: () => ({}), loadVideoRows: async () => [{ id: "v1", metadata: { script: "旁白" } }] }));
vi.mock("../social-drafts", () => ({ saveVideoSocialDrafts: async () => ({ ok: true, drafts: [{}] }) }));
import { advanceDeps } from "../project-advance-deps";

const db = { from(table: string) {
  const data = () => table === "media_production_projects" ? { brief_json: state.brief } : table === "wp_sites" ? { content_defaults: {} } : [{ id: "v1", metadata: {} }];
  const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
    update: (p: { brief_json: Record<string, unknown> }) => { state.brief = p.brief_json; return q; },
    single: async () => ({ data: data(), error: null }), maybeSingle: async () => ({ data: data(), error: null }),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(resolve),
  }; return q;
} };
beforeEach(() => { vi.stubEnv("ANTHROPIC_API_KEY", "test-only"); state.calls = 0; state.spent.usd = 0; });
const run = () => advanceDeps(db as never, "org", "actor").drafts({ id: "p", organizationId: "org", title: "測試", updatedAtMs: 0 }, []);
it("NT$0 stops before any paid social writer call", async () => {
  state.brief = { autoBudget: { runId: "run-1", budgetTwd: 0, spentTwd: 0 } };
  await expect(run()).rejects.toThrow("已到上限 NT$0");
  expect(state.calls).toBe(0);
  expect(state.brief).not.toHaveProperty("autoDrafts");
});
it("reserves first, records actual usage, then marks the drafts done", async () => {
  state.brief = { autoBudget: { runId: "run-1", budgetTwd: 20, spentTwd: 0 }, keep: true };
  await run();
  expect(state.calls).toBe(1);
  expect(state.brief.keep).toBe(true);
  expect(state.brief.autoDrafts).toMatchObject({ count: 1 });
  expect(state.brief.autoBudget).toMatchObject({ spentTwd: 0.03 });
});
