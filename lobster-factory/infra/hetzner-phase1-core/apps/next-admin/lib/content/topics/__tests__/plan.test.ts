// The monthly topic plan: answer checks (unique keywords, days in the month, known formats/sources) and the tenant rule.
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ site: null as unknown, trends: [] as unknown[], folders: [] as unknown[], proposed: [] as unknown[] }));
vi.mock("@/lib/content/brand-voice-store", () => ({ loadSiteBrand: async () => m.site }));
vi.mock("@/lib/kb/folders", () => ({ listFolders: async () => m.folders }));
vi.mock("../trends", () => ({ recentTrends: async (_sb: unknown, geo: string) => { m.trends.push(geo); return [{ title: "感恩日記", source: "Google News", fetched_on: "2026-10-20" }]; } }));
vi.mock("../store", async (orig) => ({ ...(await orig<typeof import("../store")>()), proposeTopics: async (_sb: unknown, rows: unknown[]) => { m.proposed = rows; return rows; } }));

import { buildPlanPrompt, geoFor, parsePlan, proposeMonth } from "../plan";

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
    const p = buildPlanPrompt({ siteName: "Soulful", voice: "語氣: 溫暖", month: "2026-11-01", daysInMonth: 30, trends: ["感恩日記（Google News）"], folders: ["藝術治療 202610"] });
    expect(p).toContain("共 28 個，分散在 1 到 30 日");
    expect(p).toContain("語氣: 溫暖");
    expect(p).toContain("- 感恩日記（Google News）");
    expect(p).toContain("- 藝術治療 202610");
  });

  it("maps the article tool's countries to trending geos; a market with no trending source is null, not Taiwan (B9)", () => {
    expect(geoFor("日本")).toBe("JP");
    expect(geoFor("全球（不指定）")).toBeNull();
    expect(geoFor("德國")).toBeNull();
    expect(geoFor(undefined)).toBeNull();
  });
});

describe("proposeMonth", () => {
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
});
