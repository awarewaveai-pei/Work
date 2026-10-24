// Trends are kept once per item per day (0121 content_trends unique (hash, fetched_on)); the plan reads the last 30 days.
import { describe, expect, it, vi } from "vitest";
import { recentTrends, saveTrends, TREND_KEEP_DAYS, trendHash, trendRows } from "../trends";

describe("trendRows", () => {
  it("one row per item: same geo + source + title ignoring case and spacing", () => {
    const rows = trendRows("tw", [
      { title: "感恩日記 ", traffic: "2萬", category: "生活", relatedQueries: ["寫法"], source: "Google News" },
      { title: "感恩日記", traffic: "", category: "", relatedQueries: [], source: "google news" },
      { title: "感恩日記", traffic: "", category: "", relatedQueries: [], source: "PTT" },
      { title: "  ", traffic: "", category: "", relatedQueries: [], source: "PTT" },
    ]);
    expect(rows.map((r) => [r.geo, r.source, r.title])).toEqual([["TW", "Google News", "感恩日記"], ["TW", "PTT", "感恩日記"]]);
    expect(rows[0].hash).toBe(trendHash("TW", "google news", "感恩日記"));
    expect(rows[0]).toMatchObject({ traffic: "2萬", category: "生活", related_queries: ["寫法"] });
  });

  it("only regions trending supports reach the shared cache", () => {
    const item = [{ title: "t", traffic: "", category: "", relatedQueries: [] }];
    expect(trendRows("Taiwan", item)).toEqual([]);
    expect(trendRows("ZZ", item)).toEqual([]);          // two capital letters, but not a supported region
    expect(trendRows("jp", item)).toHaveLength(1);
  });
});

describe("saveTrends", () => {
  it("upserts on (hash, fetched_on), ignores items already stored today, prunes this geo past TREND_KEEP_DAYS", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const lt = vi.fn(async () => ({ error: null }));
    const del = { eq: vi.fn(() => ({ lt })) };
    const sb = { from: vi.fn(() => ({ upsert, delete: () => del })) } as never;
    expect(await saveTrends(sb, "tw", [{ title: "t", traffic: "", category: "", relatedQueries: [], source: "s" }])).toBe(1);
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: "hash,fetched_on", ignoreDuplicates: true });
    expect(del.eq).toHaveBeenCalledWith("geo", "TW");
    const cutoff = new Date(Date.now() - TREND_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
    expect(lt).toHaveBeenCalledWith("fetched_on", cutoff);
  });

  it("a fetch that stores nothing still prunes; an unsupported geo touches nothing", async () => {
    const lt = vi.fn(async () => ({ error: null }));
    const upsert = vi.fn();
    const from = vi.fn(() => ({ upsert, delete: () => ({ eq: () => ({ lt }) }) }));
    expect(await saveTrends({ from } as never, "JP", [])).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
    expect(lt).toHaveBeenCalledTimes(1);
    from.mockClear();
    expect(await saveTrends({ from } as never, "ZZ", [{ title: "t", traffic: "", category: "", relatedQueries: [] }])).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("a database error throws (the route logs it and still answers)", async () => {
    const sb = { from: () => ({ upsert: async () => ({ error: { message: "down" } }) }) } as never;
    await expect(saveTrends(sb, "TW", [{ title: "t", traffic: "", category: "", relatedQueries: [] }])).rejects.toThrow("content_trends:save:down");
  });
});

describe("recentTrends", () => {
  it("asks content_trends_top for the geo since N days ago, days as numbers", async () => {
    const rpc = vi.fn(async () => ({ data: [{ title: "A", source: "s", days: "3", last_seen: "2026-10-24" }], error: null }));
    const r = await recentTrends({ rpc } as never, "tw", 30, 5);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    expect(rpc).toHaveBeenCalledWith("content_trends_top", { p_geo: "TW", p_since: since, p_limit: 5 });
    expect(r).toEqual([{ title: "A", source: "s", days: 3, last_seen: "2026-10-24" }]);
  });
});
