// C23: the list page's grid <-> saved slots (rowsFromList / slotsFromRows / slotCount in Lists.tsx).
import { describe, expect, it } from "vitest";
import { rowsFromList, slotCount, slotsFromRows } from "../Lists";

describe("rowsFromList", () => {
  it("groups slots by time, earliest row first, weekdays sorted", () => {
    const rows = rowsFromList({ weekdays: [1, 3, 5], send_time: "10:00:00", slots: [
      { weekday: 5, send_time: "18:00:00" }, { weekday: 3, send_time: "10:00:00" }, { weekday: 1, send_time: "10:00:00" },
    ] });
    expect(rows.map(({ time, days }) => ({ time, days }))).toEqual([{ time: "10:00", days: [1, 3] }, { time: "18:00", days: [5] }]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });

  it("an old list with no slots rows opens as weekdays x send_time", () => {
    expect(rowsFromList({ weekdays: [2, 4], send_time: "09:30:00", slots: [] }).map(({ time, days }) => ({ time, days }))).toEqual([{ time: "09:30", days: [2, 4] }]);
  });
});

describe("slotsFromRows", () => {
  it("three slots over two days: by weekday then time, whatever order the rows were made in", () => {
    expect(slotsFromRows([{ time: "18:00", days: [1] }, { time: "12:00", days: [3] }, { time: "08:00", days: [1] }])).toEqual([
      { weekday: 1, send_time: "08:00" }, { weekday: 1, send_time: "18:00" }, { weekday: 3, send_time: "12:00" },
    ]);
  });

  it("two rows with the same time merge, a row with no day adds nothing, a deleted row is gone", () => {
    expect(slotsFromRows([{ time: "10:00", days: [1] }, { time: "10:00", days: [1, 2] }, { time: "11:00", days: [] }])).toEqual([
      { weekday: 1, send_time: "10:00" }, { weekday: 2, send_time: "10:00" },
    ]);
    expect(slotsFromRows([])).toEqual([]);
  });

  it("a saved list read back and saved again does not change", () => {
    const slots = [{ weekday: 1, send_time: "08:00" }, { weekday: 1, send_time: "18:00" }, { weekday: 3, send_time: "12:00" }];
    expect(slotsFromRows(rowsFromList({ weekdays: [1, 3], send_time: "08:00", slots }))).toEqual(slots);
  });
});

describe("slotCount", () => {
  it("counts slots; a list with none counts its weekdays", () => {
    expect(slotCount({ weekdays: [1, 3], slots: [{ weekday: 1, send_time: "10:00" }, { weekday: 1, send_time: "18:00" }, { weekday: 3, send_time: "10:00" }] })).toBe(3);
    expect(slotCount({ weekdays: [1, 3], slots: [] })).toBe(2);
  });
});
