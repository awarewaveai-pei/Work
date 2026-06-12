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

  it("NaN → neutral (no-op); ±Infinity → nearest bound (hostile payload defense)", () => {
    expect(clampState({ hue: NaN, sat: Infinity, bri: -Infinity })).toEqual({
      hue: GRADE_LIMITS.hue.neutral, // NaN has no ordering → neutral
      sat: GRADE_LIMITS.sat.max, // +Infinity clamps to max
      bri: GRADE_LIMITS.bri.min, // -Infinity clamps to min
    });
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
