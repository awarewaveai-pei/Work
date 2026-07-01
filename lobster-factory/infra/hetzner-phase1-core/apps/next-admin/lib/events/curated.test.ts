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

  it("adds regional national days for West and Central Asia country filters", () => {
    const events = buildCuratedEventsForYear(2026);
    const byCountry = new Map(events.map((event) => [event.country_codes[0], event]));

    expect(byCountry.get("JO")?.event_date).toBe("2026-05-25");
    expect(byCountry.get("QA")?.event_date).toBe("2026-12-18");
    expect(byCountry.get("OM")?.event_date).toBe("2026-11-18");
    expect(byCountry.get("KZ")?.event_date).toBe("2026-10-25");
    expect(byCountry.get("UZ")?.event_date).toBe("2026-09-01");
    expect(byCountry.get("KG")?.event_date).toBe("2026-08-31");
    expect(byCountry.get("TJ")?.event_date).toBe("2026-09-09");
    expect(byCountry.get("TM")?.event_date).toBe("2026-09-27");
  });
});
