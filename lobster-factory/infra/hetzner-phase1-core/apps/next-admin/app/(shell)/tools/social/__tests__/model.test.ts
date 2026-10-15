// The calendar's dates are the BRAND's (organizations.default_timezone), whatever the viewer's zone (model.ts).
import { describe, expect, it } from "vitest";
import { addDays, instantAt, mondayOf, monthGridStart, slotTime, weekday, zoned } from "../model";

describe("social page dates", () => {
  it("an instant as the brand sees it, and back", () => {
    expect(zoned("2026-10-15T16:30:00Z", "Asia/Taipei")).toEqual({ date: "2026-10-16", time: "00:30", minutes: 30 });
    expect(instantAt("2026-10-16", "00:30", "Asia/Taipei")).toBe("2026-10-15T16:30:00.000Z");
    expect(instantAt("2026-10-16", "09:00", "UTC")).toBe("2026-10-16T09:00:00.000Z");
  });

  it("the zone's own offset on each side of a DST change (Los Angeles, 2026-11-01)", () => {
    expect(instantAt("2026-10-31", "09:00", "America/Los_Angeles")).toBe("2026-10-31T16:00:00.000Z");   // PDT -7
    expect(instantAt("2026-11-02", "09:00", "America/Los_Angeles")).toBe("2026-11-02T17:00:00.000Z");   // PST -8
    expect(zoned(instantAt("2026-11-02", "09:00", "America/Los_Angeles"), "America/Los_Angeles").time).toBe("09:00");
  });

  it("weeks start on Monday; the month grid starts on the Monday on or before the 1st", () => {
    expect(weekday("2026-10-12")).toBe(1);
    expect(weekday("2026-10-18")).toBe(7);
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(monthGridStart("2026-10-20")).toBe("2026-09-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("a click or drop lands on the half hour, inside the day", () => {
    expect(slotTime(9 * 60 + 44)).toBe("09:30");
    expect(slotTime(-5)).toBe("00:00");
    expect(slotTime(24 * 60 + 10)).toBe("23:30");
  });
});
