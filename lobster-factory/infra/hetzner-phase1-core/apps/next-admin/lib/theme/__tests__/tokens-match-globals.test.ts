import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { ALL_TOKEN_GROUPS } from "../tokens";

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

  it("the sidebar section header color and size are editable", () => {
    const names = tokens.map((t) => t.name);
    expect(names).toContain("--sidebar-section-label");
    expect(names).toContain("--sidebar-section-label-size");
  });
});
