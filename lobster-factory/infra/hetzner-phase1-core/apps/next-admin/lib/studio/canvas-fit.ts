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
