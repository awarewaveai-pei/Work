import { describe, expect, it } from "vitest";
import {
  EVENT_ALL_COUNTRIES_FILTER,
  EVENT_COUNTRY_FILTER_GROUPS,
  EVENT_COUNTRY_FILTERS,
  EVENT_SOURCE_COUNTRIES,
} from "./countries";

describe("event country coverage", () => {
  it("keeps source country codes unique", () => {
    const codes = EVENT_SOURCE_COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("covers Asian subregions in source data and grouped filters", () => {
    const sourceCodes = new Set(EVENT_SOURCE_COUNTRIES.map((country) => country.code));
    for (const code of ["TW", "JP", "KR", "CN", "HK", "MO", "TH", "VN", "ID", "PH", "IN", "AE", "KZ"]) {
      expect(sourceCodes.has(code)).toBe(true);
    }

    expect(EVENT_COUNTRY_FILTER_GROUPS.map((group) => group.label)).toEqual([
      "亞洲 / 東亞",
      "亞洲 / 東南亞",
      "亞洲 / 南亞",
      "亞洲 / 西亞",
      "亞洲 / 中亞",
      "歐洲",
      "北美洲",
      "南美洲",
      "大洋洲",
      "非洲",
    ]);
  });

  it("separates South Asia, West Asia, and Central Asia countries", () => {
    const sourceCodes = new Set(EVENT_SOURCE_COUNTRIES.map((country) => country.code));
    for (const code of ["IN", "LK", "NP", "MV", "AE", "SA", "TR", "JO", "QA", "OM", "KZ", "UZ", "KG", "TJ", "TM"]) {
      expect(sourceCodes.has(code)).toBe(true);
      expect(EVENT_COUNTRY_FILTERS.some((filter) => filter.value === code)).toBe(true);
    }

    const southAsia = EVENT_COUNTRY_FILTER_GROUPS.find((group) => group.label === "亞洲 / 南亞");
    expect(southAsia?.options.map((option) => option.value)).toEqual(["IN", "LK", "NP", "MV"]);

    const westAsia = EVENT_COUNTRY_FILTER_GROUPS.find((group) => group.label === "亞洲 / 西亞");
    expect(westAsia?.options.map((option) => option.value)).toEqual(["AE", "SA", "TR", "JO", "QA", "OM"]);

    const centralAsia = EVENT_COUNTRY_FILTER_GROUPS.find((group) => group.label === "亞洲 / 中亞");
    expect(centralAsia?.options.map((option) => option.value)).toEqual(["KZ", "UZ", "KG", "TJ", "TM"]);
  });

  it("keeps the country dropdown selectable values country-only", () => {
    expect(EVENT_COUNTRY_FILTERS[0]).toEqual(EVENT_ALL_COUNTRIES_FILTER);
    expect(EVENT_COUNTRY_FILTERS.some((filter) => filter.value === "global")).toBe(false);
    expect(EVENT_COUNTRY_FILTERS.some((filter) => filter.label.includes("歐美澳"))).toBe(false);

    for (const filter of EVENT_COUNTRY_FILTERS.slice(1)) {
      expect(filter.value).toMatch(/^[A-Z]{2}$/);
      expect(filter.value).not.toContain(",");
    }
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
