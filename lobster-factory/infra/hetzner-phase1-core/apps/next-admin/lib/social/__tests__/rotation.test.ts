// Rotation slots (SOCIAL_MANAGER_PLAN.md C7; grid C20/0105): the list's weekday x time slots over the next 7 days, in the
// BRAND's zone, future only, oldest first. Once-per-slot, withdraw-on-save and reorder are the database's
// (0101_social_rotation-local-verify.sh, 0105_social_v16-local-verify.sh).
import { describe, expect, it } from "vitest";
import { listSlots } from "../rotation";

describe("listSlots", () => {
  it("the next 7 days' weekdays at the send time, in the brand's zone, oldest first", () => {
    // 2026-10-15 is a Thursday; 08:00 in Taipei = 00:00Z
    const now = new Date("2026-10-15T00:00:00Z");
    expect(listSlots([{ weekday: 1, send_time: "10:00:00" }, { weekday: 4, send_time: "10:00:00" }], "Asia/Taipei", now)).toEqual([
      "2026-10-15T02:00:00.000Z",   // Thu 10:00 Taipei, later today
      "2026-10-19T02:00:00.000Z",   // Mon
    ]);
  });

  // C20: three slots across two days come out in time order, not in the order the grid lists them
  it("three slots across two days: by time, a day's two times in order", () => {
    const now = new Date("2026-10-18T00:00:00Z");   // Sunday 08:00 in Taipei
    const grid = [{ weekday: 1, send_time: "18:00" }, { weekday: 3, send_time: "12:00" }, { weekday: 1, send_time: "08:00:00" }];
    expect(listSlots(grid, "Asia/Taipei", now)).toEqual([
      "2026-10-19T00:00:00.000Z",   // Mon 08:00
      "2026-10-19T10:00:00.000Z",   // Mon 18:00
      "2026-10-21T04:00:00.000Z",   // Wed 12:00
    ]);
  });

  it("today's slot already past is skipped; a day boundary is the brand's, not UTC's", () => {
    const now = new Date("2026-10-15T03:00:00Z");   // 11:00 Thursday in Taipei
    expect(listSlots([{ weekday: 4, send_time: "10:00" }], "Asia/Taipei", now)).toEqual([]);
    // 23:30 UTC Wednesday = 07:30 Thursday in Taipei: Thursday's 10:00 is still ahead
    expect(listSlots([{ weekday: 4, send_time: "10:00" }], "Asia/Taipei", new Date("2026-10-14T23:30:00Z"))).toEqual(["2026-10-15T02:00:00.000Z"]);
  });

  it("no slots, no times", () => {
    expect(listSlots([], "UTC", new Date("2026-10-15T00:00:00Z"))).toEqual([]);
  });
});
