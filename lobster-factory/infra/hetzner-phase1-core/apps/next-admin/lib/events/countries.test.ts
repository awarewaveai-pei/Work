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

  it("separates South Asia and MENA tourism markets", () => {
    const sourceCodes = new Set(EVENT_SOURCE_COUNTRIES.map((country) => country.code));
    for (const code of ["IN", "LK", "NP", "MV", "TR", "EG"]) {
      expect(sourceCodes.has(code)).toBe(true);
      expect(EVENT_COUNTRY_FILTERS.some((filter) => filter.value === code)).toBe(true);
    }

    const southAsia = EVENT_COUNTRY_FILTERS.find((filter) => filter.label === "南亞");
    expect(southAsia?.value.split(",")).toEqual(["IN", "LK", "NP", "MV"]);

    const mena = EVENT_COUNTRY_FILTERS.find((filter) => filter.label === "中東/北非");
    expect(mena?.value.split(",")).toEqual(["AE", "SA", "TR", "EG", "MA"]);
  });

  it("lists Western traveler Asia markets as individual country filters", () => {
    const leadingCountryFilters = EVENT_COUNTRY_FILTERS.slice(2, 18);
    expect(leadingCountryFilters.map((filter) => filter.value)).toEqual([
      "TH", "JP", "VN", "ID", "SG", "MY", "PH", "KH", "LA", "KR", "TW", "HK", "IN", "LK", "NP", "MV",
    ]);
    for (const filter of leadingCountryFilters) {
      expect(filter.value).not.toContain(",");
    }

    expect(EVENT_COUNTRY_FILTERS.some((filter) => filter.label.includes("歐美澳"))).toBe(false);
  });

  it("has a single-country filter for every source country", () => {
    const singleCountryFilters = new Set(
      EVENT_COUNTRY_FILTERS.filter((filter) => !filter.value.includes(",")).map((filter) => filter.value),
    );

    for (const country of EVENT_SOURCE_COUNTRIES) {
      expect(singleCountryFilters.has(country.code)).toBe(true);
    }
  });
});
