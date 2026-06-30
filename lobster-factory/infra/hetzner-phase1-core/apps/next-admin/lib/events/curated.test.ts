import { describe, expect, it } from "vitest";
import { buildCuratedEventsForYear } from "./curated";

describe("curated events", () => {
  it("generates key commercial and family dates for a year", () => {
    const events = buildCuratedEventsForYear(2026);
    const byTitle = new Map(events.map((event) => [event.title, event]));

    expect(byTitle.get("Mother's Day")?.event_date).toBe("2026-05-10");
    expect(byTitle.get("Father's Day")?.event_date).toBe("2026-06-21");
    expect(byTitle.get("Black Friday")?.event_date).toBe("2026-11-27");
    expect(byTitle.get("Cyber Monday")?.event_date).toBe("2026-11-30");
  });

  it("marks sports season moments as sports events", () => {
    const events = buildCuratedEventsForYear(2026);
    const sports = events.filter((event) => event.category === "sports");

    expect(sports.map((event) => event.subcategory)).toContain("sports_season");
    expect(sports.length).toBeGreaterThanOrEqual(3);
  });
});
