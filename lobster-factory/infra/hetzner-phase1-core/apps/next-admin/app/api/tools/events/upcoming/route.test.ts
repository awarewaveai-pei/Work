import { describe, expect, it } from "vitest";
import { compactUpcomingEvents, eventMatchesCategoryFilter } from "./compact";

describe("compactUpcomingEvents", () => {
  it("combines same-day same-title holidays across countries", () => {
    const events = compactUpcomingEvents([
      {
        id: "it",
        title: "Assumption of Mary",
        title_zh: null,
        event_date: "2026-08-15",
        event_end_date: null,
        category: "holiday",
        subcategory: "holiday",
        emoji: "🎉",
        marketing_window_start: "2026-07-01",
        marketing_lead_days: 45,
        country_codes: ["IT"],
        region: "europe",
      },
      {
        id: "fr",
        title: "Assumption of Mary",
        title_zh: null,
        event_date: "2026-08-15",
        event_end_date: null,
        category: "holiday",
        subcategory: "holiday",
        emoji: "🎉",
        marketing_window_start: "2026-07-01",
        marketing_lead_days: 45,
        country_codes: ["FR"],
        region: "europe",
      },
      {
        id: "final",
        title: "FIFA World Cup 2026 — Final",
        title_zh: "2026 FIFA 世界盃 — 決賽",
        event_date: "2026-07-19",
        event_end_date: null,
        category: "mega",
        subcategory: "world_cup",
        emoji: "🏆",
        marketing_window_start: "2026-04-20",
        marketing_lead_days: 90,
        country_codes: ["global"],
        region: "global",
      },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0].country_codes).toEqual(["FR", "IT"]);
    expect(events[1].title_zh).toBe("2026 FIFA 世界盃 — 決賽");
  });

  it("treats sports-related mega events as sports for the studio filter", () => {
    expect(eventMatchesCategoryFilter({ category: "mega", subcategory: "world_cup" }, "sports")).toBe(true);
    expect(eventMatchesCategoryFilter({ category: "mega", subcategory: "olympics" }, "sports")).toBe(true);
    expect(eventMatchesCategoryFilter({ category: "mega", subcategory: "sports_final" }, "sports")).toBe(true);
    expect(eventMatchesCategoryFilter({ category: "mega", subcategory: null }, "sports")).toBe(false);
  });

  it("treats major holidays as cultural moments for the studio filter", () => {
    expect(eventMatchesCategoryFilter({ category: "holiday", subcategory: "holiday_major" }, "cultural")).toBe(true);
    expect(eventMatchesCategoryFilter({ category: "holiday", subcategory: "holiday" }, "cultural")).toBe(false);
  });
});
