// Font choices for the Theme Editor (operator 2026-10-25). A font token only ever holds one of
// these stacks: font stacks need quotes and commas, which the generic SAFE_VALUE_RE refuses, so
// the API accepts a font value only by exact match against this list (isAllowedFontValue).
// A choice with `google` is loaded from Google Fonts only while a saved or previewed token uses it.

export type FontKind = "text" | "mono";
export type FontChoice = { id: string; label: string; kind: FontKind; stack: string; google?: string };

export const FONT_CHOICES: FontChoice[] = [
  // The stack globals.css has always shipped ('Inter' was never loaded, so this is the system UI font).
  { id: "system", label: "System", kind: "text", stack: `'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` },
  { id: "inter", label: "Inter", kind: "text", stack: `"Inter", -apple-system, "Segoe UI", sans-serif`, google: "Inter:wght@400;500;600;700;800" },
  { id: "noto-sans-tc", label: "Noto Sans TC", kind: "text", stack: `"Noto Sans TC", -apple-system, "Segoe UI", sans-serif`, google: "Noto+Sans+TC:wght@400;500;600;700;800" },
  { id: "noto-serif-tc", label: "Noto Serif TC", kind: "text", stack: `"Noto Serif TC", Georgia, serif`, google: "Noto+Serif+TC:wght@400;500;600;700;800" },
  { id: "source-serif", label: "Source Serif 4", kind: "text", stack: `"Source Serif 4", Georgia, serif`, google: "Source+Serif+4:wght@400;500;600;700;800" },
  { id: "roboto", label: "Roboto", kind: "text", stack: `"Roboto", -apple-system, "Segoe UI", sans-serif`, google: "Roboto:wght@400;500;700;800" },
  { id: "system-mono", label: "System Mono", kind: "mono", stack: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` },
  { id: "jetbrains-mono", label: "JetBrains Mono", kind: "mono", stack: `"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`, google: "JetBrains+Mono:wght@400;500;700" },
  { id: "ibm-plex-mono", label: "IBM Plex Mono", kind: "mono", stack: `"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`, google: "IBM+Plex+Mono:wght@400;500;700" },
];

// The heading font may also follow the body font.
export const SAME_AS_BODY = "var(--font-family-base)";

// Which choices each font token offers.
export const FONT_TOKENS: Record<string, { kind: FontKind; extra?: string[] }> = {
  "--font-family-base": { kind: "text" },
  "--font-family-heading": { kind: "text", extra: [SAME_AS_BODY] },
  "--font-family-mono": { kind: "mono" },
};

export const fontChoicesFor = (token: string): FontChoice[] =>
  FONT_CHOICES.filter((c) => c.kind === FONT_TOKENS[token]?.kind);

export const isAllowedFontValue = (token: string, value: string): boolean =>
  token in FONT_TOKENS &&
  (fontChoicesFor(token).some((c) => c.stack === value) || (FONT_TOKENS[token].extra ?? []).includes(value));

// One Google Fonts stylesheet URL for the given stacks, or null when none of them is a web font.
export function googleFontsHref(stacks: string[]): string | null {
  const families = [...new Set(FONT_CHOICES.filter((c) => c.google && stacks.includes(c.stack)).map((c) => c.google!))];
  return families.length ? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap` : null;
}
