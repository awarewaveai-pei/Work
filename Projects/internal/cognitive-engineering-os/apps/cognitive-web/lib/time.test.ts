import { describe, expect, it } from "vitest";
import { formatTime } from "./time";

describe("formatTime", () => {
  it("reads a UTC timestamp in the given zone, to the minute (after 16:00 UTC it is already the next day in Taipei)", () => {
    expect(formatTime("2026-09-26T15:51:37Z", "Asia/Taipei")).toBe("2026-09-26 23:51");
    expect(formatTime("2026-09-26T16:05:00Z", "Asia/Taipei")).toBe("2026-09-27 00:05");
    expect(formatTime("2026-09-26T09:53:16Z", "UTC")).toBe("2026-09-26 09:53");
  });

  it("two projects made the same day read apart", () => {
    expect(formatTime("2026-09-26T01:02:00Z", "Asia/Taipei")).not.toBe(formatTime("2026-09-26T01:03:00Z", "Asia/Taipei"));
  });

  it("empty stays empty; an unreadable value is shown as it is, not as a wrong date", () => {
    expect(formatTime(undefined)).toBe("");
    expect(formatTime(null)).toBe("");
    expect(formatTime("not a date")).toBe("not a date");
  });
});
