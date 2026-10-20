// followStart: moving a repeat's start day moves what the sender did not choose (compose/draft.ts).
import { describe, expect, it } from "vitest";
import type { RepeatRule } from "@/lib/social/repeat-rule";
import { followStart } from "../compose/draft";

const base = { end: "never", count: 8 } as const;

describe("followStart", () => {
  it("weekly on the old day's weekday follows the new day (Mon 10-19 -> Wed 10-21)", () => {
    const r: RepeatRule = { ...base, freq: "week", days: [1], mday: 19 };
    expect(followStart(r, "2026-10-19", "2026-10-21").days).toEqual([3]);
  });
  it("monthly on the old day's number follows the new day", () => {
    const r: RepeatRule = { ...base, freq: "month", mday: 19 };
    expect(followStart(r, "2026-10-19", "2026-10-27").mday).toBe(27);
  });
  it("days or a number the sender picked stay", () => {
    const wk: RepeatRule = { ...base, freq: "week", days: [1, 4], mday: 19 };
    const mo: RepeatRule = { ...base, freq: "month", mday: 5 };
    expect(followStart(wk, "2026-10-19", "2026-10-21")).toBe(wk);
    expect(followStart(mo, "2026-10-19", "2026-10-21")).toBe(mo);
  });
});
