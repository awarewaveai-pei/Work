/**
 * canvas-fit — pure display-scale math for the /tools/canvas editor (React-free so it can be
 * unit-tested without pulling in fabric/react).
 */

/**
 * Display scale that fits a realW×realH document inside availW×availH (the visible workspace), so
 * the on-screen canvas never exceeds one viewport (Banner Studio behaviour). Export stays at full
 * realW/realH. Capped at 8× so tiny documents can still fill the workspace; floored at 0.02 so a
 * zero/degenerate available size never yields a non-positive (or NaN-propagating) scale.
 */
export function fitDisplayScale(realW: number, realH: number, availW: number, availH: number): number {
  return Math.max(0.02, Math.min(8, availW / Math.max(1, realW), availH / Math.max(1, realH)));
}

export type SizeUnit = "cm" | "mm" | "px";

/**
 * Convert a length between cm / mm / px at a given DPI, preserving the physical (or pixel) size.
 * Used when the 畫布尺寸 unit dropdown changes so a 1234px value doesn't become 1234cm (which would
 * blow the artboard to ~146k px). px is exact (rounded); cm/mm keep 2 decimals.
 */
export function convertUnit(v: number, from: SizeUnit, to: SizeUnit, dpi: number): number {
  if (from === to || !Number.isFinite(v)) return v;
  const px = from === "px" ? v : (((from === "mm" ? v / 10 : v) * dpi) / 2.54);
  if (to === "px") return Math.round(px);
  const cm = (px / dpi) * 2.54;
  return +(to === "mm" ? cm * 10 : cm).toFixed(2);
}
