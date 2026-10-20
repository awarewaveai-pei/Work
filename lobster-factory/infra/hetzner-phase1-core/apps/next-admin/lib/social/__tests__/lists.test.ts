// C23: the list payload's weekday x time grid (parseListInput / parseSlots). The database takes the same shape (0105 social_save_list p_slots).
import { describe, expect, it } from "vitest";
import { parseListInput, parseSlots } from "../lists";
import { listSlots } from "../rotation";

const ACC = "11111111-1111-4111-8111-111111111111";
const base = { name: "L", account_ids: [ACC] };

describe("parseSlots", () => {
  it("HH:MM:SS is cut to HH:MM, the same weekday+time twice is one slot, the result is by weekday then time", () => {
    expect(parseSlots([
      { weekday: 3, send_time: "12:00" }, { weekday: 1, send_time: "18:00" }, { weekday: 1, send_time: "08:00:00" }, { weekday: 1, send_time: "18:00:00" },
    ])).toEqual([{ weekday: 1, send_time: "08:00" }, { weekday: 1, send_time: "18:00" }, { weekday: 3, send_time: "12:00" }]);
  });

  it.each([
    [{ weekday: 0, send_time: "10:00" }], [{ weekday: 8, send_time: "10:00" }], [{ weekday: 1.5, send_time: "10:00" }], [{ weekday: "1", send_time: "10:00" }],
    [{ weekday: 1, send_time: "24:00" }], [{ weekday: 1, send_time: "10:00:30" }], [{ weekday: 1, send_time: "9:00" }], [{ weekday: 1 }], [null],
  ])("refuses %j", (slot) => {
    expect(() => parseSlots([slot])).toThrow();
  });

  it("refuses a non-array and an absurdly large grid", () => {
    expect(() => parseSlots("10:00")).toThrow();
    expect(() => parseSlots(Array.from({ length: 7 * 24 + 1 }, (_, i) => ({ weekday: (i % 7) + 1, send_time: `${String(i % 24).padStart(2, "0")}:${i % 2 ? "30" : "00"}` })))).toThrow();
  });
});

describe("parseListInput with slots", () => {
  it("weekdays and send_time follow the slots; slots go on to the store", () => {
    const got = parseListInput({ ...base, active: true, slots: [{ weekday: 5, send_time: "18:00" }, { weekday: 1, send_time: "10:00" }, { weekday: 1, send_time: "10:00:00" }] });
    expect(got).toMatchObject({ weekdays: [1, 5], send_time: "10:00", slots: [{ weekday: 1, send_time: "10:00" }, { weekday: 5, send_time: "18:00" }] });
  });

  it("without slots the old shape is unchanged: no slots key at all (the database then uses weekdays x send_time)", () => {
    const got = parseListInput({ ...base, weekdays: [3, 1, 3], send_time: "09:30" });
    expect(got).toEqual({ name: "L", weekdays: [1, 3], send_time: "09:30", active: false, account_ids: [ACC] });
    expect("slots" in got).toBe(false);
  });

  it("an empty grid saves as a paused list, but cannot be active", () => {
    expect(parseListInput({ ...base, slots: [] })).toMatchObject({ weekdays: [], slots: [], active: false });
    expect(() => parseListInput({ ...base, active: true, slots: [] })).toThrow(/weekday/);
  });

  it("a bad slot is a bad request, not a half-saved list", () => {
    expect(() => parseListInput({ ...base, slots: [{ weekday: 9, send_time: "10:00" }] })).toThrow();
  });

  // the data contract the rotation run reads: three slots over two days come out as instants in time order
  it("what is saved is what listSlots turns into three ordered instants across two days", () => {
    const saved = parseListInput({ ...base, active: true, slots: [{ weekday: 1, send_time: "18:00" }, { weekday: 3, send_time: "12:00" }, { weekday: 1, send_time: "08:00" }] });
    expect(listSlots(saved.slots!, "Asia/Taipei", new Date("2026-10-18T00:00:00Z"))).toEqual([
      "2026-10-19T00:00:00.000Z", "2026-10-19T10:00:00.000Z", "2026-10-21T04:00:00.000Z",
    ]);
  });
});
