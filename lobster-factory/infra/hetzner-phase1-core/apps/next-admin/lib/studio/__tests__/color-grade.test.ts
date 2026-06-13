import { describe, expect, it } from "vitest";
import {
  GRADE_LIMITS,
  NEUTRAL_STATE,
  NEUTRAL_PARAMS,
  clampState,
  clampParams,
  isNeutralState,
  isNeutralParams,
  stateToParams,
  toSharpModulate,
  toSharpLevels,
  toCssFilter,
  type ColorGradeState,
} from "../color-grade";

describe("color-grade", () => {
  it("neutral state maps to neutral params (all blocks identity)", () => {
    expect(stateToParams(NEUTRAL_STATE)).toEqual(NEUTRAL_PARAMS);
    expect(isNeutralState(NEUTRAL_STATE)).toBe(true);
    expect(isNeutralParams(NEUTRAL_PARAMS)).toBe(true);
  });

  it("percent → multiplier conversion (150% sat = 1.5; partial state fills neutral)", () => {
    const s = { hue: 10, sat: 150, bri: 80 } as ColorGradeState; // levels/gamma/sharpen omitted
    expect(stateToParams(s)).toEqual({
      hue: 10,
      saturation: 1.5,
      brightness: 0.8,
      black: 0,
      white: 255,
      gamma: 1,
      sharpen: 0,
    });
  });

  it("levels + gamma + sharpen convert through stateToParams", () => {
    const s: ColorGradeState = {
      hue: 0, sat: 100, bri: 100, black: 20, white: 230, gamma: 180, sharpen: 3,
    };
    expect(stateToParams(s)).toEqual({
      hue: 0, saturation: 1, brightness: 1, black: 20, white: 230, gamma: 1.8, sharpen: 3,
    });
  });

  it("clamps out-of-range state to slider bounds (all blocks)", () => {
    const wild = {
      hue: 999, sat: -50, bri: 5000, black: 999, white: 0, gamma: 9999, sharpen: 99,
    } as ColorGradeState;
    expect(clampState(wild)).toEqual({
      hue: GRADE_LIMITS.hue.max,
      sat: GRADE_LIMITS.sat.min,
      bri: GRADE_LIMITS.bri.max,
      black: GRADE_LIMITS.black.max,
      white: GRADE_LIMITS.white.min,
      gamma: GRADE_LIMITS.gamma.max,
      sharpen: GRADE_LIMITS.sharpen.max,
    });
  });

  it("any non-finite (NaN/±Infinity) → neutral no-op (hostile payload defense)", () => {
    expect(
      clampState({ hue: NaN, sat: Infinity, bri: -Infinity } as unknown as ColorGradeState)
    ).toEqual(NEUTRAL_STATE);
  });

  it("non-number wire fields (undefined/null/string/missing) → neutral, never NaN [critic Critical]", () => {
    expect(
      clampState({ hue: undefined, sat: null, bri: "9" } as unknown as ColorGradeState)
    ).toEqual(NEUTRAL_STATE);
    expect(clampState({} as ColorGradeState)).toEqual(NEUTRAL_STATE); // missing keys
    expect(clampState(null as unknown as ColorGradeState)).toEqual(NEUTRAL_STATE); // null object
    const p = clampParams({ saturation: undefined, brightness: null, hue: "x" } as unknown as never);
    expect(p).toEqual(NEUTRAL_PARAMS);
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

  it("clampParams bounds multipliers (sat/bri 0.5..2, gamma 1..3)", () => {
    expect(clampParams({ hue: 100, saturation: 9, brightness: 0, gamma: 99 } as never)).toEqual({
      hue: 30, saturation: 2, brightness: 0.5, black: 0, white: 255, gamma: 3, sharpen: 0,
    });
  });

  it("toSharpModulate returns undefined when the color block is neutral (other blocks ignored)", () => {
    // Only hue/sat/bri matter to modulate; levels/gamma/sharpen don't force a modulate op.
    expect(toSharpModulate({ ...NEUTRAL_PARAMS, black: 20, sharpen: 5 })).toBeUndefined();
  });

  it("toSharpModulate returns clamped color params when non-neutral", () => {
    expect(toSharpModulate({ ...NEUTRAL_PARAMS, hue: 15, saturation: 1.5 })).toEqual({
      hue: 15, saturation: 1.5, brightness: 1,
    });
  });

  it("toSharpLevels maps [black,white]→[0,255]; neutral & degenerate → undefined", () => {
    expect(toSharpLevels(NEUTRAL_PARAMS)).toBeUndefined(); // 0..255 = identity
    // black=51, white=204 → range 153 → a = 255/153 ≈ 1.6667, b = -51*a ≈ -85
    const lv = toSharpLevels({ ...NEUTRAL_PARAMS, black: 51, white: 204 });
    expect(lv).toBeDefined();
    expect(lv!.a).toBeCloseTo(255 / 153, 5);
    expect(lv!.b).toBeCloseTo(-51 * (255 / 153), 5);
    // clampParams guarantees white ≥ 191 > black (≤64), so the degenerate guard
    // (white ≤ black) is unreachable via the public fn — clamp prevents inversion.
    // A hostile {black:64, white:64} has white clamped up to 191 → still a valid range.
    expect(toSharpLevels({ ...NEUTRAL_PARAMS, black: 64, white: 64 } as never)).toBeDefined();
  });

  it("toCssFilter emits color functions; adds contrast only when levels non-neutral", () => {
    expect(toCssFilter({ hue: 12, sat: 150, bri: 90 } as ColorGradeState)).toBe(
      "hue-rotate(12deg) saturate(150%) brightness(90%)"
    );
    // levels black=51 white=204 → contrast ≈ round(255/153*100) = 167%
    expect(
      toCssFilter({ hue: 0, sat: 100, bri: 100, black: 51, white: 204 } as ColorGradeState)
    ).toBe("hue-rotate(0deg) saturate(100%) brightness(100%) contrast(167%)");
  });
});
