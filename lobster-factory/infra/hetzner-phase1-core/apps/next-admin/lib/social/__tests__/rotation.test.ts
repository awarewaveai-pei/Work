// Rotation slots (SOCIAL_MANAGER_PLAN.md C7): the list's weekdays x send_time over the next 7 days, in the BRAND's zone,
// future only. Once-per-slot, withdraw-on-save and reorder are the database's (0101_social_rotation-local-verify.sh).
import { describe, expect, it } from "vitest";
import { listSlots } from "../rotation";

describe("listSlots", () => {
  it("the next 7 days' weekdays at the send time, in the brand's zone, oldest first", () => {
    // 2026-10-15 is a Thursday; 08:00 in Taipei = 00:00Z
    const now = new Date("2026-10-15T00:00:00Z");
    expect(listSlots({ weekdays: [1, 4], send_time: "10:00:00" }, "Asia/Taipei", now)).toEqual([
      "2026-10-15T02:00:00.000Z",   // Thu 10:00 Taipei, later today
      "2026-10-19T02:00:00.000Z",   // Mon
    ]);
  });

  it("today's slot already past is skipped; a day boundary is the brand's, not UTC's", () => {
    const now = new Date("2026-10-15T03:00:00Z");   // 11:00 Thursday in Taipei
    expect(listSlots({ weekdays: [4], send_time: "10:00" }, "Asia/Taipei", now)).toEqual([]);
    // 23:30 UTC Wednesday = 07:30 Thursday in Taipei: Thursday's 10:00 is still ahead
    expect(listSlots({ weekdays: [4], send_time: "10:00" }, "Asia/Taipei", new Date("2026-10-14T23:30:00Z"))).toEqual(["2026-10-15T02:00:00.000Z"]);
  });

  it("no weekdays, no slots", () => {
    expect(listSlots({ weekdays: [], send_time: "10:00" }, "UTC", new Date("2026-10-15T00:00:00Z"))).toEqual([]);
  });
});
