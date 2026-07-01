import { describe, expect, it } from "vitest";
import { EVENT_COUNTRY_FILTERS, EVENT_SOURCE_COUNTRIES } from "./countries";

describe("event country coverage", () => {
  it("keeps source country codes unique", () => {
    const codes = EVENT_SOURCE_COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("covers East and Southeast Asia in source data and filters", () => {
    const sourceCodes = new Set(EVENT_SOURCE_COUNTRIES.map((country) => country.code));
    for (const code of ["TW", "JP", "KR", "CN", "HK", "MO", "SG", "MY", "TH", "VN", "ID", "PH"]) {
      expect(sourceCodes.has(code)).toBe(true);
    }

    expect(EVENT_COUNTRY_FILTERS.some((filter) => filter.label === "東亞 + 東南亞")).toBe(true);
    expect(EVENT_COUNTRY_FILTERS.some((filter) => filter.label === "東南亞")).toBe(true);
  });
});
