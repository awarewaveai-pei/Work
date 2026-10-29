// The monthly topic plan: answer checks (unique keywords, days in the month, known formats/sources) and the tenant rule.
import { describe, expect, it, vi } from "vitest";

const feed = vi.hoisted(() => ({ blocks: [] as unknown[], items: [] as unknown[], fail: false, saved: 0 }));
vi.mock("@/lib/content/trending-sources", () => ({
  buildDbSearchBlocks: (rows: unknown[]) => rows,
  runBlocks: async (blocks: unknown[]) => { feed.blocks = blocks; return feed.items; },
}));
const m = vi.hoisted(() => ({ site: null as unknown, trends: [] as unknown[], folders: [] as unknown[], proposed: [] as unknown[], byGeo: {} as Record<string, unknown[]>, eventArgs: [] as unknown[], events: [] as string[], taken: [] as string[] }));
vi.mock("@/lib/events/for-month", () => ({ eventsForMonth: async (_sb: unknown, month: string, country: string | null) => { m.eventArgs = [month, country]; return m.events; } }));
vi.mock("@/lib/content/brand-voice-store", () => ({ loadSiteBrand: async () => m.site }));
vi.mock("@/lib/kb/folders", () => ({ listFolders: async () => m.folders }));
vi.mock("../trends", async (orig) => ({ ...(await orig<typeof import("../trends")>()), saveTrends: async () => { feed.saved++; return 0; },
  recentTrends: async (_sb: unknown, geo: string) => { m.trends.push(geo); return m.byGeo[geo] ?? [{ title: "感恩日記", source: "Google News", days: 1 }]; } }));
vi.mock("../store", async (orig) => ({ ...(await orig<typeof import("../store")>()), proposeTopics: async (_sb: unknown, rows: unknown[]) => { m.proposed = rows; return rows; },
  listTopics: async () => m.taken.map((keyword) => ({ keyword })) }));

import { buildPlanPrompt, parsePlan, proposeMonth, trendGeosFor } from "../plan";

const ctx = { month: "2026-02-01", daysInMonth: 28 };

describe("parsePlan", () => {
  it("keeps unique keywords, clamps days into the month, keeps known formats, defaults the rest", () => {
    const rows = parsePlan(JSON.stringify({ topics: [
      { day: 3, title: "五分鐘感恩日記", keyword: "感恩日記", angle: "給忙碌上班族", formats: ["article", "social", "video", "podcast"], source: "trending", ref: "感恩日記（Google News）" },
      { day: 9, title: "重複", keyword: "感恩日記 ".toUpperCase(), formats: [] },
      { day: 40, title: "藝術治療入門", keyword: "藝術治療", source: "made-up" },
      { title: "", keyword: "空標題" },
    ] }), ctx);
    expect(rows.map((r) => r.keyword)).toEqual(["感恩日記", "藝術治療"]);
    expect(rows[0]).toMatchObject({ formats: ["article", "social", "video"], source: "trending", source_ref: { text: "感恩日記（Google News）" },
      scheduled_for: "2026-02-03T01:00:00Z", month: "2026-02-01" });
    expect(rows[1]).toMatchObject({ formats: ["article", "social"], source: "plan", source_ref: {}, scheduled_for: "2026-02-28T01:00:00Z" });
  });

  it("caps at n and refuses an answer with nothing usable", () => {
    const many = { topics: Array.from({ length: 40 }, (_, i) => ({ day: 1, title: `t${i}`, keyword: `k${i}` })) };
    expect(parsePlan(JSON.stringify(many), ctx, 28)).toHaveLength(28);
    expect(() => parsePlan("no json", ctx)).toThrow("content_plan:unreadable_answer");
    expect(() => parsePlan('{"topics":[]}', ctx)).toThrow("content_plan:no_topics_in_answer");
  });
});

describe("prompt and geo", () => {
  it("carries the voice, trends and folders, and the target count", () => {
    const p = buildPlanPrompt({ siteName: "Soulful", voice: "語氣: 溫暖", month: "2026-11-01", daysInMonth: 30, events: [], industry: [], trends: ["感恩日記（Google News）"], folders: ["藝術治療 202610"], taken: [] });
    expect(p).toContain("共 28 個，分散在 1 到 30 日");
    expect(p).toContain("語氣: 溫暖");
    expect(p).toContain("- 感恩日記（Google News）");
    expect(p).toContain("- 藝術治療 202610");
  });

  it("events section: absent when empty, otherwise present and before the trends section (P9.2)", () => {
    const base = { siteName: "S", voice: "", month: "2026-12-01", daysInMonth: 31, trends: ["t"], folders: [], industry: [], taken: [] };
    expect(buildPlanPrompt({ ...base, events: [] })).not.toContain("節日與活動");
    const p = buildPlanPrompt({ ...base, events: ["12-25 Christmas（聖誕節）"] });
    expect(p).toContain("節日與活動");
    expect(p).toContain("- 12-25 Christmas（聖誕節）");
    expect(p.indexOf("節日與活動")).toBeLessThan(p.indexOf("近 30 天的熱門話題"));
  });

  it("industry section: absent when empty, otherwise present and before the trends section (P9.4)", () => {
    const base = { siteName: "S", voice: "", month: "2026-12-01", daysInMonth: 31, trends: ["t"], folders: [], events: [], taken: [] };
    expect(buildPlanPrompt({ ...base, industry: [] })).not.toContain("產業來源");
    const p = buildPlanPrompt({ ...base, industry: ["A", "B"] });
    expect(p).toContain("產業來源");
    expect(p).toContain("- A\n- B");
    expect(p.indexOf("產業來源")).toBeLessThan(p.indexOf("近 30 天的熱門話題"));
  });

  it("maps the article tool's countries to trending geos: global = every geo, a country with no source = none (B9)", () => {
    expect(trendGeosFor("日本")).toEqual(["JP"]);
    expect(trendGeosFor("全球（不指定）")).toEqual(["TW", "HK", "SG", "US", "GB", "JP", "AU"]);
    expect(trendGeosFor(undefined)).toEqual(["TW", "HK", "SG", "US", "GB", "JP", "AU"]);
    expect(trendGeosFor("德國")).toEqual([]);
  });
});

describe("proposeMonth", () => {
  it("asks the AI to avoid keywords this organization already planned this month (topics are unique per org+month+keyword)", async () => {
    m.site = { siteId: "s2", organizationId: "org-a", name: "Second", defaults: { targetCountry: "台灣" } };
    m.taken = ["感恩日記", "藝術治療"];
    const ask = vi.fn(async (_p: string) => JSON.stringify({ topics: [{ day: 2, title: "t", keyword: "k" }] }));
    await proposeMonth({} as never, { organizationId: "org-a", siteId: "s2", month: "2026-11", actor: "x" }, ask);
    m.taken = [];
    expect(ask.mock.calls[0][0]).toContain("這個客戶本月已排的關鍵字（不得再用）：\n- 感恩日記\n- 藝術治療");
  });

  it("refuses a site of another organization before any AI call", async () => {
    m.site = { siteId: "s", organizationId: "org-b", name: "B", defaults: {} };
    const ask = vi.fn();
    await expect(proposeMonth({} as never, { organizationId: "org-a", siteId: "s", month: "2026-11", actor: "x" }, ask)).rejects.toThrow("site_not_in_organization");
    expect(ask).not.toHaveBeenCalled();
  });

  it("plans from the site's market and stores the topics under its organization and site", async () => {
    m.site = { siteId: "s", organizationId: "org-a", name: "Soulful", defaults: { targetCountry: "香港" } };
    m.trends = [];
    const ask = vi.fn(async () => JSON.stringify({ topics: [{ day: 2, title: "t", keyword: "k" }] }));
    await proposeMonth({} as never, { organizationId: "org-a", siteId: "s", month: "2026-11-15", actor: "ops:owner:u" }, ask);
    expect(m.trends).toEqual(["HK"]);
    expect(m.proposed).toEqual([expect.objectContaining({ organization_id: "org-a", site_id: "s", created_by: "ops:owner:u", month: "2026-11-01", keyword: "k" })]);
  });

  it("a market with no trending source reads no trends and says so in the prompt (B9)", async () => {
    m.site = { siteId: "s", organizationId: "org-a", name: "Berlin", defaults: { targetCountry: "德國" } };
    m.trends = [];
    const ask = vi.fn(async (_p: string) => JSON.stringify({ topics: [{ day: 2, title: "t", keyword: "k" }] }));
    await proposeMonth({} as never, { organizationId: "org-a", siteId: "s", month: "2026-11", actor: "x" }, ask);
    expect(m.trends).toEqual([]);
    expect(ask.mock.calls[0][0]).toMatch(/近 30 天的熱門話題[^\n]*\n（無）/);
  });

  it("events are fetched for the one market's country; global or a market with no source asks with no country", async () => {
    const run = async (targetCountry: string) => {
      m.site = { siteId: "s", organizationId: "org-a", name: "S", defaults: { targetCountry } };
      m.events = ["12-25 Christmas（聖誕節）"];
      const ask = vi.fn(async (_p: string) => JSON.stringify({ topics: [{ day: 2, title: "t", keyword: "k" }] }));
      await proposeMonth({} as never, { organizationId: "org-a", siteId: "s", month: "2026-12", actor: "x" }, ask);
      return { args: m.eventArgs, prompt: ask.mock.calls[0][0] };
    };
    const tw = await run("台灣");
    expect(tw.args).toEqual(["2026-12-01", "TW"]);
    expect(tw.prompt).toContain("- 12-25 Christmas（聖誕節）");
    expect((await run("全球（不指定）")).args).toEqual(["2026-12-01", null]);
    expect((await run("德國")).args).toEqual(["2026-12-01", null]);
  });

  it("the site's own feeds become ephemeral blocks, reach only its prompt, and are never saved as shared trends (B10)", async () => {
    m.site = { siteId: "s", organizationId: "org-a", name: "S", defaults: { targetCountry: "台灣", trendFeeds: ["https://a.example/feed", "https://b.example/rss", "http://bad"] } };
    feed.blocks = []; feed.saved = 0; feed.items = [{ title: "產業新聞一" }, { title: "產業新聞二" }];
    const ask = vi.fn(async (_p: string) => JSON.stringify({ topics: [{ day: 2, title: "t", keyword: "k" }] }));
    await proposeMonth({} as never, { organizationId: "org-a", siteId: "s", month: "2026-11", actor: "x" }, ask);
    expect(feed.blocks).toHaveLength(2);
    expect(feed.blocks[0]).toMatchObject({ id: "site-s-0", label: "a.example", url: "https://a.example/feed" });
    expect(ask.mock.calls[0][0]).toContain("- 產業新聞一\n- 產業新聞二");
    expect(feed.saved).toBe(0);
    feed.items = [];
  });

  it("feeds that all fail still plan (empty industry, no section)", async () => {
    m.site = { siteId: "s", organizationId: "org-a", name: "S", defaults: { trendFeeds: ["https://a.example/feed"] } };
    feed.items = [];
    const ask = vi.fn(async (_p: string) => JSON.stringify({ topics: [{ day: 2, title: "t", keyword: "k" }] }));
    await proposeMonth({} as never, { organizationId: "org-a", siteId: "s", month: "2026-11", actor: "x" }, ask);
    expect(ask.mock.calls[0][0]).not.toContain("產業來源");
    expect(m.proposed).toHaveLength(1);
  });

  it("a global site plans from every geo's trends", async () => {
    m.site = { siteId: "s", organizationId: "org-a", name: "Global", defaults: { targetCountry: "全球（不指定）" } };
    m.trends = [];
    const ask = vi.fn(async (_p: string) => JSON.stringify({ topics: [{ day: 2, title: "t", keyword: "k" }] }));
    await proposeMonth({} as never, { organizationId: "org-a", siteId: "s", month: "2026-11", actor: "x" }, ask);
    expect(m.trends).toEqual(["TW", "HK", "SG", "US", "GB", "JP", "AU"]);
  });

  it("takes each geo's trends in turns and counts a shared headline once, case- and spacing-blind", async () => {
    m.site = { siteId: "s", organizationId: "org-a", name: "Global", defaults: {} };
    m.byGeo = { TW: [{ title: "A", source: "s", days: 9 }, { title: "shared", source: "s", days: 8 }],
      HK: [{ title: "SHARED ", source: "s", days: 3 }, { title: "C", source: "s", days: 2 }] };
    for (const g of ["SG", "US", "GB", "JP", "AU"]) m.byGeo[g] = [];
    const ask = vi.fn(async (_p: string) => JSON.stringify({ topics: [{ day: 2, title: "t", keyword: "k" }] }));
    await proposeMonth({} as never, { organizationId: "org-a", siteId: "s", month: "2026-11", actor: "x" }, ask);
    m.byGeo = {};
    expect(ask.mock.calls[0][0]).toContain("- A（s）\n- SHARED （s）\n- C（s）\n\n");
  });
});
