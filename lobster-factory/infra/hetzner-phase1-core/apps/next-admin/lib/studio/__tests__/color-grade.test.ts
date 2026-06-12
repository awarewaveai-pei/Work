import { describe, expect, it } from "vitest";
import {
  GRADE_LIMITS,
  NEUTRAL_STATE,
  clampState,
  clampParams,
  isNeutralState,
  isNeutralParams,
  stateToParams,
  toSharpModulate,
  toCssFilter,
  type ColorGradeState,
} from "../color-grade";

describe("color-grade", () => {
  it("neutral state maps to neutral params (1.0 multipliers)", () => {
    expect(stateToParams(NEUTRAL_STATE)).toEqual({ hue: 0, saturation: 1, brightness: 1 });
    expect(isNeutralState(NEUTRAL_STATE)).toBe(true);
  });

  it("percent → multiplier conversion (150% sat = 1.5)", () => {
    const s: ColorGradeState = { hue: 10, sat: 150, bri: 80 };
    expect(stateToParams(s)).toEqual({ hue: 10, saturation: 1.5, brightness: 0.8 });
  });

  it("clamps out-of-range state to slider bounds", () => {
    const wild: ColorGradeState = { hue: 999, sat: -50, bri: 5000 };
    expect(clampState(wild)).toEqual({
      hue: GRADE_LIMITS.hue.max,
      sat: GRADE_LIMITS.sat.min,
      bri: GRADE_LIMITS.bri.max,
    });
  });

  it("any non-finite (NaN/±Infinity) → neutral no-op (hostile payload defense)", () => {
    expect(clampState({ hue: NaN, sat: Infinity, bri: -Infinity })).toEqual(NEUTRAL_STATE);
  });

  it("non-number wire fields (undefined/null/string/missing) → neutral, never NaN [critic Critical]", () => {
    // TS types are erased at runtime; a JSON body can carry any of these.
    expect(clampState({ hue: undefined, sat: null, bri: "9" } as unknown as ColorGradeState)).toEqual(
      NEUTRAL_STATE
    );
    expect(clampState({} as ColorGradeState)).toEqual(NEUTRAL_STATE); // missing keys
    expect(clampState(null as unknown as ColorGradeState)).toEqual(NEUTRAL_STATE); // null object
    const p = clampParams({ saturation: undefined, brightness: null, hue: "x" } as unknown as never);
    expect(p).toEqual({ hue: 0, saturation: 1, brightness: 1 });
  });

  it("toSharpModulate never emits NaN/out-of-bounds for arbitrary garbage input", () => {
    for (const bad of [
      { hue: undefined, saturation: NaN, brightness: "9" },
      { hue: Infinity, saturation: -Infinity, brightness: null },
      {},
      null,
    ]) {
      const m = toSharpModulate(bad as unknown as never);
      if (m === undefined) continue; // neutral skip is fine
      for (const v of [m.hue, m.saturation, m.brightness]) expect(Number.isFinite(v)).toBe(true);
      expect(m.saturation).toBeGreaterThanOrEqual(0.5);
      expect(m.saturation).toBeLessThanOrEqual(2);
      expect(m.brightness).toBeGreaterThanOrEqual(0.5);
      expect(m.brightness).toBeLessThanOrEqual(2);
    }
  });

  it("clampParams bounds multipliers to 0.5..2", () => {
    expect(clampParams({ hue: 100, saturation: 9, brightness: 0 })).toEqual({
      hue: 30,
      saturation: 2,
      brightness: 0.5,
    });
  });

  it("toSharpModulate returns undefined when neutral (skip the op)", () => {
    expect(toSharpModulate({ hue: 0, saturation: 1, brightness: 1 })).toBeUndefined();
    expect(isNeutralParams({ hue: 0, saturation: 1, brightness: 1 })).toBe(true);
  });

  it("toSharpModulate returns clamped params when non-neutral", () => {
    expect(toSharpModulate({ hue: 15, saturation: 1.5, brightness: 1 })).toEqual({
      hue: 15,
      saturation: 1.5,
      brightness: 1,
    });
  });

  it("toCssFilter emits the three CSS functions with correct units", () => {
    expect(toCssFilter({ hue: 12, sat: 150, bri: 90 })).toBe(
      "hue-rotate(12deg) saturate(150%) brightness(90%)"
    );
  });
});
