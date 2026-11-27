// 「最近使用／常用」 (card U24): only the signed-in person's own entitlement.usage rows (a colleague of the same unit and
// another unit never show); 5 newest distinct features, 3 most used in 30 days; nothing drawn without data; one line on
// a failed read. The fake table applies the loader's real filters, so dropping the actor filter turns the privacy test red.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type Row = { organization_id: string; event_type: string; created_at: string; payload: Record<string, unknown> };
const state = vi.hoisted(() => ({ held: new Set<string>(), rows: [] as Row[], fail: false, user: "u-1" as string | null }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-ops-user-kind": "client", "x-ops-org-id": "org-1", ...(state.user ? { "x-ops-user-id": state.user } : {}) }),
}));
vi.mock("@/lib/entitlements/tables", () => ({
  billingAccount: async () => ({ contracts: [], grants: [], all_features: null }),
  createEntitlementStore: () => ({ listActiveEntitlements: async () => [] }),
}));
vi.mock("../CreditsLine", () => ({ CreditsLine: () => <p data-credits>點數</p> }));
vi.mock("@/app/LogoutButton", () => ({ LogoutButton: () => <button>登出</button> }));
vi.mock("@/lib/entitlements/door-holds", () => ({ holdsProduct: async ({ productKey }: { productKey: string }) => state.held.has(productKey) }));
vi.mock("../ResumeSection", async (orig) => ({ ...(await orig<typeof import("../ResumeSection")>()), loadResume: async () => [] }));

// A PostgREST-shaped builder over state.rows: eq (incl. payload->>key), gte, order desc, limit.
function table() {
  const preds: Array<(r: Row) => boolean> = [];
  let max = Infinity;
  const field = (r: Row, col: string) => (col.startsWith("payload->>") ? r.payload[col.slice(10)] : (r as unknown as Record<string, unknown>)[col]);
  const b = {
    select: () => b,
    eq: (col: string, v: unknown) => (preds.push((r) => field(r, col) === v), b),
    gte: (col: string, v: string) => (preds.push((r) => String(field(r, col)) >= v), b),
    order: () => b,
    limit: (n: number) => ((max = n), b),
    then: (ok: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
      if (state.fail) return Promise.resolve({ data: null, error: { message: "db down" } }).then(ok);
      const data = state.rows.filter((r) => preds.every((p) => p(r))).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, max);
      return Promise.resolve({ data, error: null }).then(ok);
    },
  };
  return b;
}
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({ from: () => table() }), getSupabaseReadClient: () => null }));

import PortalLauncherPage from "../page";

const page = () => PortalLauncherPage({ searchParams: Promise.resolve({}) });
const section = (html: string) => /<section aria-label="最近使用".*?<\/section>/.exec(html)?.[0] ?? "";
const names = (html: string, kind: "recent" | "frequent") =>
  [...section(html).matchAll(new RegExp(`data-used="${kind}"[^>]*><span[^>]*><strong[^>]*>([^<]+)</strong>`, "g"))].map((m) => m[1]);

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const use = (feature_key: string, daysAgo: number, actor = "client:org-1:u-1", org = "org-1"): Row =>
  ({ organization_id: org, event_type: "entitlement.usage", created_at: day(daysAgo), payload: { feature_key, actor, use: "true" } });
// the charge row the same call writes after delivery (report / settlePaid): no use mark
const charge = (feature_key: string, daysAgo: number): Row =>
  ({ organization_id: "org-1", event_type: "entitlement.usage", created_at: day(daysAgo), payload: { feature_key, actor: "client:org-1:u-1", units: 3 } });

describe("launcher 最近使用／常用", () => {
  beforeEach(() => {
    state.held = new Set(["content", "studio", "social", "video"]);
    state.rows = [];
    state.fail = false;
    state.user = "u-1";
  });

  it("shows only the signed-in person's use: a colleague of the unit and another unit never appear", async () => {
    state.rows = [
      use("content.article", 1),
      use("studio.image", 2, "client:org-1:u-2"),               // a colleague
      use("social.rewrite", 3, "ops:admin:staff-1"),             // staff acting for the unit
      use("video.script", 4, "client:org-2:u-1", "org-2"),       // another unit
      use("video.tts", 5, "client:org-2:u-1"),                   // another unit's actor on this unit's row
    ];
    const html = renderToStaticMarkup(await page());
    expect(names(html, "recent")).toEqual(["文章生成"]);
    expect(names(html, "frequent")).toEqual(["文章生成"]);
    expect(section(html)).toContain('value="content"/><button class="btn-primary">開啟</button>');
  });

  it("最近: 5 newest distinct features; 常用: 3 most used within 30 days", async () => {
    state.rows = [
      use("content.article", 1), use("content.article", 2), use("content.article", 3),
      use("studio.image", 4), use("studio.image", 5),
      use("social.rewrite", 6), use("social.rewrite", 7),
      use("video.script", 8),
      use("content.humanize", 9),
      use("video.tts", 10),                                       // 6th distinct: not in 最近
      use("video.tts", 40), use("video.tts", 41), use("video.tts", 42), use("video.tts", 43),   // older than 30 days
      use("cognitive.unknown", 1),                                // not a feature of a held door
    ];
    const html = renderToStaticMarkup(await page());
    expect(names(html, "recent")).toEqual(["文章生成", "圖片生成", "AI 多平台改寫", "腳本生成", "文章人性化"]);
    expect(names(html, "frequent")).toEqual(["文章生成", "圖片生成", "AI 多平台改寫"]);
    expect(section(html)).toContain("30 天內 3 次");
  });

  it("one call's use row and charge row count once", async () => {
    state.rows = [use("content.article", 1), charge("content.article", 1), use("studio.image", 2), charge("studio.image", 2), charge("studio.image", 3)];
    const html = renderToStaticMarkup(await page());
    expect(names(html, "frequent")).toEqual(["文章生成", "圖片生成"]);
    expect(section(html)).toContain("30 天內 1 次");
    expect(section(html)).not.toContain("30 天內 2 次");
  });

  it("no use: the section is not drawn", async () => {
    const html = renderToStaticMarkup(await page());
    expect(html).not.toContain("最近使用");
  });

  it("a failed read is one line, no list", async () => {
    state.rows = [use("content.article", 1)];
    state.fail = true;
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("最近使用：暫時讀不到。");
    expect(section(html)).toBe("");
  });
});
