"use client";

/**
 * ColorGradePanel [1-f] — the UI block for the composable image-edit seam.
 *
 * Controlled component: the parent owns the ColorGradeState (via useColorGrade) so it
 * can both (a) apply the live CSS preview to its own <img> and (b) hand the derived
 * ColorGradeParams to OutputTrackBar for the server-side bake. This file is the ONLY
 * place React touches the color-grade seam — color-grade.ts stays React-free so the
 * Sharp pipelines can import it on the server (see color-grade.ts header).
 *
 * Sliders are data-driven from GRADE_LIMITS (single source of truth) so adding a block
 * to color-grade.ts + one row here is the whole UI change. Three groups:
 *   色彩   : hue / saturation / brightness   (Sharp .modulate)
 *   色階   : black / white / gamma            (Sharp .linear + .gamma — "Levels")
 *   銳利度 : sharpen                          (Sharp .sharpen)
 */
import { useCallback, useMemo, useState } from "react";
import {
  GRADE_LIMITS,
  NEUTRAL_STATE,
  stateToParams,
  toCssFilter,
  isNeutralState,
  type ColorGradeState,
  type ColorGradeParams,
} from "@/lib/studio/color-grade";

/** State + derived values for the color-grade UI. Lives in the component layer. */
export function useColorGrade() {
  const [state, setState] = useState<ColorGradeState>(NEUTRAL_STATE);
  const set = useCallback(
    (key: keyof ColorGradeState, value: number) => setState((s) => ({ ...s, [key]: value })),
    []
  );
  const reset = useCallback(() => setState(NEUTRAL_STATE), []);
  const params = useMemo<ColorGradeParams>(() => stateToParams(state), [state]);
  const cssFilter = useMemo(() => toCssFilter(state), [state]);
  const neutral = useMemo(() => isNeutralState(state), [state]);
  return { state, set, reset, params, cssFilter, neutral };
}

type SliderRow = {
  key: keyof ColorGradeState;
  label: string;
  min: number;
  max: number;
  step: number;
  /** how to render the current value */
  fmt: (v: number) => string;
};

const GROUPS: { title: string; rows: SliderRow[] }[] = [
  {
    title: "色彩 Color",
    rows: [
      { key: "hue", label: "色相 Hue", min: GRADE_LIMITS.hue.min, max: GRADE_LIMITS.hue.max, step: 1, fmt: (v) => `${v}°` },
      { key: "sat", label: "飽和 Saturation", min: GRADE_LIMITS.sat.min, max: GRADE_LIMITS.sat.max, step: 1, fmt: (v) => `${v}%` },
      { key: "bri", label: "亮度 Brightness", min: GRADE_LIMITS.bri.min, max: GRADE_LIMITS.bri.max, step: 1, fmt: (v) => `${v}%` },
    ],
  },
  {
    title: "色階 Levels",
    rows: [
      { key: "black", label: "黑點 Black point", min: GRADE_LIMITS.black.min, max: GRADE_LIMITS.black.max, step: 1, fmt: (v) => `${v}` },
      { key: "white", label: "白點 White point", min: GRADE_LIMITS.white.min, max: GRADE_LIMITS.white.max, step: 1, fmt: (v) => `${v}` },
      { key: "gamma", label: "中間調 Gamma", min: GRADE_LIMITS.gamma.min, max: GRADE_LIMITS.gamma.max, step: 1, fmt: (v) => `${(v / 100).toFixed(2)}` },
    ],
  },
  {
    title: "銳利度 Sharpness",
    rows: [
      { key: "sharpen", label: "銳利化 Sharpen", min: GRADE_LIMITS.sharpen.min, max: GRADE_LIMITS.sharpen.max, step: 0.5, fmt: (v) => (v === 0 ? "關" : `${v}`) },
    ],
  },
  {
    title: "色彩平衡 Color Balance",
    rows: [
      { key: "balCR", label: "青 ↔ 紅", min: GRADE_LIMITS.balCR.min, max: GRADE_LIMITS.balCR.max, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}` },
      { key: "balMG", label: "洋紅 ↔ 綠", min: GRADE_LIMITS.balMG.min, max: GRADE_LIMITS.balMG.max, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}` },
      { key: "balYB", label: "黃 ↔ 藍", min: GRADE_LIMITS.balYB.min, max: GRADE_LIMITS.balYB.max, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}` },
    ],
  },
];

type Props = {
  state: ColorGradeState;
  onSet: (key: keyof ColorGradeState, value: number) => void;
  onReset: () => void;
  neutral: boolean;
};

export default function ColorGradePanel({ state, onSet, onReset, neutral }: Props) {
  return (
    <div className="build-panel" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong style={{ fontSize: 13 }}>🎨 調色 / 修圖</strong>
        <button
          className="btn-secondary"
          style={{ fontSize: 12 }}
          disabled={neutral}
          onClick={onReset}
          title="全部回到中性值"
        >
          重設
        </button>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, opacity: 0.6, letterSpacing: 0.4 }}>{group.title}</span>
          {group.rows.map((row) => {
            const value = (state[row.key] ?? 0) as number;
            return (
              <label key={row.key} style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{row.label}</span>
                  <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{row.fmt(value)}</span>
                </span>
                <input
                  type="range"
                  min={row.min}
                  max={row.max}
                  step={row.step}
                  value={value}
                  onChange={(e) => onSet(row.key, Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </label>
            );
          })}
        </div>
      ))}

      <p style={{ fontSize: 11, opacity: 0.55, margin: 0, lineHeight: 1.4 }}>
        預覽色彩可能與最終輸出略有差異（銳利度／中間調無法即時預覽），下載檔案以實際輸出為準。
      </p>
    </div>
  );
}
