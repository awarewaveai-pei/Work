import { describe, expect, it } from "vitest";
import { formatTime, relativeTime } from "../labels";

// 2026-11-22 12:00 Taipei
const NOW = Date.parse("2026-11-22T04:00:00Z");

describe("formatTime", () => {
  it("midnight Taipei prints 0:00, never 24:00", () => {
    expect(formatTime("2026-11-21T16:00:00Z")).not.toMatch(/24:/);
    expect(formatTime("2026-11-21T16:00:00Z")).toMatch(/(^|\s)0?0:00:00/);
  });
});

describe("relativeTime", () => {
  it("今天 / 昨天 / N 天前 by Taipei calendar day, a date after 30 days, — when empty", () => {
    expect(relativeTime("2026-11-21T16:00:00Z", NOW)).toBe("今天");
    expect(relativeTime("2026-11-21T15:59:00Z", NOW)).toBe("昨天");
    expect(relativeTime("2026-11-19T04:00:00Z", NOW)).toBe("3 天前");
    expect(relativeTime("2026-10-13T04:00:00Z", NOW)).toMatch(/2026/);
    expect(relativeTime(null, NOW)).toBe("—");
  });
});
