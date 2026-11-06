import { describe, expect, it } from "vitest";
import { FREE_QUOTAS } from "../cost-model";
import { pacificDayStartIso, quotaWindowStartIso, utcDayStartIso, utcMonthStartIso } from "../free-quota";

const q = (id: string) => FREE_QUOTAS.find((x) => x.id === id)!;

describe("free quota windows", () => {
  it("US Pacific day starts at 08:00 UTC in winter and 07:00 UTC in summer", () => {
    expect(pacificDayStartIso(new Date("2026-11-06T10:00:00Z"))).toBe("2026-11-06T08:00:00.000Z");
    expect(pacificDayStartIso(new Date("2026-07-15T10:00:00Z"))).toBe("2026-07-15T07:00:00.000Z");
  });
  it("a UTC time before Pacific midnight still belongs to the previous Pacific day", () => {
    expect(pacificDayStartIso(new Date("2026-11-06T05:00:00Z"))).toBe("2026-11-05T08:00:00.000Z");
  });
  it("DST switch days keep the pre-switch midnight offset", () => {
    expect(pacificDayStartIso(new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-01T07:00:00.000Z");
    expect(pacificDayStartIso(new Date("2026-03-08T20:00:00Z"))).toBe("2026-03-08T08:00:00.000Z");
  });
  it("UTC day and month starts", () => {
    const now = new Date("2026-11-06T23:59:59Z");
    expect(utcDayStartIso(now)).toBe("2026-11-06T00:00:00.000Z");
    expect(utcMonthStartIso(now)).toBe("2026-11-01T00:00:00.000Z");
  });
  it("each quota picks its own window", () => {
    const now = new Date("2026-11-06T10:00:00Z");
    expect(quotaWindowStartIso(q("gemini_lite"), now)).toBe("2026-11-06T08:00:00.000Z");
    expect(quotaWindowStartIso(q("reoon"), now)).toBe("2026-11-06T00:00:00.000Z");
    expect(quotaWindowStartIso(q("zerobounce"), now)).toBe("2026-11-01T00:00:00.000Z");
    expect(quotaWindowStartIso(q("hunter"), now)).toBe("2026-11-01T00:00:00.000Z");
  });
});
