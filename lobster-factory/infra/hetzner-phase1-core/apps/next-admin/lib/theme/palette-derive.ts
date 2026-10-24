// Turns one four-color palette (lib/theme/palettes.ts) into the editable color tokens of
// lib/theme/tokens.ts. Operator 2026-10-25: palette colors are surfaces, never text, and the four
// colors can go to any of the four surface roles (page, sidebar, accent, AI box) — 24 arrangements
// per palette. defaultRoles() is only the starting pick: page = lightest, accent = most saturated,
// sidebar = the remaining one farthest from the page. Every text token is a neutral grey chosen for
// the surface it sits on (WCAG 4.5:1). Status / severity colors are never touched.

import { VALID_TOKEN_NAMES } from "./tokens";

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
const rgbToHex = (c: Rgb) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// Straight sRGB blend: t=0 → a, t=1 → b.
export const mix = (a: string, b: string, t: number) => {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((v, i) => v + (cb[i] - v) * t) as Rgb);
};

export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const chroma = (hex: string) => {
  const c = hexToRgb(hex);
  return Math.max(...c) - Math.min(...c);
};

// CIE76 color difference in Lab. Luminance contrast alone calls orange-on-cream "invisible";
// whether an accent stands out from the page is a question of hue and lightness together.
const toLab = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
};
export const deltaE = (a: string, b: string) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]));

const rgba = (hex: string, alpha: number) => `rgba(${hexToRgb(hex).join(",")},${alpha})`;

export type Note = { level: "risk"; msg: string };
export type Roles = { bg: string; sidebar: string; accent: string; soft: string };
export const ROLE_KEYS = ["bg", "sidebar", "accent", "soft"] as const;

export type Derived = {
  mode: "light" | "dark";
  roles: Roles;
  tokens: Record<string, string>;
  notes: Note[];
};

// Neutral ink for a surface: near-black or white, whichever reads better. Pure black is the last
// resort — black or white always reaches 4.5:1 on any color.
const inkOn = (surface: string) => {
  const best = contrast("#111111", surface) >= contrast("#ffffff", surface) ? "#111111" : "#ffffff";
  return contrast(best, surface) >= 4.5 ? best : "#000000";
};

// The softest neutral grey from `ink` that still reads at `min` on every one of `surfaces`.
const softGrey = (ink: string, surfaces: string[], min: number) => {
  const away = ink === "#ffffff" ? "#000000" : "#ffffff";
  for (let t = 0.6; t > 0; t -= 0.05) {
    const c = mix(ink, away, t);
    if (surfaces.every((s) => contrast(c, s) >= min)) return c;
  }
  return ink;
};

// One text color is only guaranteed on the surfaces it was chosen for: pick the neutral ink whose
// worst contrast across all of them is highest (critic 2026-10-25 M1: page-only choice failed on cards).
const inkOnAll = (surfaces: string[]) =>
  ["#111111", "#ffffff", "#000000"].reduce((best, c) =>
    Math.min(...surfaces.map((s) => contrast(c, s))) > Math.min(...surfaces.map((s) => contrast(best, s))) ? c : best);

export function defaultRoles(colors: readonly string[]): Roles {
  const byLight = [...colors].map((c) => c.toLowerCase()).sort((a, b) => luminance(b) - luminance(a));
  const bg = luminance(byLight[0]) >= 0.5 ? byLight[0] : byLight[3];
  const rest = byLight.filter((c) => c !== bg);
  const accent = [...rest].sort((a, b) => chroma(b) - chroma(a))[0];
  const [sidebar, soft] = rest.filter((c) => c !== accent).sort((a, b) => deltaE(b, bg) - deltaE(a, bg));
  return { bg, sidebar, accent, soft };
}

export function paletteToTokens(colors: readonly string[], roles: Roles = defaultRoles(colors)): Derived {
  const given = [...colors].map((c) => c.toLowerCase()).sort().join();
  const used = ROLE_KEYS.map((k) => roles[k].toLowerCase()).sort().join();
  if (given !== used) throw new Error("palette-derive: roles must use each palette color exactly once");
  const { bg, sidebar, accent, soft } = roles;
  const notes: Note[] = [];

  // Surfaces move AWAY from the ink, never toward it: a dark page gets darker cards and hovers.
  const mode = inkOn(bg) === "#ffffff" ? "dark" : "light";
  const card = mode === "light" ? mix(bg, "#ffffff", 0.6) : mix(bg, "#000000", 0.15);
  const darker = mode === "light" ? "#111111" : "#000000";
  const subtle = mix(card, darker, 0.03);
  const hover = mix(card, darker, 0.06);
  const text = inkOnAll([bg, card, subtle, hover]);
  const line = mix(card, text, 0.12);
  const muted = softGrey(text, [bg, card, subtle, hover], 4.5);
  const sidebarInk = inkOn(sidebar);
  const onAccent = inkOn(accent);

  if (deltaE(accent, bg) < 30) {
    notes.push({ level: "risk", msg: `按鈕色 ${accent} 和頁面太接近（色差 ${deltaE(accent, bg).toFixed(0)}），按鈕和選中標記會不明顯` });
  }
  if (contrast(text, bg) < 7) {
    notes.push({ level: "risk", msg: `頁面 ${bg} 是中間調，內文對比只有 ${contrast(text, bg).toFixed(1)}:1，長文閱讀吃力` });
  }
  if (deltaE(sidebar, bg) < 12) {
    notes.push({ level: "risk", msg: `側欄 ${sidebar} 和頁面幾乎同色，分不出區塊` });
  }

  const tokens: Record<string, string> = {
    "--accent": accent,
    // words in the accent role (links, highlights) stay neutral like all text; the accent shows in fills
    "--accent-text": text,
    "--accent-hover": mix(accent, onAccent === "#ffffff" ? "#ffffff" : "#000000", 0.15),
    "--btn-primary-bg": accent,
    "--btn-primary-hover": mix(accent, onAccent === "#ffffff" ? "#000000" : "#ffffff", 0.12),
    "--btn-primary-text": onAccent,
    "--text-primary": text,
    "--text-muted": muted,
    "--text-secondary": muted,
    "--body-bg": bg,
    "--card-bg": card,
    "--bg-subtle": subtle,
    "--bg-hover": hover,
    "--surface-2": subtle,
    "--sidebar-bg": sidebar,
    "--sidebar-border": mix(sidebar, sidebarInk, 0.12),
    "--sidebar-text": softGrey(sidebarInk, [sidebar], 4.5),
    "--sidebar-text-hover": sidebarInk,
    "--sidebar-text-active": sidebarInk,
    "--sidebar-active-bar": accent,
    "--sidebar-section-label": softGrey(sidebarInk, [sidebar], 3),
    "--card-border": line,
    "--border": line,
    "--border-subtle": mix(card, text, 0.07),
    "--btn-secondary-bg": card,
    "--btn-secondary-border": mix(card, text, 0.2),
    "--btn-secondary-text": text,
    "--tab-color": muted,
    "--tab-color-hover": text,
    "--tab-color-active": text,
    "--tab-bg": "transparent",
    "--tab-bg-hover": rgba(accent, 0.08),
    "--tab-bg-active": "transparent",
    "--tab-border-active": accent,
    "--tab-bar-border": line,
    "--code-bg": mode === "light" ? "#16181b" : mix(bg, "#000000", 0.4),
    "--ai-bg": soft,
    "--ai-text": inkOn(soft),
  };
  for (const name of Object.keys(tokens)) {
    if (!VALID_TOKEN_NAMES.has(name)) throw new Error(`palette-derive emits unknown token ${name}`);
  }
  return { mode, roles, tokens, notes };
}

// Every way to hand the four colors to the four roles (4! = 24). The Theme Editor shuffles these.
export function allRoleMaps(colors: readonly string[]): Roles[] {
  const perms: string[][] = [];
  const walk = (left: string[], acc: string[]) =>
    left.length ? left.forEach((c, i) => walk([...left.slice(0, i), ...left.slice(i + 1)], [...acc, c])) : perms.push(acc);
  walk(colors.map((c) => c.toLowerCase()), []);
  return perms.map(([bg, sidebar, accent, soft]) => ({ bg, sidebar, accent, soft }));
}
