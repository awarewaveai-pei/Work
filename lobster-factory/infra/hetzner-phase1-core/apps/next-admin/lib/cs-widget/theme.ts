// 清新自然 theme derivation (_uiux_design.md §2.6): one CIS brand seed colour → the full palette.
// OKLCH lightness ladder with low-chroma neutrals (so ANY brand reads "fresh-natural", never a raw
// vivid dump) and the primary's lightness LOCKED so on-primary text always clears WCAG-AA. A near-
// grey seed (low saturation) degrades to a neutral grey scale. PURE — unit-tested.

export type WidgetTheme = Record<string, string>;

/** Hue (0..360) + saturation (0..1) from a #rrggbb hex. */
export function hexToHueSat(hex: string): { h: number; s: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 150, s: 0.3 }; // fallback: sage-ish
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const L = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * L - 1));
    if (mx === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s };
}

function ok(L: number, C: number, H: number): string {
  return `oklch(${L} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

/**
 * Derive the widget CSS-variable palette from a brand seed. The primary lightness is fixed
 * (light .54 / dark .70) so `--on-primary` text contrast is guaranteed regardless of the seed.
 */
export function deriveTheme(seedHex: string, mode: "light" | "dark" = "light"): WidgetTheme {
  const { h, s } = hexToHueSat(seedHex);
  const c = Math.min(Math.max(s, 0.04), 1); // chroma multiplier; near-grey seeds stay neutral

  if (mode === "dark") {
    return {
      "--bg": ok(0.16, 0.014 * c, h),
      "--surface": ok(0.2, 0.018 * c, h),
      "--overlay": ok(0.26, 0.03 * c, h),
      "--sage-50": ok(0.3, 0.04 * c, h),
      "--sage-200": ok(0.4, 0.06 * c, h),
      "--sage-400": ok(0.62, 0.1 * c, h),
      "--primary": ok(0.7, 0.12 * c, h),
      "--sage-800": ok(0.8, 0.07 * c, h),
      "--ink": "#F0EDE8",
      "--ink-2": "#B8B2A8",
      "--muted": "#8A8278",
      "--border": ok(0.32, 0.02 * c, h),
      "--on-primary": "#16140F",
      "--error": "#D98A8A",
    };
  }
  return {
    "--bg": ok(0.965, 0.012 * c, h),
    "--surface": ok(0.982, 0.008 * c, h),
    "--overlay": ok(0.935, 0.022 * c, h),
    "--sage-50": ok(0.93, 0.04 * c, h),
    "--sage-200": ok(0.83, 0.065 * c, h),
    "--sage-400": ok(0.69, 0.1 * c, h),
    "--primary": ok(0.54, 0.115 * c, h),
    "--sage-800": ok(0.4, 0.085 * c, h),
    "--ink": "#2C2926",
    "--ink-2": "#736B63",
    "--muted": "#A89F96",
    "--border": ok(0.9, 0.018 * c, h),
    "--on-primary": "#FBF8F4",
    "--error": "#C06060",
  };
}

/** Default "晨間鼠尾草" sage seed when a tenant has no CIS primary colour set. */
export const DEFAULT_SEED = "#547C65";
