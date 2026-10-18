// The calendar's dates are the BRAND's (organizations.default_timezone), whatever the viewer's zone (model.ts).
import { describe, expect, it } from "vitest";
import { addDays, addMonths, bestFor, bestPlatforms, instantAt, mondayOf, monthGridStart, occurrences, slotTime, takenSlots, weekday, zoned, type Post } from "../model";

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

// C22: the calendar draws a series' occurrences before the server has made their children (0105 header)
const series = (extra: Partial<Post> = {}): Post => ({
  id: "t1", state: "scheduled", body: "每週一句", scheduled_at: "2026-10-14T02:00:00.000Z", list_id: null, list_position: null, first_comment: null, link_url: null, link_utm: false,
  notes: null, source_url: null, published_at: null, deleted_at: null, version: 1, repeat: { freq: "week", days: [3], end: "never" }, repeat_of: null, origin_slot: null,
  auto_mode: "brand", targets: [], media: [], comments: [], tags: [], ...extra,
});
const NOW = new Date("2026-10-14T05:00:00Z");   // Wed 13:00 in Taipei, after the template's 10:00
const slots = (p: Post, taken = new Set<string>(), until = "2026-11-09T00:00:00Z") => occurrences(p, "Asia/Taipei", NOW, new Date("2026-10-12T00:00:00Z"), new Date(until), taken).map((o) => o.scheduled_at);

describe("occurrences of a repeat series", () => {
  it("every matching day after the template, at its wall-clock time, up to the window's end", () => {
    expect(slots(series())).toEqual(["2026-10-21T02:00:00.000Z", "2026-10-28T02:00:00.000Z", "2026-11-04T02:00:00.000Z"]);
    expect(slots(series(), new Set(), "2026-10-29T00:00:00Z")).toEqual(["2026-10-21T02:00:00.000Z", "2026-10-28T02:00:00.000Z"]);
  });

  it("a slot that has a child (any state, deleted too) is not drawn twice; an occurrence points at its template", () => {
    const child = series({ id: "c1", repeat: null, repeat_of: "t1", origin_slot: "2026-10-28T02:00:00+00:00", state: "deleted" });
    const out = occurrences(series(), "Asia/Taipei", NOW, new Date("2026-10-12T00:00:00Z"), new Date("2026-11-09T00:00:00Z"), takenSlots([child]));
    expect(out.map((o) => o.scheduled_at)).toEqual(["2026-10-21T02:00:00.000Z", "2026-11-04T02:00:00.000Z"]);
    expect(out[0]).toMatchObject({ occurrenceOf: "t1", state: "scheduled", repeat: null, repeat_of: "t1" });
  });

  it("the end-after-N count includes the template; only a template that may send repeats", () => {
    expect(slots(series({ repeat: { freq: "week", days: [3], end: "count", count: 3 } }))).toEqual(["2026-10-21T02:00:00.000Z", "2026-10-28T02:00:00.000Z"]);
    expect(slots(series({ state: "draft" }))).toEqual([]);
    expect(slots(series({ state: "deleted" }))).toEqual([]);
    expect(slots(series({ state: "deleted", published_at: "2026-10-14T02:00:05Z" })).length).toBe(3);
  });
});

describe("best times and months", () => {
  it("two times a day, one an hour later at the weekend; Instagram's two names share a row", () => {
    expect(bestFor("bluesky", "2026-10-15")).toEqual(["12:00", "20:00"]);
    expect(bestFor("facebook", "2026-10-17")).toEqual(["14:00"]);   // Saturday
    expect(bestFor("instagram-standalone", "2026-10-15")).toEqual(["11:00", "19:00"]);
    expect(bestFor("x", "2026-10-15")).toEqual([]);
    expect(bestPlatforms(["facebook", "instagram", "instagram-standalone", "x"])).toEqual(["facebook", "instagram"]);
  });

  it("a month back from March is February, whatever the days in between", () => {
    expect(addMonths("2026-03-01", -1)).toBe("2026-02-01");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-01");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-20", -1)).toBe("2025-12-01");
  });
});
