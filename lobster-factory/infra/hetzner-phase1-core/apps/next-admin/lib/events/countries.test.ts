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

  it("adds Western traveler Asia shortcut filters", () => {
    const asia = EVENT_COUNTRY_FILTERS.find((filter) => filter.label === "歐美澳旅客熱門亞洲");
    expect(asia?.value.split(",")).toEqual([
      "JP", "KR", "TW", "HK", "SG", "TH", "VN", "ID", "PH", "MY", "KH", "LA", "IN", "LK", "NP", "MV",
    ]);

    const southeastAsia = EVENT_COUNTRY_FILTERS.find((filter) => filter.label === "歐美澳熱門東南亞");
    expect(southeastAsia?.value.split(",")).toEqual(["TH", "VN", "ID", "PH", "MY", "SG", "KH", "LA"]);

    const southAsia = EVENT_COUNTRY_FILTERS.find((filter) => filter.label === "歐美澳熱門南亞");
    expect(southAsia?.value.split(",")).toEqual(["IN", "LK", "NP", "MV"]);
  });
});
