// 數據分析 (SOCIAL_MANAGER_PLAN.md C24): the snapshot merge (a day fetched again is the later fetch) and the period sums.
// The Facebook series is a real Postiz v2.25.1 answer (ks-aw-01, 2026-10-18 03:12 UTC, page Soulful Expression Art
// Therapy, G6 in WORKLOG), cut to two metrics.
import { describe, expect, it } from "vitest";
import { facebookDays, mergeDays, periodOf, summarize, type DayRow } from "../metrics";

const row = (account_id: string, day: string, v: Partial<DayRow> = {}): DayRow =>
  ({ account_id, day, followers: null, reach: null, impressions: null, engagement: null, posts: null, ...v });

describe("snapshot merge", () => {
  it("Facebook: the measured day is the day before Postiz's date; a day still counting is left out; a re-fetch overwrites what it brings and keeps the rest", () => {
    const series = [
      { label: "Page Impressions", percentageChange: 5, data: [{ total: 3, date: "2026-10-15" }, { total: 0, date: "2026-10-16" }, { total: 1, date: "2026-10-17" }, { total: 0, date: "2026-10-18" }, { total: 0, date: "2026-10-19" }] },
      { label: "Media views", percentageChange: 5, data: [{ total: 9, date: "2026-10-15" }, { total: 0, date: "2026-10-16" }, { total: 8, date: "2026-10-17" }, { total: 0, date: "2026-10-18" }, { total: 0, date: "2026-10-19" }] },
      { label: "Page followers", percentageChange: 5, data: [{ total: 0, date: "2026-10-17" }] },
    ];
    const days = facebookDays(series, new Date("2026-10-18T03:12:07Z"));
    // 10-18 and 10-19 end after 03:12 UTC: not numbers yet. Page followers (new follows a day) is not a total: dropped.
    expect([...days.keys()].sort()).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(days.get("2026-10-16")).toEqual({ reach: 1, impressions: 8 });

    const stored = [row("a", "2026-10-16", { reach: 0, impressions: 2, engagement: 5 })];
    const incoming = [...days].map(([day, v]) => row("a", day, v));
    const merged = mergeDays(stored, incoming);
    // same day fetched again: reach / impressions are the new fetch; engagement it did not bring stays
    expect(merged.find((r) => r.day === "2026-10-16")).toEqual(row("a", "2026-10-16", { reach: 1, impressions: 8, engagement: 5 }));
    // a field nobody has stays null, never 0
    expect(merged.find((r) => r.day === "2026-10-14")).toEqual(row("a", "2026-10-14", { reach: 3, impressions: 9 }));
  });
});

describe("period sums", () => {
  const p = periodOf("2026-10-18", 7);   // 10-11 .. 10-17, before it 10-04 .. 10-10

  it("flows add up over days and channels; followers is the last count; a field only one channel has is that channel's", () => {
    const rows = [
      row("fb", "2026-10-11", { reach: 10, impressions: 20, engagement: 2 }),
      row("fb", "2026-10-17", { reach: 30, impressions: 40, engagement: 4 }),
      row("bs", "2026-10-12", { followers: 5, posts: 1, engagement: 3 }),
      row("bs", "2026-10-16", { followers: 7, posts: 2, engagement: 6 }),
      row("bs", "2026-10-10", { followers: 4, posts: 1, engagement: 1 }),   // the period before
      row("fb", "2026-10-18", { reach: 999 }),                               // today: outside both
    ];
    const s = summarize(rows, ["fb", "bs"], p);
    expect(p.days).toHaveLength(7);
    expect(s.kpis.reach).toEqual({ value: 40, prev: null });
    expect(s.kpis.engagement).toEqual({ value: 15, prev: 1 });
    expect(s.kpis.followers).toEqual({ value: 7, prev: 4 });
    expect(s.kpis.posts).toEqual({ value: 3, prev: 1 });
    // 互動率 only where a channel has both: Facebook's 6 / 40; Bluesky (no reach) does not dilute it
    expect(s.kpis.rate.value).toBe(15);
    // a day nobody has a number for is a gap, not a 0
    expect(s.series.reach.cur).toEqual([10, null, null, null, null, null, 30]);
    expect(s.series.engagement.cur[1]).toBe(3);
  });

  it("one channel only counts that channel; no rows at all = every card null", () => {
    const rows = [row("fb", "2026-10-15", { reach: 10 }), row("bs", "2026-10-15", { posts: 2 })];
    expect(summarize(rows, ["bs"], p).kpis.reach.value).toBeNull();
    expect(summarize(rows, ["bs"], p).kpis.posts.value).toBe(2);
    const none = summarize([], ["fb"], p);
    for (const k of Object.values(none.kpis)) expect(k).toEqual({ value: null, prev: null });
  });
});
