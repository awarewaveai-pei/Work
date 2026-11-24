// Article-cover text settings (K24). One layout for every site; each site will set these (stored in its content
// defaults, wired by K25), so input is untrusted: anything that is not a #rrggbb colour or a known font falls back.

export type CoverFont = "sans" | "serif";

export interface CoverSettings {
  bandColor: string;
  titleColor: string;
  subtitleColor: string;
  font: CoverFont;
}

export const DEFAULT_COVER_SETTINGS: Readonly<CoverSettings> = Object.freeze({
  bandColor: "#1f2430",
  titleColor: "#ffffff",
  subtitleColor: "#c9ced8",
  font: "sans",
});

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v: unknown, fallback: string): string => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);

/** Field by field: a bad field falls back alone, the good ones are kept. */
export function parseCoverSettings(raw: unknown): CoverSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_COVER_SETTINGS;
  return {
    bandColor: color(o.bandColor, d.bandColor),
    titleColor: color(o.titleColor, d.titleColor),
    subtitleColor: color(o.subtitleColor, d.subtitleColor),
    font: o.font === "serif" || o.font === "sans" ? o.font : d.font,
  };
}
