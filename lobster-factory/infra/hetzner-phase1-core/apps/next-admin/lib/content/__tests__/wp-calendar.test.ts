import { describe, expect, it } from "vitest";
import { fromDatetimeLocal, toDatetimeLocal } from "../wp-calendar";

// WP dates are the site's wall clock with no zone: the helpers must never go through Date (TZ=America/New_York gives the same).
describe("wp-calendar datetime-local helpers", () => {
  it("toDatetimeLocal keeps the wall clock", () => {
    expect(toDatetimeLocal("2026-06-13T14:00:00")).toBe("2026-06-13T14:00");
  });
  it("fromDatetimeLocal pads seconds and leaves a full value alone", () => {
    expect(fromDatetimeLocal("2026-06-13T14:00")).toBe("2026-06-13T14:00:00");
    expect(fromDatetimeLocal("2026-06-13T14:00:30")).toBe("2026-06-13T14:00:30");
  });
});
