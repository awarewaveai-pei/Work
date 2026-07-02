import { describe, expect, it } from "vitest";
import { deriveEventFacets, eventMatchesCountries, scoreEventOpportunity } from "./facets";

describe("event facets", () => {
  it("tags family and commercial holidays", () => {
    const facets = deriveEventFacets({
      title: "Mother's Day",
      title_zh: "母親節",
      event_date: "2027-05-09",
      category: "holiday",
      subcategory: "family",
      country_codes: ["US", "CA"],
    });

    expect(facets).toContain("family");
    expect(facets).toContain("commercial");
    expect(facets).toContain("holiday");
    expect(facets).toContain("multi-country");
  });

  it("treats sports mega events as sports facets", () => {
    const facets = deriveEventFacets({
      title: "FIFA World Cup 2026",
      event_date: "2026-06-11",
      category: "mega",
      subcategory: "world_cup",
      country_codes: ["US", "CA", "MX"],
    });

    expect(facets).toContain("mega");
    expect(facets).toContain("sports");
  });

  it("lets country filters include global events", () => {
    expect(eventMatchesCountries({
      title: "Black Friday",
      event_date: "2026-11-27",
      category: "holiday",
      subcategory: "commercial",
      country_codes: ["global"],
    }, ["TW"])).toBe(true);
  });

  it("lets region filters pass multiple country codes", () => {
    expect(eventMatchesCountries({
      title: "Songkran",
      event_date: "2027-04-13",
      category: "cultural",
      subcategory: "cultural",
      country_codes: ["TH"],
    }, ["SG", "MY", "TH", "VN"])).toBe(true);
  });

  it("scores open marketing windows ahead of distant generic holidays", () => {
    const now = new Date("2026-06-30T00:00:00Z");
    const worldCup = scoreEventOpportunity({
      title: "FIFA World Cup 2026",
      event_date: "2026-07-19",
      category: "mega",
      subcategory: "world_cup",
      marketing_window_start: "2026-04-20",
      country_codes: ["global"],
    }, now);
    const generic = scoreEventOpportunity({
      title: "Generic Local Holiday",
      event_date: "2027-04-01",
      category: "holiday",
      subcategory: "holiday",
      marketing_window_start: "2027-02-15",
      country_codes: ["US"],
    }, now);

    expect(worldCup).toBeGreaterThan(generic);
  });
});
