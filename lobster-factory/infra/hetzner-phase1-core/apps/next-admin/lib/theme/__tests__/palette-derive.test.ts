import { describe, expect, it } from "vitest";
import { PALETTES } from "../palettes";
import { allRoleMaps, contrast, paletteToTokens } from "../palette-derive";
import { SAFE_VALUE_RE, VALID_TOKEN_NAMES } from "../tokens";

// Operator 2026-10-25: four-color palettes become theme presets by one rule, never by hand. The
// editor reaches all 24 role maps per palette (Shuffle / swap), so every check runs over all of them.
const ALL = PALETTES.flatMap((p) => allRoleMaps(p.colors).map((roles) => ({ id: p.id, ...paletteToTokens(p.colors, roles) })));

describe("palette presets", () => {
  it("palette ids are unique, no palette is listed twice, no palette repeats a color", () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    const keys = PALETTES.map((p) => p.colors.join().toLowerCase());
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
    expect(PALETTES.filter((p) => new Set(p.colors.map((c) => c.toLowerCase())).size !== 4).map((p) => p.id)).toEqual([]);
  });

  // Each text token checked against every surface it is drawn on (critic 2026-10-25 M1/M2).
  it("every arrangement keeps each text readable on each surface it sits on", () => {
    const pairs: [string, string[]][] = [
      ["--text-primary", ["--body-bg", "--card-bg", "--bg-subtle", "--bg-hover", "--surface-2"]],
      ["--text-muted", ["--body-bg", "--card-bg", "--bg-subtle", "--bg-hover"]],
      ["--accent-text", ["--body-bg", "--card-bg", "--bg-subtle", "--bg-hover"]],
      ["--btn-secondary-text", ["--btn-secondary-bg"]],
      ["--sidebar-text", ["--sidebar-bg"]],
      ["--sidebar-text-hover", ["--sidebar-hover"]],
      ["--sidebar-text-active", ["--sidebar-active-bg"]],
      ["--sidebar-section-label-hover", ["--sidebar-hover"]],
      ["--btn-primary-text", ["--btn-primary-bg"]],
      ["--ai-text", ["--ai-bg"]],
    ];
    const unreadable = ALL.flatMap(({ id, roles, tokens: t, notes }) => [
      ...pairs.flatMap(([ink, surfaces]) => surfaces
        .filter((s) => contrast(t[ink], t[s]) < 4.5)
        .map((s) => `${id} ${roles.bg} ${ink} on ${s} ${contrast(t[ink], t[s]).toFixed(2)}`)),
      // under 7:1 on the page is allowed only when the editor says so
      ...(contrast(t["--text-primary"], t["--body-bg"]) < 7 && !notes.some((n) => n.msg.includes("中間調")) ? [`${id} silent mid-tone`] : []),
    ]);
    expect(unreadable).toEqual([]);
  });

  // Operator 2026-10-25: palette colors are surfaces, never text — every text token is a neutral grey.
  it("no arrangement paints text in a palette color", () => {
    const textTokens = ["--accent-text", "--text-primary", "--text-muted", "--text-secondary", "--sidebar-text", "--sidebar-text-hover",
      "--sidebar-text-active", "--sidebar-section-label", "--sidebar-section-label-hover", "--btn-primary-text", "--btn-secondary-text",
      "--tab-color", "--tab-color-hover", "--tab-color-active", "--ai-text"];
    const isGrey = (hex: string) => hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
    expect(ALL.flatMap(({ id, tokens: t }) => textTokens.filter((n) => !isGrey(t[n])).map((n) => `${id} ${n}=${t[n]}`))).toEqual([]);
  });

  it("each palette has 24 distinct arrangements", () => {
    for (const p of PALETTES) expect(new Set(allRoleMaps(p.colors).map((r) => JSON.stringify(r))).size).toBe(24);
  });

  it("every palette's start arrangement uses each of its four colors once", () => {
    expect(PALETTES.filter((p) => {
      try { paletteToTokens(p.colors, p.start); return false; } catch { return true; }
    }).map((p) => p.id)).toEqual([]);
  });

  it("a role map that reuses a color is refused", () => {
    const [c0, c1, c2] = PALETTES[0].colors;
    expect(() => paletteToTokens(PALETTES[0].colors, { bg: c0, sidebar: c0, accent: c1, soft: c2 })).toThrow();
  });

  it("presets only set editable tokens with values the theme API accepts, and leave status colors alone", () => {
    for (const { tokens: t } of ALL) {
      expect(Object.keys(t).filter((n) => !VALID_TOKEN_NAMES.has(n))).toEqual([]);
      expect(Object.entries(t).filter(([, v]) => !SAFE_VALUE_RE.test(v))).toEqual([]);
      expect(Object.keys(t).filter((n) => /^--(green|red|yellow|severity-|status-)/.test(n))).toEqual([]);
    }
  });
});
