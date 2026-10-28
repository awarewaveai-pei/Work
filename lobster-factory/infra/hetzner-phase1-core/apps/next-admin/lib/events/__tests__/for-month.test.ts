// eventsForMonth (AUTO_CONTENT P9.2): events whose marketing window touches the month, filtered by market, ranked, one line each.
import { describe, expect, it } from "vitest";
import { eventsForMonth } from "../for-month";

const row = (o: Record<string, unknown>) => ({ id: "x", title: "T", title_zh: null, event_date: "2026-12-10", event_end_date: null, category: "holiday", subcategory: null,
  emoji: null, marketing_window_start: "2026-12-01", marketing_lead_days: 14, country_codes: ["GLOBAL"], region: null, ...o });

function fakeSb(rows: unknown[], error: { message: string } | null = null) {
  const calls: Array<[string, unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "lte", "or", "order", "limit"]) q[k] = (...a: unknown[]) => { calls.push([k, a]); return q; };
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: error ? null : rows, error }).then(res);
  return { sb: { from: () => q } as never, calls };
}
const NOW = new Date("2026-11-20T00:00:00Z");

describe("eventsForMonth", () => {
  it("asks for active events whose window starts by month end and that end or happen from month start", async () => {
    const { sb, calls } = fakeSb([]);
    await eventsForMonth(sb, "2026-12-01", "TW", NOW);
    expect(calls).toContainEqual(["eq", ["is_active", true]]);
    expect(calls).toContainEqual(["lte", ["marketing_window_start", "2026-12-31"]]);
    expect(calls).toContainEqual(["or", ["event_date.gte.2026-12-01,event_end_date.gte.2026-12-01"]]);
  });

  it("keeps an event whose window opens the month before; with a country, drops another country's event but keeps worldwide ones; no country keeps all", async () => {
    const rows = [
      row({ id: "a", title: "Christmas", title_zh: "聖誕節", event_date: "2026-12-25", marketing_window_start: "2026-11-25" }),
      row({ id: "b", title: "US Thanksgiving Sale", event_date: "2026-12-05", country_codes: ["US"] }),
      row({ id: "c", title: "Lantern", title_zh: "燈節", event_date: "2026-12-08", country_codes: ["TW"] }),
    ];
    const tw = await eventsForMonth(fakeSb(rows).sb, "2026-12-01", "TW", NOW);
    expect(tw).toHaveLength(2);
    expect(tw).toEqual(expect.arrayContaining(["12-25 Christmas（聖誕節）", "12-08 Lantern（燈節）"]));
    // no single market: no country filter (eventMatchesCountries([]) keeps everything)
    expect(await eventsForMonth(fakeSb(rows).sb, "2026-12-01", null, NOW)).toHaveLength(3);
  });

  it("caps the list at 15 and throws on a DB error", async () => {
    const many = Array.from({ length: 30 }, (_, i) => row({ id: `e${i}`, title: `Event ${i}`, event_date: `2026-12-${String(i % 28 + 1).padStart(2, "0")}` }));
    expect(await eventsForMonth(fakeSb(many).sb, "2026-12-01", null, NOW)).toHaveLength(15);
    await expect(eventsForMonth(fakeSb([], { message: "boom" }).sb, "2026-12-01", null, NOW)).rejects.toThrow("events:for_month:boom");
  });
});
