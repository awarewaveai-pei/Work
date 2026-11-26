// 「繼續上次」 (card U17): the unit's 3 newest works + drafts by time, nothing when there are none, one line when the read
// fails; the org queried is the session's (requireClientOrg), never one the request names.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  held: new Set<string>(),
  works: [] as Array<{ id: string; created_at: string; metadata: Record<string, unknown> }>,
  drafts: [] as Array<{ id: string; title: string | null; keyword: string; createdAt: string }>,
  fail: false,
  orgs: [] as Array<string | null>,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-ops-user-kind": "client", "x-ops-org-id": "org-1" }) }));
vi.mock("@/lib/entitlements/tables", () => ({
  billingAccount: async () => ({ contracts: [], grants: [], all_features: null }),
  createEntitlementStore: () => ({ listActiveEntitlements: async () => [] }),
}));
vi.mock("../CreditsLine", () => ({ CreditsLine: () => <p data-credits>點數</p> }));
vi.mock("@/app/LogoutButton", () => ({ LogoutButton: () => <button>登出</button> }));
vi.mock("@/lib/entitlements/door-holds", () => ({ holdsProduct: async ({ productKey }: { productKey: string }) => state.held.has(productKey) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}), getSupabaseReadClient: () => null }));
vi.mock("@/lib/studio/designs-list", () => ({
  listDesigns: async (_db: unknown, f: { organizationId: string | null }) => {
    state.orgs.push(f.organizationId);
    if (state.fail) throw new Error("db down");
    return { assets: state.works, nextCursor: null };
  },
}));
vi.mock("@/lib/content/drafts-list", () => ({
  listContentDrafts: async (_db: unknown, f: { organizationId: string | null }) => {
    state.orgs.push(f.organizationId);
    return state.drafts;
  },
}));

import PortalLauncherPage from "../page";

const page = (query: Record<string, string> = {}) => PortalLauncherPage({ searchParams: Promise.resolve(query) });
const section = (html: string) => /<section aria-label="繼續上次".*?<\/section>/.exec(html)?.[0] ?? "";

describe("launcher 繼續上次", () => {
  beforeEach(() => {
    process.env.POD_DESIGNS_ENABLED = "true";
    state.held = new Set(["content", "design"]);
    state.works = [];
    state.drafts = [];
    state.fail = false;
    state.orgs = [];
  });

  it("shows the 3 newest works and drafts merged by time, each opening its door's menu page", async () => {
    state.works = [
      { id: "w3", created_at: "2026-11-23T10:00:00Z", metadata: { subject: "新作品" } },
      { id: "w1", created_at: "2026-11-21T10:00:00Z", metadata: { subject: "舊作品" } },
    ];
    state.drafts = [
      { id: "d4", title: "最新草稿", keyword: "k", createdAt: "2026-11-24T10:00:00Z" },
      { id: "d2", title: null, keyword: "關鍵字草稿", createdAt: "2026-11-22T10:00:00Z" },
    ];
    const s = section(renderToStaticMarkup(await page()));
    const order = ["最新草稿", "新作品", "關鍵字草稿"].map((t) => s.indexOf(`>${t}</strong>`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(s).not.toContain("舊作品");
    expect(s).toContain('value="content"/><input type="hidden" name="next" value="/drafts"/><button class="btn-primary">到草稿</button>');
    expect(s).toContain('value="design"/><button class="btn-primary">到我的作品</button>');
  });

  it("no work and no draft: the section is not drawn", async () => {
    const html = renderToStaticMarkup(await page());
    expect(html).not.toContain("繼續上次");
  });

  it("a failed read is one line, no list", async () => {
    state.drafts = [{ id: "d1", title: "草稿", keyword: "k", createdAt: "2026-11-24T10:00:00Z" }];
    state.fail = true;
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("繼續上次：暫時讀不到。");
    expect(section(html)).toBe("");
  });

  it("queries the session's org, never one the request names", async () => {
    await page({ org: "22222222-2222-4222-8222-222222222222", organizationId: "33333333-3333-4333-8333-333333333333" });
    expect(state.orgs).toEqual(["org-1", "org-1"]);
  });
});
