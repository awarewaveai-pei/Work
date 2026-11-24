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

/** K25: the site settings save refuses a bad value instead of storing a fallback the person never chose. null = valid
 *  (a missing field is valid: it reads as the default). */
export function coverSettingsError(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "cover 必須是物件";
  const o = raw as Record<string, unknown>;
  for (const k of ["bandColor", "titleColor", "subtitleColor"] as const) {
    if (o[k] !== undefined && !(typeof o[k] === "string" && HEX.test(o[k] as string))) return `cover.${k} 必須是 #rrggbb 色碼`;
  }
  if (o.font !== undefined && o.font !== "sans" && o.font !== "serif") return "cover.font 只能是 sans 或 serif";
  return null;
}

/** A client's brand colour as the cover's band (the site settings' starting point): the title white on a dark band,
 *  the default band colour on a light one, so it stays readable. */
export function brandCoverSettings(brandColor: string): CoverSettings {
  if (!HEX.test(brandColor)) return { ...DEFAULT_COVER_SETTINGS };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(brandColor.slice(i, i + 2), 16));
  const light = 0.299 * r + 0.587 * g + 0.114 * b > 160;
  return { bandColor: brandColor.toLowerCase(), titleColor: light ? DEFAULT_COVER_SETTINGS.bandColor : "#ffffff",
    subtitleColor: light ? "#3a4150" : DEFAULT_COVER_SETTINGS.subtitleColor, font: DEFAULT_COVER_SETTINGS.font };
}

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
