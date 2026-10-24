// The periods a report can cover: whole calendar days that all end before today, at the week / month / quarter edges.
import { describe, expect, it } from "vitest";
import { MAX_DAYS, PRESETS, presetPeriod, spanDays } from "../report-period";

describe("presetPeriod", () => {
  it("lastw: the Monday-to-Sunday week before this one, from any day of this week", () => {
    expect(presetPeriod("2026-10-21", "lastw")).toEqual({ from: "2026-10-12", to: "2026-10-18" });   // a Wednesday
    expect(presetPeriod("2026-10-19", "lastw")).toEqual({ from: "2026-10-12", to: "2026-10-18" });   // the Monday itself
    expect(presetPeriod("2026-10-25", "lastw")).toEqual({ from: "2026-10-12", to: "2026-10-18" });   // the Sunday
  });
  it("lastm: the whole month before, across a year edge and in February", () => {
    expect(presetPeriod("2026-10-01", "lastm")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetPeriod("2026-01-15", "lastm")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetPeriod("2028-03-02", "lastm")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("lastq: the quarter before, across a year edge", () => {
    expect(presetPeriod("2026-10-20", "lastq")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(presetPeriod("2026-02-10", "lastq")).toEqual({ from: "2025-10-01", to: "2025-12-31" });
    expect(presetPeriod("2026-06-30", "lastq")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });
  it("lasty: the whole year before, leap year included, and a leap year fits the report limit", () => {
    expect(presetPeriod("2027-01-01", "lasty")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    const leap = presetPeriod("2029-01-05", "lasty");   // 2028
    expect(spanDays(leap.from, leap.to)).toBe(366);
    expect(spanDays(leap.from, leap.to)).toBeLessThanOrEqual(MAX_DAYS);
  });
  it("every period ends before today and fits the report limit", () => {
    for (const p of PRESETS) {
      const r = presetPeriod("2026-10-20", p);
      expect(r.to < "2026-10-20").toBe(true);
      expect(spanDays(r.from, r.to)).toBeLessThanOrEqual(MAX_DAYS);
    }
  });
});

describe("spanDays", () => {
  it("counts both ends", () => {
    expect(spanDays("2026-09-01", "2026-09-30")).toBe(30);
    expect(spanDays("2026-09-01", "2026-09-01")).toBe(1);
  });
});
