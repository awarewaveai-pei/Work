import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ALL_TOKEN_GROUPS, COLOR_GROUPS, TYPOGRAPHY_GROUPS } from "../tokens";

// THEME_ARCHITECTURE_APPEARANCE.md: every editable token's default in tokens.ts must equal its
// factory value in globals.css :root, or "Reset" in the Theme Editor restores a different look.
const css = fs.readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const rootValues = new Map(
  [...rootBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);

describe("theme tokens", () => {
  const tokens = ALL_TOKEN_GROUPS.flatMap((g) => g.tokens);

  it("every editable token has the same default as globals.css :root", () => {
    const mismatched = tokens
      .filter((t) => rootValues.get(t.name)?.toLowerCase() !== t.default.toLowerCase())
      .map((t) => `${t.name}: tokens.ts=${t.default} globals.css=${rootValues.get(t.name) ?? "(missing)"}`);
    expect([...new Set(mismatched)]).toEqual([]);
  });

  it("each token is editable in exactly one place", () => {
    const names = tokens.map((t) => t.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  // Operator 2026-10-24: the Colors tab holds only colors and the Typography & Size tab holds none.
  it("the Colors tab holds only colors and the Typography & Size tab holds no color", () => {
    // var(--x) counts only when --x is itself a literal color in the Colors tab (--accent-text → --accent)
    const literal = (v: string) => /^(#|rgba?\(|hsla?\(|transparent$)/i.test(v);
    const colorDefaults = new Map(COLOR_GROUPS.flatMap((g) => g.tokens).map((t) => [t.name, t.default]));
    // ...and color-mix(in srgb, var(--x) N%, transparent) when --x is such a color too
    const ref = (v: string) => /^var\((--[a-z0-9-]+)\)$/.exec(v)?.[1] ?? /^color-mix\(in srgb, var\((--[a-z0-9-]+)\) \d+%, transparent\)$/.exec(v)?.[1] ?? "";
    const isColor = (v: string): boolean => literal(v) || (ref(v) !== "" && isColor(colorDefaults.get(ref(v)) ?? ""));
    expect(COLOR_GROUPS.flatMap((g) => g.tokens).filter((t) => t.type !== "color" || !isColor(t.default)).map((t) => t.name)).toEqual([]);
    expect(TYPOGRAPHY_GROUPS.flatMap((g) => g.tokens).filter((t) => t.type !== "text" || isColor(t.default)).map((t) => t.name)).toEqual([]);
  });

  // Operator 2026-10-25: the Button Primary group must move every primary button. .btn-primary
  // painted --accent while 23 inline buttons painted --btn-primary-bg — one button, two sources.
  it(".btn-primary paints with the Button Primary tokens, not the accent", () => {
    const rule = (sel: string) => css.match(new RegExp(`\\n${sel.replace(/[.:]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    expect(rule(".btn-primary")).toMatch(/background:\s*var\(--btn-primary-bg\)/);
    expect(rule(".btn-primary:hover")).toMatch(/background:\s*var\(--btn-primary-hover\)/);
    expect(rule(".btn-primary") + rule(".btn-primary:hover")).not.toMatch(/var\(--accent(-hover)?\)/);
  });

  // Operator 2026-10-25: --tab-bg-active, --btn-primary-bg (on .btn-primary) and --sidebar-active-bar
  // (no link ever carried .active) sat in the Colors tab doing nothing. Every color knob must be read
  // by some screen code outside lib/theme.
  it("every Colors-tab token is read by screen code", () => {
    const ROOT = path.resolve(__dirname, "../../..");
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return e.name === "node_modules" || e.name === "__tests__" ? [] : walk(p);
      return /\.(tsx?|css)$/.test(e.name) ? [p] : [];
    });
    const src = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)))
      .filter((f) => !f.replace(/\\/g, "/").includes("/lib/theme/"))
      .map((f) => fs.readFileSync(f, "utf8")).join("\n");
    const unused = COLOR_GROUPS.flatMap((g) => g.tokens.map((t) => t.name))
      .filter((n) => !new RegExp(`var\\(${n}[,)]`).test(src));
    expect(unused).toEqual([]);
  });

  it("the sidebar section header color and size are editable", () => {
    const names = tokens.map((t) => t.name);
    expect(names).toContain("--sidebar-section-label");
    expect(names).toContain("--sidebar-section-label-size");
  });
});
