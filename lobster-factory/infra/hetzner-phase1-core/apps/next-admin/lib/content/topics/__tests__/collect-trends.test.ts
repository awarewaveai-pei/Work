// Trends land once per geo per UTC day (B5): an existing row for today is the guard; geos are de-duplicated.
import { beforeEach, describe, expect, it, vi } from "vitest";

const runTrending = vi.hoisted(() => vi.fn(async () => [{ title: "t", traffic: "", category: "", relatedQueries: [], source: "Google News" }]));
const saveTrends = vi.hoisted(() => vi.fn(async () => 1));
vi.mock("@/lib/content/trending-sources", () => ({ runTrending, buildDbSearchBlocks: () => [] }));
vi.mock("../trends", () => ({ saveTrends }));

import { collectTrends, collectTrendsIfDue } from "../collect-trends";

/** content_trends today-rows per geo; content_sources returns none. Records each due-check filter. */
function fakeSb(storedToday: Set<string>) {
  const checks: Array<{ geo: string; day: string }> = [];
  const sb = {
    from: (table: string) => {
      if (table === "content_sources") return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      const f: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq: (k: string, v: string) => { f[k] = v; return chain; },
        limit: async () => { checks.push({ geo: f.geo, day: f.fetched_on }); return { data: storedToday.has(f.geo) ? [{ id: "x" }] : [], error: null }; },
      };
      return chain;
    },
  };
  return { sb: sb as never, checks };
}

beforeEach(() => { runTrending.mockClear(); saveTrends.mockClear(); });

describe("collectTrendsIfDue", () => {
  it("(a) no row today -> runs the sources and stores once", async () => {
    const { sb, checks } = fakeSb(new Set());
    await expect(collectTrendsIfDue(sb, ["TW"])).resolves.toEqual(["TW"]);
    expect(runTrending).toHaveBeenCalledTimes(1);
    expect(saveTrends).toHaveBeenCalledTimes(1);
    expect(checks[0]).toEqual({ geo: "TW", day: new Date().toISOString().slice(0, 10) });
  });

  it("(b) a row already stored today -> nothing runs, nothing stored", async () => {
    const { sb } = fakeSb(new Set(["TW"]));
    await expect(collectTrendsIfDue(sb, ["TW"])).resolves.toEqual([]);
    expect(runTrending).not.toHaveBeenCalled();
    expect(saveTrends).not.toHaveBeenCalled();
  });

  it("(c) duplicate geos are collected once each", async () => {
    const { sb } = fakeSb(new Set());
    await expect(collectTrendsIfDue(sb, ["TW", "TW", "HK"])).resolves.toEqual(["TW", "HK"]);
    expect(runTrending).toHaveBeenCalledTimes(2);
  });

  it("a failed due-check throws (the sweep records it)", async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: "boom" } }) }) }) }) }) };
    await expect(collectTrendsIfDue(sb as never, ["TW"])).rejects.toThrow("content_trends:due:boom");
  });
});

describe("collectTrends", () => {
  it("a failed store is logged, not thrown, and the items still come back", async () => {
    saveTrends.mockRejectedValueOnce(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sb } = fakeSb(new Set());
    await expect(collectTrends(sb, "TW")).resolves.toMatchObject({ saved: 0, items: [expect.objectContaining({ title: "t" })] });
    warn.mockRestore();
  });
});
